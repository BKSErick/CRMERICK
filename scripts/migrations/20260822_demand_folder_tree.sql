-- Story 037 (revisao): a hierarquia fixa Espaco > Pasta > Lista vira uma arvore unica
-- de pastas. Pasta raiz e o cliente; dentro dela o operador cria quantas subpastas quiser
-- e a demanda pode morar em qualquer nivel, nao so na folha.

-- Trava: so derruba a estrutura antiga se nenhuma demanda estiver arquivada nela.
--
-- A demolicao inteira fica dentro da guarda "a coluna list_id ainda existe?". Sem isso,
-- re-rodar esta migration quebrava (o drop de demand_folders batia na FK client_demands.folder_id)
-- e, pior, se o drop passasse ela apagaria a arvore NOVA junto com o vinculo demanda->pasta.
-- Agora re-rodar e no-op.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_demands' and column_name = 'list_id'
  ) then
    if exists (select 1 from public.client_demands where list_id is not null) then
      raise exception 'Existe demanda dentro de uma lista; migre os dados antes de derrubar a arvore.';
    end if;

    alter table public.client_demands drop column list_id;
    -- Solta a FK antes de derrubar a tabela referenciada.
    alter table public.client_demands drop column if exists folder_id;
    drop table if exists public.demand_lists;
    drop table if exists public.demand_folders;
    drop table if exists public.demand_spaces;
  end if;
end $$;

create table if not exists public.demand_folders (
  id bigint generated always as identity primary key,
  parent_id bigint references public.demand_folders(id) on delete cascade,
  deal_id integer references public.deals(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_demands
  add column if not exists folder_id bigint references public.demand_folders(id) on delete set null;

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
