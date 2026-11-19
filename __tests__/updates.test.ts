import { featureRequestUrl } from '../src/lib/feedback';
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

describe('featureRequestUrl', () => {
  it('builds an encoded issue link with labels', () => {
    const u = new URL(featureRequestUrl({ title: 'Dark & light', details: 'a b', version: '1.0.0', platform: 'android' }));
    expect(u.pathname).toBe('/wynandkarsten/splitty/issues/new');
    expect(u.searchParams.get('title')).toBe('[Feature] Dark & light');
    expect(u.searchParams.get('labels')).toBe('enhancement');
    expect(u.searchParams.get('body')).toContain('App version: 1.0.0');
  });
});
