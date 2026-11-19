export const VERSION_URL = 'https://splitty.tenkodigital.com/version.json';

export type LatestInfo = { version: string; url?: string; notes?: string };

/** Compare dotted versions numerically. Returns >0 if a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type UpdateResult =
  | { status: 'available'; latest: LatestInfo }
  | { status: 'current'; latest: LatestInfo }
  | { status: 'error'; message: string };

/** Ask the server for the latest version. Never installs anything; the user decides. */
export async function checkForUpdate(current: string, fetchImpl: typeof fetch = fetch): Promise<UpdateResult> {
  try {
    const res = await fetchImpl(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { status: 'error', message: `Server answered ${res.status}` };
    const latest = (await res.json()) as LatestInfo;
    if (!latest || typeof latest.version !== 'string') return { status: 'error', message: 'Unreadable version info' };
    return compareVersions(latest.version, current) > 0 ? { status: 'available', latest } : { status: 'current', latest };
  } catch {
    return { status: 'error', message: 'Could not reach the update server. Check your connection.' };
  }
}
