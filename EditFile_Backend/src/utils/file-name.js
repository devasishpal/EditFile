import path from 'path';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export const sanitizeBaseName = (value, fallback = 'file') => {
  const raw = String(value || fallback).trim();
  const withoutExtension = raw.replace(/\.[^/.]+$/, '');
  const sanitized = withoutExtension
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
};

export const sanitizeExtension = (value, fallback = 'bin') => {
  const raw = String(value || '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return raw || fallback;
};

export const getOriginalExtension = (originalName, fallback = 'bin') => {
  const extension = path.extname(String(originalName || '')).replace(/^\./, '');
  return sanitizeExtension(extension, fallback);
};

export const buildFileName = ({
  originalName,
  extension,
  fallbackBase = 'file',
  useOutputSuffix = false,
}) => {
  const baseName = sanitizeBaseName(originalName, fallbackBase);
  const safeExtension = sanitizeExtension(
    extension || getOriginalExtension(originalName, 'bin'),
    'bin'
  );
  const normalizedBaseName = useOutputSuffix ? `${baseName}_output` : baseName;
  return `${normalizedBaseName}.${safeExtension}`;
};

export const buildOutputZipName = (originalName, fallbackBase = 'files') =>
  buildFileName({
    originalName,
    extension: 'zip',
    fallbackBase,
    useOutputSuffix: true,
  });

