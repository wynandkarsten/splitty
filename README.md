# Splitty

Bill and event splitting app (working name). One Expo / React Native codebase for web, iOS and Android; Supabase backend.

Plan, market scan and MVP spec live in the Obsidian vault: `Bill Split App` (`02 - Tenko Digital`).

## Status

Scaffold plus live database (2026-11-10). No app screens are built, the template's demo screens are still in `src/app`.

## Run

```bash
npm install
npx expo start        # then press w for web, or scan the QR in Expo Go
```

## Backend

Supabase project `splitty` (ref `kgxudhaqszsgpwyshvzz`, region eu-west-1), linked with the Supabase CLI. The core migration is applied. On a new machine: `npx supabase login`, `npx supabase link --project-ref kgxudhaqszsgpwyshvzz`, copy `.env.example` to `.env.local` and fill in the URL and publishable key (Dashboard > Project Settings > API, or `npx supabase projects api-keys`). New migrations: `npx supabase db push`.

## Schema

`events` > `participants` (login optional, so guests can join by link) > `bills` > `bill_shares` (who owes what; skipping a bill = no row) and `payments` (settle-ups). Money is integer cents.

Row level security is enabled on every table with **no policies**, so all client access is denied until the access model (members vs link-joined guests) is designed and policies written. The rule "shares sum to the bill amount" is not enforced in the database yet.
