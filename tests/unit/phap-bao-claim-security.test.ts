import { expect, it, vi } from 'vitest';
import { handleApiRequest } from '$lib/server/http/api-handler';

async function claim(origin: string | null, token: string | null, authenticated = true, urlOrigin = 'https://quangtu.vn') {
  const run = vi.fn(async () => ({ success: true, meta: { changes: 1 } }));
  const bind = vi.fn((..._values: unknown[]) => ({ run }));
  const prepare = vi.fn(() => ({ bind }));
  const response = await handleApiRequest({
    request: new Request(`${urlOrigin}/api/phap-bao/claim`, {
      method: 'POST', body: JSON.stringify({ itemTitle: 'Kinh', shopeeUrl: 'https://shopee.vn/example' }),
      headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...(token ? { 'x-csrf-token': token } : {}) },
    }),
    locals: {
      env: { DB: { prepare }, APP_ORIGIN: 'https://quangtu.vn' }, migrationSealed: true,
      session: authenticated ? { appUserId: 'owner-a', csrfToken: 'session-secret' } : null,
    },
  });
  return { response, prepare, run, bind };
}

it('accepts the real session token and writes only the authenticated owner with the existing response contract', async () => {
  const state = await claim('capacitor://localhost', 'session-secret');
  expect(state.response.status).toBe(200);
  await expect(state.response.json()).resolves.toMatchObject({ success: true, recorded: true, record: { user_id: 'owner-a' } });
  expect(state.prepare).toHaveBeenCalledTimes(1);
  expect(state.bind.mock.calls[0][1]).toBe('owner-a');
});

it.each(['https://quangtu.vn', 'capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost', 'http://127.0.0.1', 'https://127.0.0.1'])
  ('keeps installed legacy clients recording with public token from the fixed origin %s', async origin => {
    const state = await claim(origin, 'public');
    expect(state.response.status).toBe(200);
    expect(state.run).toHaveBeenCalledOnce();
  });

it('keeps the current Worker web origin compatible, without trusting that origin on unrelated hosts', async () => {
  const worker = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
  expect((await claim(worker, 'public', true, worker)).response.status).toBe(200);
  const rejected = await claim(worker, 'public');
  expect(rejected.response.status).toBe(403);
  expect(rejected.prepare).not.toHaveBeenCalled();
});

it.each([['https://untrusted.local', 'public'], ['https://untrusted.localhost', 'public'], ['https://evil.example', 'public'], ['https://quangtu.vn', 'wrong-token'], ['https://quangtu.vn', null], [null, 'session-secret']])
  ('rejects a forged authenticated claim (%s, %s) before D1', async (origin, token) => {
    const state = await claim(origin, token);
    expect(state.response.status).toBe(403);
    expect(state.prepare).not.toHaveBeenCalled();
  });

it('preserves the guest claim contract without any D1 write', async () => {
  const state = await claim('https://quangtu.vn', 'public', false);
  expect(state.response.status).toBe(200);
  await expect(state.response.json()).resolves.toEqual({ success: true, recorded: false });
  expect(state.prepare).not.toHaveBeenCalled();
});
