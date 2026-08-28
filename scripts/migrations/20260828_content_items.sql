-- Conteudo por canal: o backlog editorial sai do JSON estatico (content/conteudo.json)
-- e vira tabela, que e o que permite editar, marcar data de postagem e guardar o que
-- ja foi publicado no mesmo lugar. Antes disso a tela /conteudo era read-only.
--
-- `scheduled_at` + status 'agendado' nascem aqui de proposito mesmo sem motor de
-- agendamento: hoje a publicacao e manual ("Publicar agora"), e ligar um cron depois
-- (pg_cron -> /api/content/publish-due) nao vai exigir migration nova.

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('instagram', 'threads')),
  -- 'Carrossel' fica no check mesmo sem publicacao implementada: a Graph API exige
  -- containers filhos, e deixar o valor liberado evita migration quando isso entrar.
  type text not null check (type in ('Post', 'Story', 'Reel', 'Carrossel', 'Thread')),
  title text,
  hook text,
  excerpt text,
  caption text,
  media_url text,
  media_path text,
  media_kind text check (media_kind in ('image', 'video')),
  status text not null default 'planejado'
    check (status in ('rascunho', 'planejado', 'agendado', 'publicado', 'falhou')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  permalink text,
  error_message text,
  source text,
  legacy_n integer,
  metrics jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guarda o upsert do sync do Instagram: a mesma midia nao pode entrar duas vezes.
-- Guarda o seed do vault: rodar seed-content-items.mjs de novo atualiza em vez de duplicar.
--
-- Os dois indices sao INTEIROS, sem `where ... is not null`, de proposito: Postgres trata
-- NULL como distinto em indice unico (varias linhas com external_id nulo convivem), e um
-- indice parcial nao seria inferido pelo `on conflict (...)` do upsert sem repetir o
-- predicado — que o cliente do Supabase nao deixa passar.
create unique index if not exists content_items_external_uk
  on public.content_items (channel, external_id);

create unique index if not exists content_items_legacy_uk
  on public.content_items (channel, type, legacy_n);

create index if not exists content_items_agenda_idx
  on public.content_items (channel, status, scheduled_at);

create index if not exists content_items_timeline_idx
  on public.content_items (channel, coalesce(scheduled_at, published_at, created_at) desc);

alter table public.content_items enable row level security;

-- Sem policies para anon/authenticated: o acesso e por rotas administrativas
-- server-side com service role, mesma decisao de 20260820_client_demands.sql.

create or replace function public.set_content_item_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists content_items_updated_at on public.content_items;
create trigger content_items_updated_at
  before update on public.content_items
  for each row execute function public.set_content_item_updated_at();
