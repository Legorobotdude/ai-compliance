const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_MIN_CHARS = 400;

export interface ChunkSegment {
  content: string;
  tokenCount: number;
}

export interface ChunkerOptions {
  maxChars?: number;
  minChars?: number;
}

/**
 * Splits normalized document text into overlapping chunks that keep semantic paragraphs together.
 */
export class DocumentChunker {
  private readonly maxChars: number;
  private readonly minChars: number;

  constructor(options: ChunkerOptions = {}) {
    this.maxChars = Math.max(options.maxChars ?? DEFAULT_MAX_CHARS, DEFAULT_MIN_CHARS);
    this.minChars = Math.max(200, options.minChars ?? DEFAULT_MIN_CHARS);
  }

  chunk(rawText: string): ChunkSegment[] {
    const text = rawText.replace(/\r\n/g, '\n').trim();
    if (!text) {
      return [];
    }

    const paragraphs = text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      return [{ content: text, tokenCount: countTokens(text) }];
    }

    const segments: ChunkSegment[] = [];
    let buffer = '';

    const flushBuffer = () => {
      if (!buffer.trim()) {
        buffer = '';
        return;
      }
      const trimmed = buffer.trim();
      segments.push({ content: trimmed, tokenCount: countTokens(trimmed) });
      buffer = '';
    };

    for (const paragraph of paragraphs) {
      if (!buffer) {
        buffer = paragraph;
        continue;
      }
      const next = `${buffer}\n\n${paragraph}`;
      if (next.length > this.maxChars && buffer.length >= this.minChars) {
        flushBuffer();
        buffer = paragraph;
        continue;
      }
      if (paragraph.length > this.maxChars) {
        const slices = this.splitLargeParagraph(paragraph);
        for (const slice of slices) {
          if (slice.length > this.maxChars) {
            buffer = slice.slice(0, this.maxChars);
            flushBuffer();
            buffer = slice.slice(this.maxChars);
            flushBuffer();
          } else {
            if (buffer.length && buffer.length + slice.length + 2 > this.maxChars) {
              flushBuffer();
            }
            buffer = buffer ? `${buffer}\n\n${slice}` : slice;
          }
        }
        continue;
      }
      buffer = next;
    }

    if (buffer) {
      flushBuffer();
    }

    return segments;
  }

  private splitLargeParagraph(paragraph: string): string[] {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
    if (sentences.length <= 1) {
      const midpoint = Math.floor(paragraph.length / 2);
      return [paragraph.slice(0, midpoint), paragraph.slice(midpoint)];
    }

    const slices: string[] = [];
    let buffer = '';
    for (const sentence of sentences) {
      const next = buffer ? `${buffer} ${sentence}` : sentence;
      if (next.length > this.maxChars && buffer.length >= this.minChars) {
        slices.push(buffer.trim());
        buffer = sentence;
        continue;
      }
      buffer = next;
    }
    if (buffer) {
      slices.push(buffer.trim());
    }
    return slices;
  }
}

function countTokens(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}
