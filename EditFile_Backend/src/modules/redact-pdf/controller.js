import { asyncHandler } from '../../middleware/error.middleware.js';
import { redactPdfBuffer } from './service.js';

export const redactPdf = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const { outputBuffer, outputName } = await redactPdfBuffer({
    pdfBuffer: req.file.buffer,
    originalName: req.file.originalname,
    redactions: req.body?.redactions,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
  res.setHeader('X-Processed-File-Name', outputName);
  res.send(outputBuffer);
});

export default {
  redactPdf,
};
