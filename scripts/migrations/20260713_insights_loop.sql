-- Insights loop: captura de dores/mensagens por deal + repositorio de insights
-- destilados pelo Webson. ADITIVO (IF NOT EXISTS): nao altera nem remove dados.

-- Campos de captura no card (o operador cola na mao):
alter table public.deals add column if not exists pains text;
alter table public.deals add column if not exists lead_messages text;

-- Repositorio de insights (consultavel na futura aba Insights):
create table if not exists public.insights (
  id bigint generated always as identity primary key,
  deal_id bigint references public.deals(id) on delete set null,
  company text,
  type text not null default 'geral',   -- dor | objecao | converteu | geral
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists insights_deal_id_idx on public.insights(deal_id);
create index if not exists insights_created_at_idx on public.insights(created_at desc);

-- RLS deny-by-default: acesso somente via service-role nas rotas server-side
-- (mesmo padrao de deals/contacts/pixel_events). Sem policy publica.
alter table public.insights enable row level security;
