-- Story 035: hierarquia de organizacao das demandas (Espaco > Pasta de cliente > Lista).
-- Estrutura aditiva; demandas existentes ficam com list_id nulo e aparecem em "Sem pasta".

create table if not exists public.demand_spaces (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demand_folders (
  id bigint generated always as identity primary key,
  space_id bigint not null references public.demand_spaces(id) on delete cascade,
  deal_id integer references public.deals(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demand_lists (
  id bigint generated always as identity primary key,
  folder_id bigint not null references public.demand_folders(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_demands
  add column if not exists list_id bigint references public.demand_lists(id) on delete set null;

create index if not exists demand_folders_space_position_idx
  on public.demand_folders (space_id, position, id);
create index if not exists demand_folders_deal_idx
  on public.demand_folders (deal_id) where deal_id is not null;
create index if not exists demand_lists_folder_position_idx
  on public.demand_lists (folder_id, position, id);
create index if not exists demand_spaces_position_idx
  on public.demand_spaces (position, id);
create index if not exists client_demands_list_idx
  on public.client_demands (list_id) where list_id is not null;

alter table public.demand_spaces enable row level security;
alter table public.demand_folders enable row level security;
alter table public.demand_lists enable row level security;

-- Sem policies para anon/authenticated: acesso ocorre via rotas administrativas
-- server-side, mesma decisao de 20260820_client_demands.sql.

drop trigger if exists demand_spaces_updated_at on public.demand_spaces;
create trigger demand_spaces_updated_at
  before update on public.demand_spaces
  for each row execute function public.set_client_demand_updated_at();

drop trigger if exists demand_folders_updated_at on public.demand_folders;
create trigger demand_folders_updated_at
  before update on public.demand_folders
  for each row execute function public.set_client_demand_updated_at();

drop trigger if exists demand_lists_updated_at on public.demand_lists;
create trigger demand_lists_updated_at
  before update on public.demand_lists
  for each row execute function public.set_client_demand_updated_at();
