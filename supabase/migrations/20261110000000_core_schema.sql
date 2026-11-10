-- Splitty core schema (first draft, 2026-11-10).
-- Money is stored as integer cents (never floats). Everyone in an event is a
-- "participant"; a participant may or may not be linked to a login (guests join
-- by link with just a name, so user_id is nullable).

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  currency    char(3) not null default 'ZAR',
  join_code   text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  display_name  text not null check (length(trim(display_name)) > 0),
  joined_at     timestamptz not null default now()
);
create index participants_event_idx on public.participants (event_id);
-- One login can appear at most once per event (guests have null user_id, so are exempt).
create unique index participants_event_user_uniq
  on public.participants (event_id, user_id) where user_id is not null;

create table public.bills (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  currency    char(3) not null default 'ZAR',
  paid_by     uuid not null references public.participants (id),
  split_type  text not null default 'equal'
              check (split_type in ('equal', 'exact', 'percent', 'shares')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index bills_event_idx on public.bills (event_id);

-- Who owes what on a bill. A participant who skipped a bill simply has no row.
-- share_cents is the resolved amount owed; weight keeps the raw input
-- (percent or share count) so the split can be edited later.
-- Invariant (enforced in app/edge function, not here yet):
--   sum(share_cents) for a bill = bills.amount_cents.
create table public.bill_shares (
  bill_id         uuid not null references public.bills (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  share_cents     bigint not null check (share_cents >= 0),
  weight          numeric,
  primary key (bill_id, participant_id)
);

-- Money actually handed over to settle up (the "mark paid" action).
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  from_participant  uuid not null references public.participants (id),
  to_participant    uuid not null references public.participants (id),
  amount_cents      bigint not null check (amount_cents > 0),
  currency          char(3) not null default 'ZAR',
  paid_at           timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  check (from_participant <> to_participant)
);
create index payments_event_idx on public.payments (event_id);

-- Row level security ON with no policies = every client request is denied.
-- This is deliberate: the access model (logged-in members vs link-joined
-- guests) is an open design decision, and policies get written with it.
alter table public.events       enable row level security;
alter table public.participants enable row level security;
alter table public.bills        enable row level security;
alter table public.bill_shares  enable row level security;
alter table public.payments     enable row level security;
