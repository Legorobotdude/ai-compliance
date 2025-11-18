import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtVerifier, extractBearerToken, AuthorizationError } from './index.js';
import { createSecretKey } from 'node:crypto';
import { SignJWT } from 'jose';

describe('JwtVerifier', () => {
    const secret = 'super-secret-key-for-testing-only-12345';
    const issuer = 'https://auth.example.com/';
    const audience = 'https://api.example.com';

    let verifier: JwtVerifier;

    beforeEach(() => {
        verifier = new JwtVerifier({
            issuer,
            audience,
            sharedSecret: secret,
        });
    });

    it('should verify a valid token', async () => {
        const key = createSecretKey(Buffer.from(secret, 'utf8'));
        const token = await new SignJWT({
            tenant_id: 'tenant-123',
            roles: ['admin', 'user'],
            email: 'test@example.com',
            sub: 'user-123',
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setIssuer(issuer)
            .setAudience(audience)
            .setExpirationTime('1h')
            .sign(key);

        const user = await verifier.verify(token);

        expect(user).toBeDefined();
        expect(user.tenantId).toBe('tenant-123');
        expect(user.roles).toEqual(['admin', 'user']);
        expect(user.email).toBe('test@example.com');
        expect(user.userId).toBe('user-123');
        expect(user.token).toBe(token);
    });

    it('should throw if token is missing', async () => {
        await expect(verifier.verify('')).rejects.toThrow(AuthorizationError);
    });

    it('should throw if token is invalid', async () => {
        await expect(verifier.verify('invalid.token.here')).rejects.toThrow();
    });

    it('should throw if tenant claim is missing', async () => {
        const key = createSecretKey(Buffer.from(secret, 'utf8'));
        const token = await new SignJWT({
            // tenant_id missing
            roles: ['user'],
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer(issuer)
            .setAudience(audience)
            .sign(key);

        await expect(verifier.verify(token)).rejects.toThrow('JWT missing tenant claim');
    });

    it('should handle custom claim names', async () => {
        const customVerifier = new JwtVerifier({
            issuer,
            sharedSecret: secret,
            tenantClaim: 'custom_tenant',
            rolesClaim: 'custom_roles',
        });

        const key = createSecretKey(Buffer.from(secret, 'utf8'));
        const token = await new SignJWT({
            custom_tenant: 'tenant-456',
            custom_roles: ['editor'],
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer(issuer)
            .sign(key);

        const user = await customVerifier.verify(token);
        expect(user.tenantId).toBe('tenant-456');
        expect(user.roles).toEqual(['editor']);
    });
});

describe('extractBearerToken', () => {
    it('should extract token from valid header', () => {
        const header = 'Bearer my-token-123';
        expect(extractBearerToken(header)).toBe('my-token-123');
    });

    it('should throw if header is missing', () => {
        expect(() => extractBearerToken(undefined)).toThrow(AuthorizationError);
    });

    it('should throw if scheme is not Bearer', () => {
        expect(() => extractBearerToken('Basic user:pass')).toThrow(AuthorizationError);
    });

    it('should throw if token is missing in header', () => {
        expect(() => extractBearerToken('Bearer')).toThrow(AuthorizationError);
    });
});
