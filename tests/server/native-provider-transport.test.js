import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { providerFetch } from '../../src/lib/server/auth/native-token-verification.ts';
import { storeAppleAuthorization } from '../../src/lib/server/auth/apple-authorization.ts';

let appleEnvironment;
beforeAll(async () => {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey));
  appleEnvironment = {
    DB: { prepare: vi.fn() }, APPLE_TEAM_ID: 'TESTTEAM', APPLE_KEY_ID: 'TESTKEY',
    APPLE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`,
    APPLE_TOKEN_ENCRYPTION_KEY: 'test-only-encryption-material-at-least-32-characters',
  };
});

afterEach(() => vi.restoreAllMocks());

it('can reach a token verifier using the actual Workers fetch runtime', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    // Validate options using workerd's real Request, unlike Node-only mocks.
    new Request(input, init);
    return Response.json({ error: 'invalid_token' }, { status: 400 });
  });
  const response = await providerFetch('https://oauth2.googleapis.com/tokeninfo?id_token=diagnostic');
  expect(response.status).toBe(400);
});

it('rejects provider redirects without sending the token to the redirect target', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    new Request(input, init);
    return new Response('', { status: 302, headers: { location: 'https://unexpected.example/steal' } });
  });
  await expect(providerFetch('https://oauth2.googleapis.com/tokeninfo?id_token=redirect-test')).rejects.toThrow();
});

it('constructs the Apple authorization POST using the actual Workers Request implementation', async () => {
  let request;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    request = new Request(input, init);
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  });
  await expect(storeAppleAuthorization(appleEnvironment, 'owner-a', 'subject-a', 'test-code'))
    .rejects.toThrow('apple-authorization-unavailable');
  expect(request.url).toBe('https://appleid.apple.com/auth/token');
  expect(request.redirect).toBe('manual');
  expect(request.method).toBe('POST');
});
