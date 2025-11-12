import { createSecretKey } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey, type KeyLike } from 'jose';

export interface JwtVerifierOptions {
  issuer: string;
  audience?: string;
  jwksUrl?: string;
  sharedSecret?: string;
  tenantClaim?: string;
  rolesClaim?: string;
  emailClaim?: string;
}

export interface AuthenticatedUser {
  token: string;
  tenantId: string;
  roles: string[];
  userId?: string;
  email?: string;
  issuedAt?: string;
  expiresAt?: string;
  claims: JWTPayload;
}

export class AuthorizationError extends Error {
  readonly status = 401;
}

export class JwtVerifier {
  private readonly key?: KeyLike;
  private readonly keyGetter?: JWTVerifyGetKey;
  private readonly tenantClaim: string;
  private readonly rolesClaim: string;
  private readonly emailClaim: string;
  private readonly verifyOptions: { issuer: string; audience?: string };

  constructor(private readonly options: JwtVerifierOptions) {
    if (!options.jwksUrl && !options.sharedSecret) {
      throw new Error('JwtVerifier requires either jwksUrl or sharedSecret');
    }
    this.tenantClaim = options.tenantClaim ?? 'tenant_id';
    this.rolesClaim = options.rolesClaim ?? 'roles';
    this.emailClaim = options.emailClaim ?? 'email';
    this.verifyOptions = {
      issuer: options.issuer,
      ...(options.audience ? { audience: options.audience } : {})
    };
    if (options.jwksUrl) {
      this.keyGetter = createRemoteJWKSet(new URL(options.jwksUrl));
    } else if (options.sharedSecret) {
      this.key = createSecretKey(Buffer.from(options.sharedSecret, 'utf8'));
    } else {
      throw new Error('JwtVerifier misconfiguration');
    }
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    if (!token) {
      throw new AuthorizationError('Missing bearer token');
    }
    let payload: JWTPayload;
    if (this.keyGetter) {
      ({ payload } = await jwtVerify(token, this.keyGetter, this.verifyOptions));
    } else if (this.key) {
      ({ payload } = await jwtVerify(token, this.key, this.verifyOptions));
    } else {
      throw new Error('JwtVerifier is not configured with a key');
    }
    const tenantClaim = this.resolveClaim(payload, this.tenantClaim);
    if (!tenantClaim || typeof tenantClaim !== 'string') {
      throw new AuthorizationError('JWT missing tenant claim');
    }
    const rolesClaim = this.resolveClaim(payload, this.rolesClaim);
    const emailClaim = this.resolveClaim(payload, this.emailClaim);
    const roles = normalizeRoles(rolesClaim);
    const authUser: AuthenticatedUser = {
      token,
      tenantId: tenantClaim,
      roles,
      userId: typeof payload.sub === 'string' ? payload.sub : undefined,
      email: typeof emailClaim === 'string' ? emailClaim : undefined,
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : undefined,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
      claims: payload
    };
    return authUser;
  }

  private resolveClaim(payload: JWTPayload, claimPath: string): unknown {
    if (claimPath.includes('.')) {
      return claimPath.split('.').reduce<unknown>((acc, segment) => {
        if (acc && typeof acc === 'object' && segment in acc) {
          return (acc as Record<string, unknown>)[segment];
        }
        return undefined;
      }, payload);
    }
    return payload[claimPath];
  }
}

export function extractBearerToken(headerValue: string | undefined): string {
  if (!headerValue) {
    throw new AuthorizationError('Authorization header is required');
  }
  const [scheme, token] = headerValue.split(' ');
  if (!token || !scheme || scheme.toLowerCase() !== 'bearer') {
    throw new AuthorizationError('Authorization header must be a Bearer token');
  }
  return token.trim();
}

function normalizeRoles(claim: unknown): string[] {
  if (Array.isArray(claim)) {
    return claim.map(String);
  }
  if (typeof claim === 'string') {
    return claim
      .split(/[,\s]/)
      .map((role) => role.trim())
      .filter(Boolean);
  }
  if (claim && typeof claim === 'object') {
    return Object.values(claim).map(String);
  }
  return [];
}
