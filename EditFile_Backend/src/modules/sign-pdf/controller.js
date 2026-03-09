import { asyncHandler } from '../../middleware/error.middleware.js';
import { signPdfBuffer } from './service.js';

export const signPdf = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
    });
  }

  const { outputBuffer, outputName } = await signPdfBuffer({
    pdfBuffer: req.file.buffer,
    originalName: req.file.originalname,
    placements: req.body?.placements,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
  res.setHeader('X-Processed-File-Name', outputName);
  res.send(outputBuffer);
});

export default {
  signPdf,
};
