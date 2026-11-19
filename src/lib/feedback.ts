export const REPO = 'wynandkarsten/splitty';

/** Pre-filled GitHub "new issue" link. The user reviews and submits it on GitHub; nothing is sent from the app. */
export function featureRequestUrl(opts: { title: string; details: string; version: string; platform: string; kind?: 'feature' | 'bug' }): string {
  const kind = opts.kind ?? 'feature';
  const body = `${opts.details.trim()}\n\n---\nApp version: ${opts.version}\nPlatform: ${opts.platform}`;
  const q = new URLSearchParams({
    title: `${kind === 'bug' ? '[Bug]' : '[Feature]'} ${opts.title.trim()}`,
    body,
    labels: kind === 'bug' ? 'bug' : 'enhancement',
  });
  return `https://github.com/${REPO}/issues/new?${q.toString()}`;
}
