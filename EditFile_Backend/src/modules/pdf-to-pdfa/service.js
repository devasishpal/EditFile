import fs from 'fs/promises';
import path from 'path';
import { downloadFile, uploadFile, generateS3Key } from '../../config/s3.js';
import { updateJobStatus, completeJob, failJob } from '../../services/database.service.js';
import { logger } from '../../utils/logger.js';
import { ensureGhostscriptDependency, runCliCommand } from '../../utils/pdf-cli.js';
import { createTempWorkspace, removePathSafe } from '../../utils/workspace.js';
import { sanitizeBaseName } from '../../utils/file-name.js';

const PDF_TO_PDFA_TIMEOUT_MS = Number.parseInt(
  process.env.PDF_TO_PDFA_TIMEOUT_MS || '900000',
  10
);
const PDF_SIGNATURE = '%PDF-';
const PDFA_VERSION_LEVEL = {
  'pdfa-1': 1,
  'pdfa-2': 2,
  'pdfa-3': 3,
};
const PDFA_VERSION_LABEL = {
  'pdfa-1': '1',
  'pdfa-2': '2',
  'pdfa-3': '3',
};
const ICC_PROFILE_CANDIDATES = [
  path.join('iccprofiles', 'default_rgb.icc'),
  path.join('iccprofiles', 'srgb.icc'),
  path.join('iccprofiles', 'esrgb.icc'),
  path.join('iccprofiles', 'ps_rgb.icc'),
];

const isPdfBuffer = (buffer) =>
  Boolean(buffer?.length >= PDF_SIGNATURE.length)
  && buffer.subarray(0, PDF_SIGNATURE.length).toString('utf8') === PDF_SIGNATURE;

const escapePostScriptString = (value = '') =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const getGhostscriptRoot = (ghostscriptPath) => path.resolve(path.dirname(ghostscriptPath), '..');

const findReadableFile = async (candidates) => {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
};

const resolveRgbIccProfile = async (ghostscriptPath) => {
  const ghostscriptRoot = getGhostscriptRoot(ghostscriptPath);
  const absoluteCandidates = ICC_PROFILE_CANDIDATES.map((relativePath) =>
    path.join(ghostscriptRoot, relativePath)
  );
  const profilePath = await findReadableFile(absoluteCandidates);

  if (!profilePath) {
    throw new Error('Ghostscript RGB ICC profile was not found.');
  }

  return profilePath;
};

const createPdfaDefinitionFile = async ({
  targetPath,
  title,
  iccProfilePath,
}) => {
  const normalizedTitle = escapePostScriptString(title || 'Document');
  const normalizedIccPath = escapePostScriptString(iccProfilePath);

  const contents = `%!
[ /Title (${normalizedTitle})
  /DOCINFO pdfmark

/ICCProfile (${normalizedIccPath}) def

[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark

[{icc_PDFA}
<<
  /N 3
>> /PUT pdfmark
[
{icc_PDFA}
{ICCProfile (r) file} stopped
{
  cleartomark
}
{
  /PUT pdfmark
  [/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
  [{OutputIntent_PDFA} <<
    /Type /OutputIntent
    /S /GTS_PDFA1
    /DestOutputProfile {icc_PDFA}
    /OutputConditionIdentifier (sRGB)
  >> /PUT pdfmark
  [{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
} ifelse
`;

  await fs.writeFile(targetPath, contents, 'utf8');
};

const buildOutputFileName = (originalName, pdfaVersion) => {
  const safeBaseName = sanitizeBaseName(originalName, 'document');
  const versionLabel = PDFA_VERSION_LABEL[pdfaVersion] || '2';
  return `${safeBaseName}-pdfa-${versionLabel}.pdf`;
};

const buildGhostscriptArgs = ({
  inputPath,
  outputPath,
  pdfaDefinitionPath,
  iccProfilePath,
  pdfaVersion,
}) => {
  const versionLevel = PDFA_VERSION_LEVEL[pdfaVersion];

  if (!versionLevel) {
    throw new Error(`Unsupported PDF/A version: ${pdfaVersion}`);
  }

  return [
    `-dPDFA=${versionLevel}`,
    '-dBATCH',
    '-dNOPAUSE',
    '-dNOOUTERSAVE',
    '-dSAFER',
    '-dUseCIEColor',
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
    '-sProcessColorModel=DeviceRGB',
    '-sColorConversionStrategy=RGB',
    '-sDEVICE=pdfwrite',
    '-dPDFACompatibilityPolicy=1',
    `--permit-file-read=${iccProfilePath}`,
    `-sOutputFile=${outputPath}`,
    pdfaDefinitionPath,
    inputPath,
  ];
};

export const processPdfToPdfA = async (jobData) => {
  const {
    jobId,
    fileUrl,
    originalName = 'document.pdf',
    pdfaVersion = 'pdfa-2',
  } = jobData;
  let tempDir = null;

  logger.info(`Starting PDF to PDF/A conversion: ${jobId}, version: ${pdfaVersion}`);

  try {
    await updateJobStatus(jobId, 'processing');

    const { ghostscriptPath } = await ensureGhostscriptDependency();
    if (!ghostscriptPath) {
      throw new Error('Ghostscript is not available to convert files to PDF/A.');
    }

    const sourceBuffer = await downloadFile(fileUrl);
    if (!isPdfBuffer(sourceBuffer)) {
      throw new Error('Uploaded file is not a valid PDF document.');
    }

    const iccProfilePath = await resolveRgbIccProfile(ghostscriptPath);
    tempDir = await createTempWorkspace('editfile-pdf-to-pdfa-');
    const inputPath = path.join(tempDir, 'input.pdf');
    const outputPath = path.join(tempDir, 'output.pdf');
    const pdfaDefinitionPath = path.join(tempDir, 'pdfa-def.ps');

    await fs.writeFile(inputPath, sourceBuffer);
    await createPdfaDefinitionFile({
      targetPath: pdfaDefinitionPath,
      title: originalName,
      iccProfilePath,
    });

    await runCliCommand(
      ghostscriptPath,
      buildGhostscriptArgs({
        inputPath,
        outputPath,
        pdfaDefinitionPath,
        iccProfilePath,
        pdfaVersion,
      }),
      {
        timeoutMs: PDF_TO_PDFA_TIMEOUT_MS,
        captureStdout: false,
      }
    );

    const outputBuffer = await fs.readFile(outputPath);
    if (!isPdfBuffer(outputBuffer)) {
      throw new Error('Ghostscript did not generate a valid PDF/A file.');
    }

    const outputFileName = buildOutputFileName(originalName, pdfaVersion);
    const outputKey = generateS3Key(jobId, outputFileName, 'output');
    const outputUrl = await uploadFile(outputBuffer, outputKey, 'application/pdf');

    await completeJob(jobId, outputUrl, outputBuffer.length);
    await updateJobStatus(jobId, 'completed', {
      metadata: {
        originalName,
        outputFileName,
        pdfaVersion,
        conversionEngine: 'ghostscript',
      },
    });

    logger.info(`PDF to PDF/A completed: ${jobId}, version: ${pdfaVersion}`);

    return {
      success: true,
      jobId,
      outputUrl,
      outputSize: outputBuffer.length,
      outputFileName,
      pdfaVersion,
    };
  } catch (error) {
    logger.error(`PDF to PDF/A failed for job ${jobId}:`, error);
    await failJob(jobId, error.message);
    throw error;
  } finally {
    if (tempDir) {
      await removePathSafe(tempDir);
    }
  }
};

export default { processPdfToPdfA };
