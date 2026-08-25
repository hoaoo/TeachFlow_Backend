export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
}

export interface AiInlinePart {
  mimeType: string;
  data: string; // base64
}

export interface GenerateStructuredOptions<T> {
  operation: string;
  prompt: string;
  schema: unknown;
  validate: (value: unknown) => T;
  retryCount?: number;
  timeoutMs?: number;
  inlineParts?: AiInlinePart[];
}

export interface GenerateTextOptions {
  operation: string;
  prompt: string;
  retryCount?: number;
  timeoutMs?: number;
  inlineParts?: AiInlinePart[];
}

export interface GenerateImageOptions {
  operation: string;
  prompt: string;
  aspectRatio?: string;
  timeoutMs?: number;
}

export interface AiProvider {
  generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T>;
  generateText(options: GenerateTextOptions): Promise<string>;
  generateImage(options: GenerateImageOptions): Promise<GeneratedImage>;
}
