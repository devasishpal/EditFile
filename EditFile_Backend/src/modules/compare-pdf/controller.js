import { asyncHandler } from '../../middleware/error.middleware.js';
import { buildComparePdfReport } from './service.js';

const getFieldFile = (req, fieldName) => {
  if (!req.files || Array.isArray(req.files)) {
    return null;
  }

  const field = req.files[fieldName];
  if (!Array.isArray(field) || field.length === 0) {
    return null;
  }

  return field[0];
};

export const comparePdf = asyncHandler(async (req, res) => {
  const originalFile = getFieldFile(req, 'originalFile');
  const modifiedFile = getFieldFile(req, 'modifiedFile');

  if (!originalFile || !modifiedFile) {
    return res.status(400).json({
      success: false,
      error: 'Both originalFile and modifiedFile are required',
    });
  }

  const { outputBuffer, outputName } = await buildComparePdfReport({
    originalBuffer: originalFile.buffer,
    originalName: originalFile.originalname,
    modifiedBuffer: modifiedFile.buffer,
    modifiedName: modifiedFile.originalname,
    summary: req.body?.summary,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
  res.setHeader('X-Processed-File-Name', outputName);
  res.send(outputBuffer);
});

export default {
  comparePdf,
};
