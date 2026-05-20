create table if not exists public.hackathons (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  url text not null unique,
  title text not null,
  deadline text,
  starts_at text,
  location text,
  prize text,
  summary text,
  tags text[] default '{}',
  status text not null default 'pending',
  raw jsonb,
  discovered_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists hackathons_status_idx on public.hackathons(status, discovered_at desc);

alter table public.hackathons enable row level security;