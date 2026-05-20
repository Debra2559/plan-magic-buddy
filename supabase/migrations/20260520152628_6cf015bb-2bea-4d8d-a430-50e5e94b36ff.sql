
create table public.feishu_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  step text not null,
  level text not null default 'info',
  event_type text,
  status int,
  duration_ms int,
  message text,
  error text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index feishu_webhook_logs_created_at_idx on public.feishu_webhook_logs (created_at desc);
create index feishu_webhook_logs_request_id_idx on public.feishu_webhook_logs (request_id);
create index feishu_webhook_logs_level_idx on public.feishu_webhook_logs (level);

alter table public.feishu_webhook_logs enable row level security;

create policy "authenticated can read feishu webhook logs"
  on public.feishu_webhook_logs
  for select
  to authenticated
  using (true);
