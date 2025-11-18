function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} for Certivo web app`);
  }
  return value;
}

let cachedClaims: Record<string, unknown> | null = null;

function decodeTokenClaims(): Record<string, unknown> {
  if (cachedClaims) {
    return cachedClaims;
  }
  const token = getApiToken();
  const [, payload] = token.split('.');
  if (!payload) {
    throw new Error('CERTIVO_API_TOKEN must be a valid JWT');
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const json = Buffer.from(padded, 'base64').toString('utf8');
    cachedClaims = JSON.parse(json) as Record<string, unknown>;
    return cachedClaims;
  } catch (error) {
    throw new Error(`Failed to decode CERTIVO_API_TOKEN payload: ${(error as Error).message}`);
  }
}

export function getApiBaseUrl(): string {
  return requireEnv('CERTIVO_API_URL').replace(/\/+$/, '');
}

export function getApiToken(): string {
  return requireEnv('CERTIVO_API_TOKEN');
}

export function getTenantIdFromToken(): string {
  const claims = decodeTokenClaims();
  const tenantId =
    typeof claims.tenant_id === 'string'
      ? claims.tenant_id
      : typeof claims.tenantId === 'string'
        ? claims.tenantId
        : null;
  if (!tenantId) {
    throw new Error('CERTIVO_API_TOKEN is missing a tenant_id claim');
  }
  return tenantId;
}

export function getUserIdFromToken(): string | undefined {
  const claims = decodeTokenClaims();
  return typeof claims.sub === 'string' ? claims.sub : undefined;
}
