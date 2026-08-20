-- Story 034: demandas operacionais independentes do Pipeline.
-- Estrutura aditiva; deals removidos preservam a demanda historica.

create table if not exists public.client_demands (
  id bigint generated always as identity primary key,
  deal_id integer references public.deals(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '',
  copy_text text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee text not null default '',
  destination_type text not null default 'other'
    check (destination_type in ('instagram', 'site', 'whatsapp', 'ads', 'presentation', 'drive', 'other')),
  destination_label text not null default '',
  starts_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'done' or completed_at is null)
);

create table if not exists public.client_demand_checklist_items (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 500),
  is_done boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_demand_links (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 240),
  url text not null check (url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_demand_attachments (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  file_name text not null check (length(trim(file_name)) between 1 and 240),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  created_at timestamptz not null default now()
);

create table if not exists public.client_demand_events (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  actor text not null,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists client_demands_due_status_idx
  on public.client_demands (status, due_at);
create index if not exists client_demands_deal_updated_idx
  on public.client_demands (deal_id, updated_at desc);
create index if not exists client_demands_assignee_idx
  on public.client_demands (assignee) where assignee <> '';
create index if not exists client_demand_checklist_demand_position_idx
  on public.client_demand_checklist_items (demand_id, position, id);
create index if not exists client_demand_links_demand_idx
  on public.client_demand_links (demand_id, created_at);
create index if not exists client_demand_attachments_demand_idx
  on public.client_demand_attachments (demand_id, created_at);
create index if not exists client_demand_events_demand_created_idx
  on public.client_demand_events (demand_id, created_at desc);

alter table public.client_demands enable row level security;
alter table public.client_demand_checklist_items enable row level security;
alter table public.client_demand_links enable row level security;
alter table public.client_demand_attachments enable row level security;
alter table public.client_demand_events enable row level security;

-- Sem policies para anon/authenticated: acesso ocorre via rotas administrativas
-- server-side. Signed upload/download nao transforma o bucket em publico.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'demand-attachments',
  'demand-attachments',
  false,
  104857600,
  array[
    'image/*', 'video/*', 'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'text/csv', 'text/plain'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.set_client_demand_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_demands_updated_at on public.client_demands;
create trigger client_demands_updated_at
  before update on public.client_demands
  for each row execute function public.set_client_demand_updated_at();

drop trigger if exists client_demand_checklist_updated_at on public.client_demand_checklist_items;
create trigger client_demand_checklist_updated_at
  before update on public.client_demand_checklist_items
  for each row execute function public.set_client_demand_updated_at();

drop trigger if exists client_demand_links_updated_at on public.client_demand_links;
create trigger client_demand_links_updated_at
  before update on public.client_demand_links
  for each row execute function public.set_client_demand_updated_at();
