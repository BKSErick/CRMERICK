-- Story 043: contratos versionados dentro de Clientes.
-- Aditivo, repetivel e sem acesso direto para anon/authenticated.

alter table public.clients
  add column if not exists representative_name text not null default '',
  add column if not exists representative_document text not null default '';

create table if not exists public.client_contract_number_counters (
  contract_year integer primary key check (contract_year between 2020 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_contracts (
  id bigint generated always as identity primary key,
  contract_number text not null unique check (contract_number ~ '^CTR-[0-9]{4}-[0-9]{4,}$'),
  client_id bigint references public.clients(id) on delete set null,
  template_key text not null check (template_key in (
    'general_services', 'visual_identity', 'social_media', 'mydrion_technology'
  )),
  template_version integer not null default 1 check (template_version > 0),
  status text not null default 'draft' check (status in (
    'draft', 'generated', 'sent', 'signed', 'cancelled'
  )),
  title text not null check (length(trim(title)) between 1 and 240),
  draft_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_payload) = 'object'),
  client_snapshot jsonb check (client_snapshot is null or jsonb_typeof(client_snapshot) = 'object'),
  provider_snapshot jsonb check (provider_snapshot is null or jsonb_typeof(provider_snapshot) = 'object'),
  document_snapshot jsonb check (document_snapshot is null or jsonb_typeof(document_snapshot) = 'object'),
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contracts_generated_snapshot check (
    status in ('draft', 'cancelled')
    or (generated_at is not null and client_snapshot is not null and provider_snapshot is not null and document_snapshot is not null)
  )
);

create index if not exists client_contracts_client_updated_idx
  on public.client_contracts (client_id, updated_at desc);

alter table public.client_contracts enable row level security;
alter table public.client_contract_number_counters enable row level security;
revoke all on public.client_contracts from anon, authenticated;
revoke all on public.client_contract_number_counters from anon, authenticated;

drop trigger if exists client_contracts_updated_at on public.client_contracts;
create trigger client_contracts_updated_at before update on public.client_contracts
  for each row execute function public.set_client_demand_updated_at();

create or replace function public.allocate_client_contract_number(
  p_year integer default extract(year from timezone('America/Sao_Paulo', now()))::integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  if p_year < 2020 or p_year > 9999 then
    raise exception 'Ano de contrato invalido.';
  end if;
  perform pg_advisory_xact_lock(20260829, p_year);
  insert into public.client_contract_number_counters (contract_year, last_number)
  values (p_year, 1)
  on conflict (contract_year) do update
    set last_number = public.client_contract_number_counters.last_number + 1,
        updated_at = now()
  returning last_number into v_number;
  return 'CTR-' || p_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

revoke all on function public.allocate_client_contract_number(integer) from public, anon, authenticated;
grant execute on function public.allocate_client_contract_number(integer) to service_role;
