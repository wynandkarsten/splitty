# Splitty

Bill and event splitting app (working name). One Expo / React Native codebase for web, iOS and Android; Supabase backend.

Plan, market scan and MVP spec live in the Obsidian vault: `Bill Split App` (`02 - Tenko Digital`).

## Status

Scaffold only (2026-11-10). No Supabase project exists yet, no app screens are built, the template's demo screens are still in `src/app`.

## Run

```bash
npm install
npx expo start        # then press w for web, or scan the QR in Expo Go
```

## Backend setup (not done yet)

1. Create a Supabase project (needs Wynand's account).
2. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
3. Apply `supabase/migrations/20261110000000_core_schema.sql` (SQL editor, or the Supabase CLI).

## Schema

`events` > `participants` (login optional, so guests can join by link) > `bills` > `bill_shares` (who owes what; skipping a bill = no row) and `payments` (settle-ups). Money is integer cents.

Row level security is enabled on every table with **no policies**, so all client access is denied until the access model (members vs link-joined guests) is designed and policies written. The rule "shares sum to the bill amount" is not enforced in the database yet.
