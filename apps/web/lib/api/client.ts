import { getApiBaseUrl, getApiToken } from '@/lib/env';

type ApiFetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit;
};

type ApiClientConfig = {
  baseUrl: string;
  token: string;
};

let cachedConfig: ApiClientConfig | null = null;

function resolveConfig(): ApiClientConfig {
  if (!cachedConfig) {
    cachedConfig = {
      baseUrl: getApiBaseUrl(),
      token: getApiToken()
    };
  }
  return cachedConfig;
}

export async function certivoApiFetch<TResponse>(
  path: string,
  options?: ApiFetchOptions
): Promise<TResponse> {
  const { baseUrl, token } = resolveConfig();
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await safeJson(response);
    const message = parseErrorMessage(body) ?? `Certivo API request failed (${response.status})`;
    throw new Error(message);
  }
  return (await response.json()) as TResponse;
}

async function safeJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}
