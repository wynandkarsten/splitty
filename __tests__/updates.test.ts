import { buildFeedbackPayload, submitFeedback } from '../src/lib/feedback';
import { checkForUpdate, compareVersions } from '../src/lib/updates';

const resp = (body: unknown, ok = true, status = 200) => (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

describe('compareVersions', () => {
  it('orders numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
});

describe('checkForUpdate', () => {
  it('reports available, current and errors', async () => {
    expect((await checkForUpdate('1.0.0', resp({ version: '1.1.0' }))).status).toBe('available');
    expect((await checkForUpdate('1.1.0', resp({ version: '1.1.0' }))).status).toBe('current');
    expect((await checkForUpdate('1.0.0', resp({}, false, 500))).status).toBe('error');
    expect((await checkForUpdate('1.0.0', resp({ nope: 1 }))).status).toBe('error');
    expect((await checkForUpdate('1.0.0', (async () => { throw new Error('x'); }) as unknown as typeof fetch)).status).toBe('error');
  });
});

describe('feedback', () => {
  const input = { kind: 'bug' as const, title: '  Crash on save  ', details: 'x'.repeat(3000), version: '1.1.1', platform: 'android' };

  it('trims and caps the payload to the server limits', () => {
    const p = buildFeedbackPayload(input);
    expect(p.title).toBe('Crash on save');
    expect(p.details).toHaveLength(2000);
    expect(Object.keys(p).sort()).toEqual(['details', 'kind', 'platform', 'title', 'version']);
  });

  it('posts JSON and reports success', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    expect(await submitFeedback(input, f as unknown as typeof fetch)).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('https://tenkodigital.com/splitty/api/feedback');
    expect(f.mock.calls[0][1].method).toBe('POST');
  });

  it('maps rate limiting, validation and network failures to friendly errors', async () => {
    const mk = (status: number) => jest.fn().mockResolvedValue({ ok: false, status }) as unknown as typeof fetch;
    expect((await submitFeedback(input, mk(429))).ok).toBe(false);
    expect(await submitFeedback(input, mk(422))).toMatchObject({ ok: false, error: expect.stringContaining('title') });
    expect(await submitFeedback(input, mk(500))).toMatchObject({ ok: false });
    const down = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(await submitFeedback(input, down)).toMatchObject({ ok: false, error: expect.stringContaining('connection') });
  });
});
