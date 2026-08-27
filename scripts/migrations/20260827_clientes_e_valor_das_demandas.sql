-- Story 042: cadastro de clientes + valor por demanda.
-- Aditivo e repetivel: pode rodar de novo sem quebrar nem apagar nada.
--
-- Por que a tabela nova: ate aqui "cliente" era o deal ganho. Isso impedia cadastrar
-- quem nunca passou pelo pipeline e nao tinha onde guardar CNPJ/endereco para a nota.
-- O deal continua sendo a origem (deal_id), mas quem manda no cadastro e clients.

create table if not exists public.clients (
  id bigint generated always as identity primary key,
  -- Um deal ganho vira exatamente um cliente. Deal apagado nao apaga o cadastro.
  deal_id integer unique references public.deals(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 240),
  legal_name text not null default '',
  cnpj text,
  state_registration text not null default '',
  municipal_registration text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  segment text not null default '',
  notes text not null default '',
  status text not null default 'active'
    check (status in ('active', 'paused', 'churned')),
  source text not null default 'manual'
    check (source in ('manual', 'pipeline', 'vault')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- CNPJ guardado so em digito: a formatacao e problema da tela, nao do banco.
  constraint clients_cnpj_digits check (cnpj is null or cnpj ~ '^[0-9]{14}$')
);

create unique index if not exists clients_cnpj_key on public.clients (cnpj) where cnpj is not null;
create index if not exists clients_status_name_idx on public.clients (status, name);

alter table public.clients enable row level security;
-- Sem policies para anon/authenticated: acesso via rotas administrativas server-side,
-- mesma decisao de 20260820_client_demands.sql.

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_client_demand_updated_at();

-- Valor e regime de cobranca da demanda. billing_month e a competencia escolhida na mao
-- (default no cadastro = mes do prazo); billing_until fecha uma recorrencia sem apagar
-- o historico dela.
alter table public.client_demands
  add column if not exists client_id bigint references public.clients(id) on delete set null,
  add column if not exists value numeric(12, 2) not null default 0,
  add column if not exists billing_type text not null default 'one_off',
  add column if not exists billing_month text,
  add column if not exists billing_until text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_demands_value_non_negative') then
    alter table public.client_demands
      add constraint client_demands_value_non_negative check (value >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'client_demands_billing_type_valid') then
    alter table public.client_demands
      add constraint client_demands_billing_type_valid check (billing_type in ('one_off', 'monthly'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'client_demands_billing_month_format') then
    alter table public.client_demands
      add constraint client_demands_billing_month_format
      check (billing_month is null or billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'client_demands_billing_until_format') then
    alter table public.client_demands
      add constraint client_demands_billing_until_format
      check (billing_until is null or billing_until ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;

create index if not exists client_demands_client_idx
  on public.client_demands (client_id) where client_id is not null;
create index if not exists client_demands_billing_month_idx
  on public.client_demands (billing_month) where billing_month is not null;

-- Backfill 1: todo deal ganho vira cliente. O CNPJ so viaja quando tem 14 digitos e
-- ninguem mais o usa - o indice unico nao pode estourar no meio da migration.
with candidatos as (
  select
    d.id as deal_id,
    coalesce(nullif(trim(d.company), ''), nullif(trim(d.name), ''), 'Cliente #' || d.id) as name,
    nullif(regexp_replace(coalesce(d.cnpj, ''), '[^0-9]', '', 'g'), '') as cnpj_digits,
    coalesce(d.segment, '') as segment
  from public.deals d
  where d.stage = 'won'
    and not exists (select 1 from public.clients c where c.deal_id = d.id)
),
ranqueados as (
  select
    candidatos.*,
    row_number() over (partition by cnpj_digits order by deal_id) as ordem
  from candidatos
)
insert into public.clients (deal_id, name, cnpj, segment, source, status)
select
  r.deal_id,
  r.name,
  case
    when r.cnpj_digits is not null
      and length(r.cnpj_digits) = 14
      and r.ordem = 1
      and not exists (select 1 from public.clients c2 where c2.cnpj = r.cnpj_digits)
    then r.cnpj_digits
    else null
  end,
  r.segment,
  'pipeline',
  'active'
from ranqueados r;

-- Backfill 2: demanda antiga aponta para o cliente do proprio deal.
update public.client_demands cd
set client_id = c.id
from public.clients c
where cd.client_id is null
  and cd.deal_id is not null
  and c.deal_id = cd.deal_id;

-- Backfill 3: competencia default = mes do prazo (America/Sao_Paulo).
update public.client_demands
set billing_month = to_char(due_at at time zone 'America/Sao_Paulo', 'YYYY-MM')
where billing_month is null
  and due_at is not null;
