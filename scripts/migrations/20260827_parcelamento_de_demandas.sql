-- Story 042 (parte 2): venda parcelada.
-- Aditivo e repetivel.
--
-- Pontual e mensal nao davam conta de "3x, uma ja paga": o mes de cada parcela e o
-- que ja entrou precisam existir como dado. Cada parcela e uma linha - assim ela pode
-- cair em mes fora da sequencia (entrada + 30/60) e ser marcada como paga sozinha.

create table if not exists public.client_demand_installments (
  id bigint generated always as identity primary key,
  demand_id bigint not null references public.client_demands(id) on delete cascade,
  number integer not null check (number >= 1 and number <= 60),
  billing_month text not null check (billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  value numeric(12, 2) not null default 0 check (value >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (demand_id, number)
);

create index if not exists client_demand_installments_demand_idx
  on public.client_demand_installments (demand_id, number);
create index if not exists client_demand_installments_month_idx
  on public.client_demand_installments (billing_month);

alter table public.client_demand_installments enable row level security;
-- Sem policies para anon/authenticated: acesso via rotas administrativas server-side.

drop trigger if exists client_demand_installments_updated_at on public.client_demand_installments;
create trigger client_demand_installments_updated_at
  before update on public.client_demand_installments
  for each row execute function public.set_client_demand_updated_at();

-- billing_type ganha o terceiro regime.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'client_demands_billing_type_valid') then
    alter table public.client_demands drop constraint client_demands_billing_type_valid;
  end if;
  alter table public.client_demands
    add constraint client_demands_billing_type_valid
    check (billing_type in ('one_off', 'monthly', 'installment'));
end $$;
