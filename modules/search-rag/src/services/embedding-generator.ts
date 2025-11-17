import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSION = 1536;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export class DeterministicEmbeddingGenerator {
  constructor(private readonly dimension = EMBEDDING_DIMENSION) {}

  vectorize(text: string): number[] {
    const tokens = tokenize(text);
    if (!tokens.length) {
      return new Array(this.dimension).fill(0);
    }

    const accumulator = new Array<number>(this.dimension).fill(0);
    for (const token of tokens) {
      const index = hashToken(token, this.dimension);
      accumulator[index]! += 1;
    }

    const magnitude = Math.sqrt(accumulator.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) {
      return accumulator;
    }
    return accumulator.map((value) => value / magnitude);
  }

  toSqlVector(text: string): string {
    const vector = this.vectorize(text);
    const formatted = vector.map((value) => Number(value.toFixed(6))); // keep payload small
    return `[${formatted.join(',')}]`;
  }

  checksum(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hashToken(token: string, dimension: number): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
    hash >>>= 0;
  }
  return hash % dimension;
}
