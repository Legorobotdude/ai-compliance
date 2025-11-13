import { fetch, Headers } from 'undici';

interface CoraClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class CoraHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: unknown
  ) {
    super(message);
  }
}

export class CoraClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: CoraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async post<TResponse>(path: string, payload: unknown, tenantId: string): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${path}`;

    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId
    });
    if (this.apiKey) {
      headers.set('X-Api-Key', this.apiKey);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const bodyText = await response.text();
      const parsed = bodyText.length ? safeJsonParse(bodyText) : null;

      if (!response.ok) {
        throw new CoraHttpError(
          `CORA request to ${path} failed with status ${response.status}`,
          response.status,
          parsed
        );
      }

      return parsed as TResponse;
    } catch (error) {
      if (error instanceof CoraHttpError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`CORA request to ${path} timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
