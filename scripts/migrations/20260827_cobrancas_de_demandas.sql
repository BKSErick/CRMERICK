-- Story 042 (parte 3): pago/em aberto nos tres regimes.
-- Aditivo e repetivel.
--
-- A tabela de parcelas vira tabela de COBRANCAS. Uma parcela sempre foi uma cobranca
-- com mes e baixa proprios; pontual e mensal precisam exatamente da mesma coisa:
--   pontual   -> uma cobranca, no mes da competencia
--   parcelado -> N cobrancas, geradas de uma vez
--   mensal    -> uma cobranca por mes, criada quando o mes e baixado
-- Por isso o rename em vez de uma segunda tabela: o dado e o mesmo.

create table if not exists public.client_demand_charges (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  -- 1..N na ordem de cobranca. No mensal e a distancia em meses desde a competencia.
  number integer not null check (number >= 1 and number <= 600),
  billing_month text not null check (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  value numeric(12, 2) not null default 0 check (value >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (demand_id, number)
);

create index if not exists client_demand_charges_demand_idx
  on public.client_demand_charges (demand_id, number);
create index if not exists client_demand_charges_month_idx
  on public.client_demand_charges (billing_month);
create index if not exists client_demand_charges_paid_idx
  on public.client_demand_charges (paid_at) where paid_at is not null;

alter table public.client_demand_charges enable row level security;
-- Sem policies para anon/authenticated: acesso via rotas administrativas server-side.

drop trigger if exists client_demand_charges_updated_at on public.client_demand_charges;
create trigger client_demand_charges_updated_at
  before update on public.client_demand_charges
  for each row execute function public.set_client_demand_updated_at();

-- Migra o que ja foi parcelado hoje e derruba a tabela antiga. A guarda deixa a
-- migration repetivel: rodar de novo com a tabela ja removida e no-op.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_demand_installments'
  ) then
    insert into public.client_demand_charges (demand_id, number, billing_month, value, paid_at, created_at)
    select i.demand_id, i.number, i.billing_month, i.value, i.paid_at, i.created_at
    from public.client_demand_installments i
    where not exists (
      select 1 from public.client_demand_charges c
      where c.demand_id = i.demand_id and c.number = i.number
    );

    drop table public.client_demand_installments;
  end if;
end $$;
