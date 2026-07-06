/**
 * supabase-schema.sql
 * Rode isso no SQL Editor do Supabase (https://rezgkabwxxltpprpvdua.supabase.co)
 * ou via: supabase db push (se usar CLI com migration)
 */

-- ─────────────────────────────────────────────
-- DEALS (Kanban cards / pipeline)
-- ─────────────────────────────────────────────
create table if not exists public.deals (
  id            serial primary key,
  name          text not null,
  company       text,
  segment       text,
  value         numeric default 0,
  prob          numeric default 0,
  stage         text default 'prospect',   -- prospect | qualified | proposal | negotiation | won | lost
  owner         text,
  owner_name    text,
  close_date    text,
  tag           text,
  tag_type      text,
  ticket_id     text,
  points        integer default 0,
  progress      integer default 0,
  assignee      text,
  analysis_url  text,
  copy_text     text,
  site_url      text,
  status        text default 'open',       -- open | won | lost
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- CONTACTS
-- ─────────────────────────────────────────────
create table if not exists public.contacts (
  id          serial primary key,
  name        text not null,
  company     text,
  email       text default '—',
  phone       text default '—',
  whatsapp    text,
  status      text default 'lead',         -- lead | active | client | lost
  initials    text,
  owner       text,
  owner_name  text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- MESSAGES (histórico de disparo)
-- ─────────────────────────────────────────────
create table if not exists public.messages (
  id          serial primary key,
  deal_id     integer references public.deals(id),
  contact_id  integer references public.contacts(id),
  channel     text default 'whatsapp',     -- whatsapp | instagram | email
  content     text,
  status      text default 'draft',        -- draft | sent | read | replied | bounced
  sent_at     timestamptz,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- ACTIVITIES (log de interações)
-- ─────────────────────────────────────────────
create table if not exists public.activities (
  id          serial primary key,
  deal_id     integer references public.deals(id),
  contact_id  integer references public.contacts(id),
  type        text,                         -- note | call | email | meeting | stage_change
  description text,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────
-- RLS: Habilita Row-Level Security
-- ─────────────────────────────────────────────
alter table public.deals      enable row level security;
alter table public.contacts   enable row level security;
alter table public.messages   enable row level security;
alter table public.activities enable row level security;

-- Políticas abertas (single-user CRM — só você acessa)
-- Futuramente: adicionar auth.uid() = owner_id se multi-user
create policy "Allow all" on public.deals      for all using (true) with check (true);
create policy "Allow all" on public.contacts   for all using (true) with check (true);
create policy "Allow all" on public.messages   for all using (true) with check (true);
create policy "Allow all" on public.activities for all using (true) with check (true);

-- ─────────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- INDEXES para performance
-- ─────────────────────────────────────────────
create index if not exists idx_deals_stage    on public.deals(stage);
create index if not exists idx_deals_owner    on public.deals(owner);
create index if not exists idx_contacts_status on public.contacts(status);
create index if not exists idx_messages_deal  on public.messages(deal_id);
create index if not exists idx_messages_status on public.messages(status);
