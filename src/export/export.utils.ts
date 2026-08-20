export function sanitizeFilename(
  raw: string,
  ext: 'docx' | 'pdf',
): { asciiFilename: string; utf8Filename: string } {
  // Convert Vietnamese diacritics to ASCII for safe fallback filename
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'));

  // Strip path traversal and illegal characters
  const asciiClean = normalized
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  const utf8Clean = raw
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

  const asciiFilename = `${asciiClean || 'document'}.${ext}`;
  const utf8Filename = `${utf8Clean || 'document'}.${ext}`;

  return { asciiFilename, utf8Filename };
}

export function buildContentDisposition(asciiFilename: string, utf8Filename: string): string {
  const encodedUtf8 = encodeURIComponent(utf8Filename);
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedUtf8}`;
}
