export const FEEDBACK_URL = 'https://tenkodigital.com/splitty/api/feedback';

export type FeedbackKind = 'feature' | 'bug';
export type FeedbackInput = { kind: FeedbackKind; title: string; details: string; version: string; platform: string };
export type FeedbackResult = { ok: true } | { ok: false; error: string };

/** Trim and cap to the same limits the server enforces (it re-validates everything). */
export function buildFeedbackPayload(i: FeedbackInput) {
  return {
    kind: i.kind,
    title: i.title.trim().slice(0, 120),
    details: i.details.trim().slice(0, 2000),
    version: i.version,
    platform: i.platform,
  };
}

/** Sends a suggestion to tenkodigital.com. No personal data: only the text typed, app version and platform. */
export async function submitFeedback(i: FeedbackInput, fetchImpl: typeof fetch = fetch): Promise<FeedbackResult> {
  try {
    const res = await fetchImpl(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFeedbackPayload(i)),
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, error: 'Too many suggestions just now, please try again later.' };
    if (res.status === 422) return { ok: false, error: 'Please add a short title (at least 3 characters).' };
    return { ok: false, error: 'Could not send right now, please try again.' };
  } catch {
    return { ok: false, error: 'No connection. Check your internet and try again.' };
  }
}
