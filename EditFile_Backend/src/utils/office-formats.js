const CONTENT_TYPES_BY_FORMAT = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export const CONVERSION_FAILURE_MESSAGE = 'Conversion failed. Please try again.';

export const getContentTypeForFormat = (format, fallback = 'application/octet-stream') => {
  const normalizedFormat = String(format || '').trim().replace(/^\./, '').toLowerCase();
  return CONTENT_TYPES_BY_FORMAT[normalizedFormat] || fallback;
};

export default {
  CONVERSION_FAILURE_MESSAGE,
  getContentTypeForFormat,
};
