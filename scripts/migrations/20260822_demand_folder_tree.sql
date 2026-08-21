-- Story 037 (revisao): a hierarquia fixa Espaco > Pasta > Lista vira uma arvore unica
-- de pastas. Pasta raiz e o cliente; dentro dela o operador cria quantas subpastas quiser
-- e a demanda pode morar em qualquer nivel, nao so na folha.

-- Trava: so derruba a estrutura antiga se nenhuma demanda estiver arquivada nela.
do $$ begin
  if exists (select 1 from public.client_demands where list_id is not null) then
    raise exception 'Existe demanda dentro de uma lista; migre os dados antes de derrubar a arvore.';
  end if;
end $$;

alter table public.client_demands drop column if exists list_id;
drop table if exists public.demand_lists;
drop table if exists public.demand_folders;
drop table if exists public.demand_spaces;

create table public.demand_folders (
  id bigint generated always as identity primary key,
  parent_id bigint references public.demand_folders(id) on delete cascade,
  deal_id integer references public.deals(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_demands
  add column folder_id bigint references public.demand_folders(id) on delete set null;

create index if not exists demand_folders_parent_position_idx
  on public.demand_folders (parent_id, position, id);
create index if not exists demand_folders_deal_idx
  on public.demand_folders (deal_id) where deal_id is not null;
create index if not exists client_demands_folder_idx
  on public.client_demands (folder_id) where folder_id is not null;

alter table public.demand_folders enable row level security;

-- Sem policies para anon/authenticated: acesso ocorre via rotas administrativas
-- server-side, mesma decisao de 20260820_client_demands.sql.

drop trigger if exists demand_folders_updated_at on public.demand_folders;
create trigger demand_folders_updated_at
  before update on public.demand_folders
  for each row execute function public.set_client_demand_updated_at();
