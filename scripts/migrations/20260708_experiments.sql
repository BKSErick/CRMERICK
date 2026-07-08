-- Story 015: tabela de experimentos de prospeccao (Lab).
-- ADITIVO (IF NOT EXISTS). RLS deny-by-default: acesso so via rota server-side service-role,
-- no mesmo padrao de deals/contacts/activities.

create table if not exists public.experiments (
  id          serial primary key,
  name        text not null,
  hypothesis  text,
  channel     text,                        -- whatsapp | email | linkedin | instagram
  segment     text,
  script_ref  text,
  status      text default 'planejado',    -- planejado | rodando | concluido
  result      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.experiments enable row level security;
drop policy if exists "Allow all" on public.experiments;
