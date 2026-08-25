export function decodeVietnameseFilename(name: string): string {
  if (!name) return 'uploaded_file';
  let decoded = name;
  try {
    // Detect latin1 mojibake from busboy/multer
    const asUtf8 = Buffer.from(name, 'latin1').toString('utf8');
    if (!asUtf8.includes('\ufffd') && /[à-ỹÀ-ỸđĐ]/.test(asUtf8)) {
      decoded = asUtf8;
    }
  } catch {}
  return decoded.normalize('NFC').replace(/[\r\n\0]/g, '').trim();
}

export function sanitizeFilename(
  raw: string,
  ext: string,
): { asciiFilename: string; utf8Filename: string } {
  const cleanExt = ext.replace(/^\./, '').toLowerCase();

  // 1. Decode & normalize Vietnamese text to NFC
  const nfcText = decodeVietnameseFilename(raw || 'document');

  // 2. Convert Vietnamese diacritics to ASCII for safe fallback filename
  const asciiNormalized = nfcText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'));

  // Strip path traversal and illegal characters for ASCII
  const asciiClean = asciiNormalized
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  // Preserve Vietnamese Unicode for RFC 5987 utf8Filename, only strip path traversal & control chars
  const utf8Clean = nfcText
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/[\r\n\0]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const asciiFilename = `${asciiClean || 'document'}.${cleanExt}`;
  const utf8Filename = `${utf8Clean || 'document'}.${cleanExt}`;

  return { asciiFilename, utf8Filename };
}

export function buildContentDisposition(
  asciiFilename: string,
  utf8Filename: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  const encodedUtf8 = encodeURIComponent(utf8Filename);
  return `${type}; filename="${asciiFilename}"; filename*=UTF-8''${encodedUtf8}`;
}

