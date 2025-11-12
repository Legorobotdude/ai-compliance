#!/usr/bin/env node
/**
 * Generate a JWT token for local development
 * 
 * This script generates a JWT token with the seeded tenant_id claim
 * that matches the tenant created by the seed script.
 * 
 * Usage:
 *   node infra/docker/generate-dev-token.mjs
 * 
 * Or set custom values:
 *   TENANT_ID=<uuid> ISSUER=<issuer> AUDIENCE=<audience> SECRET=<secret> node infra/docker/generate-dev-token.mjs
 */

import crypto from 'node:crypto';

// Deterministic UUID function matching seed script
function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

// Get tenant ID from seed script (matches 'tenant:acme')
const TENANT_ID = process.env.TENANT_ID || deterministicUuid('tenant:acme');
const ISSUER = process.env.ISSUER || process.env.AUTH_ISSUER || 'https://auth.dev.certivo';
const AUDIENCE = process.env.AUDIENCE || process.env.AUTH_AUDIENCE || 'certivo-api';
const SECRET = process.env.SECRET || process.env.AUTH_JWT_SECRET || 'dev-secret';
const USER_ID = process.env.USER_ID || deterministicUuid('user:ops@acme.example.com');
const EMAIL = process.env.EMAIL || 'ops@acme.example.com';
const ROLES = process.env.ROLES ? process.env.ROLES.split(',') : ['ADMIN'];

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateToken() {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400 * 30; // 30 days
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const payload = {
    tenant_id: TENANT_ID,
    roles: ROLES,
    email: EMAIL,
    sub: USER_ID,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: exp
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(signatureInput);
  const signature = base64UrlEncode(hmac.digest());
  
  const token = `${signatureInput}.${signature}`;

  return token;
}

try {
  const token = generateToken();
  
  console.log('\n✅ Generated JWT token for local development:\n');
  console.log(token);
  console.log('\n📋 Token details:');
  console.log(`   Tenant ID: ${TENANT_ID}`);
  console.log(`   User ID: ${USER_ID}`);
  console.log(`   Email: ${EMAIL}`);
  console.log(`   Roles: ${ROLES.join(', ')}`);
  console.log(`   Issuer: ${ISSUER}`);
  console.log(`   Audience: ${AUDIENCE}`);
  console.log('\n💡 Set this token as CERTIVO_API_TOKEN in your environment:\n');
  console.log(`   export CERTIVO_API_TOKEN="${token}"\n`);
} catch (error) {
  console.error('Failed to generate token:', error);
  process.exit(1);
}

