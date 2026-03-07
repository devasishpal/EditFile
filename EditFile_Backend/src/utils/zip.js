const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORED_METHOD = 0;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const toDosDateTime = (date = new Date()) => {
  const safeDate = date instanceof Date ? date : new Date(date);
  const year = Math.min(2107, Math.max(1980, safeDate.getUTCFullYear()));
  const month = safeDate.getUTCMonth() + 1;
  const day = safeDate.getUTCDate();
  const hours = safeDate.getUTCHours();
  const minutes = safeDate.getUTCMinutes();
  const seconds = safeDate.getUTCSeconds();

  const dosTime = (hours << 11) | (minutes << 5) | Math.floor(seconds / 2);
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
};

const normalizeEntryName = (name, fallbackIndex) => {
  const candidate = String(name || '').trim();
  const sanitized = candidate
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/(\.\.\/)+/g, '')
    .replace(/\/{2,}/g, '/');

  if (!sanitized) {
    return `file-${fallbackIndex + 1}.bin`;
  }

  return sanitized;
};

export const calculateCrc32 = (buffer) => {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  let crc = 0xffffffff;

  for (let i = 0; i < source.length; i++) {
    crc = CRC32_TABLE[(crc ^ source[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * Create a ZIP archive from a list of in-memory buffers (stored, no compression).
 * @param {Array<{name: string, data: Buffer | Uint8Array, modifiedAt?: Date|string|number}>} entries
 * @returns {Buffer}
 */
export const createZipBuffer = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('ZIP archive requires at least one file');
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] || {};
    const fileName = normalizeEntryName(entry.name, index);
    const fileNameBuffer = Buffer.from(fileName, 'utf8');
    const dataBuffer = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data || []);
    const crc32 = calculateCrc32(dataBuffer);
    const { dosTime, dosDate } = toDosDateTime(entry.modifiedAt);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    localHeader.writeUInt16LE(ZIP_STORED_METHOD, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, fileNameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(ZIP_STORED_METHOD, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileNameBuffer);
    centralSize += centralHeader.length + fileNameBuffer.length;
    localOffset += localHeader.length + fileNameBuffer.length + dataBuffer.length;
  }

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4); // disk number
  endOfCentralDirectory.writeUInt16LE(0, 6); // central directory start disk
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralSize, 12);
  endOfCentralDirectory.writeUInt32LE(localOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
};

export default { createZipBuffer, calculateCrc32 };
