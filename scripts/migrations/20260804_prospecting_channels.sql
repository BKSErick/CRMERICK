begin;

create table if not exists public.prospecting_channels (
  id bigserial primary key,
  deal_id integer not null references public.deals(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'whatsapp', 'email', 'linkedin')),
  identity text,
  profile_url text,
  match_source text,
  match_confidence text not null default 'low'
    check (match_confidence in ('low', 'medium', 'high')),
  status text not null default 'review'
    check (status in ('review', 'ready', 'opened', 'contacted', 'replied', 'paused', 'opted_out')),
  last_opened_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  next_action_at timestamptz,
  next_action_type text,
  next_action_note text,
  response_type text not null default 'sem_resposta'
    check (response_type in ('sem_resposta', 'bot', 'humana', 'encaminhamento', 'objecao', 'perdido')),
  response_type_source text not null default 'automatic'
    check (response_type_source in ('automatic', 'manual')),
  opted_out_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, channel)
);

create unique index if not exists prospecting_channels_identity_unique
  on public.prospecting_channels(channel, lower(identity))
  where identity is not null;
create index if not exists prospecting_channels_queue_idx
  on public.prospecting_channels(channel, status, next_action_at);

alter table public.prospecting_channels enable row level security;
drop policy if exists "Allow all" on public.prospecting_channels;

drop trigger if exists prospecting_channels_set_updated_at on public.prospecting_channels;
create trigger prospecting_channels_set_updated_at
  before update on public.prospecting_channels
  for each row execute function public.set_updated_at();

commit;
