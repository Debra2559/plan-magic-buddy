-- 1) 历史表
create table if not exists public.user_profile_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version integer not null default 0,
  changed_at timestamptz not null default now(),
  changed_fields text[] not null default '{}',
  before jsonb,
  after jsonb
);

alter table public.user_profile_history enable row level security;

drop policy if exists "user_profile_history own read" on public.user_profile_history;
create policy "user_profile_history own read"
  on public.user_profile_history
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_profile_history own delete" on public.user_profile_history;
create policy "user_profile_history own delete"
  on public.user_profile_history
  for delete to authenticated
  using (user_id = auth.uid());

create index if not exists user_profile_history_user_changed_at_idx
  on public.user_profile_history(user_id, changed_at desc);

-- 2) 触发器函数：对 user_profiles 的 INSERT/UPDATE/DELETE 自动写历史
create or replace function public.user_profiles_record_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked text[] := array[
    'avatar_url','display_name','persona_prompt',
    'humor_level','sass_level','professional_level','verbosity_level',
    'tone_examples','taboos'
  ];
  f text;
  changed text[] := '{}';
  before_j jsonb := '{}'::jsonb;
  after_j  jsonb := '{}'::jsonb;
  old_j jsonb;
  new_j jsonb;
begin
  if (tg_op = 'INSERT') then
    new_j := to_jsonb(new);
    foreach f in array tracked loop
      after_j := after_j || jsonb_build_object(f, new_j -> f);
    end loop;
    insert into public.user_profile_history(user_id, version, changed_fields, before, after)
      values (new.user_id, coalesce(new.version, 1), tracked, null, after_j);
    return new;

  elsif (tg_op = 'UPDATE') then
    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
    foreach f in array tracked loop
      if (old_j -> f) is distinct from (new_j -> f) then
        changed := array_append(changed, f);
        before_j := before_j || jsonb_build_object(f, old_j -> f);
        after_j  := after_j  || jsonb_build_object(f, new_j -> f);
      end if;
    end loop;
    if array_length(changed, 1) is not null then
      insert into public.user_profile_history(user_id, version, changed_fields, before, after)
        values (new.user_id, coalesce(new.version, 1), changed, before_j, after_j);
    end if;
    return new;

  elsif (tg_op = 'DELETE') then
    old_j := to_jsonb(old);
    foreach f in array tracked loop
      before_j := before_j || jsonb_build_object(f, old_j -> f);
    end loop;
    insert into public.user_profile_history(user_id, version, changed_fields, before, after)
      values (old.user_id, coalesce(old.version, 0), tracked, before_j, null);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists user_profiles_history_trg on public.user_profiles;
create trigger user_profiles_history_trg
after insert or update or delete on public.user_profiles
for each row execute function public.user_profiles_record_history();