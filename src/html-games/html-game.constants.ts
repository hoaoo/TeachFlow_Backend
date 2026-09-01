export const DEFAULT_HTML_GAME_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_HTML_GAME_MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;
export const DEFAULT_HTML_GAME_MAX_FILE_COUNT = 250;
export const DEFAULT_HTML_GAME_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const HTML_GAME_CONFIG_SCHEMA_VERSION = 1;
export const HTML_GAME_MAX_QUESTIONS = 200;
export const HTML_GAME_MAX_RUNTIME_PAYLOAD_BYTES = 256 * 1024;

export const HTML_GAME_ALLOWED_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.txt', '.csv', '.xml',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp3', '.ogg', '.wav', '.mp4', '.webm',
  '.woff', '.woff2', '.ttf', '.otf', '.webmanifest',
]);
