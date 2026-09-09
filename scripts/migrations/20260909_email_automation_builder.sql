begin;

create table if not exists public.email_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'validated', 'archived')),
  graph jsonb not null check (jsonb_typeof(graph) = 'object'),
  version integer not null default 1 check (version > 0),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_automation_revisions (
  id bigint generated always as identity primary key,
  automation_id uuid not null references public.email_automations(id) on delete cascade,
  version integer not null check (version > 0),
  graph jsonb not null check (jsonb_typeof(graph) = 'object'),
  name text not null,
  description text not null default '',
  status text not null check (status in ('draft', 'validated', 'archived')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (automation_id, version)
);

create table if not exists public.email_automation_test_runs (
  id bigint generated always as identity primary key,
  automation_id uuid references public.email_automations(id) on delete set null,
  automation_version integer not null check (automation_version > 0),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  trace jsonb not null check (jsonb_typeof(trace) = 'array'),
  status text not null check (status in ('passed', 'failed')),
  error text,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists email_automations_updated_idx
  on public.email_automations (status, updated_at desc, id);
create index if not exists email_automation_revisions_lookup_idx
  on public.email_automation_revisions (automation_id, version desc);
create index if not exists email_automation_test_runs_lookup_idx
  on public.email_automation_test_runs (automation_id, created_at desc);

comment on table public.email_automations is
  'Grafos em rascunho do editor visual. Esta tabela nao ativa nem executa automacoes.';
comment on table public.email_automation_revisions is
  'Fotografias imutaveis de cada versao salva pelo editor visual.';
comment on table public.email_automation_test_runs is
  'Trilhas de simulacao sem efeitos externos.';

alter table public.email_automations enable row level security;
alter table public.email_automation_revisions enable row level security;
alter table public.email_automation_test_runs enable row level security;

drop policy if exists "Allow all" on public.email_automations;
drop policy if exists "Allow all" on public.email_automation_revisions;
drop policy if exists "Allow all" on public.email_automation_test_runs;

revoke all on public.email_automations from anon, authenticated;
revoke all on public.email_automation_revisions from anon, authenticated;
revoke all on public.email_automation_test_runs from anon, authenticated;

drop trigger if exists email_automations_updated_at on public.email_automations;
create trigger email_automations_updated_at
  before update on public.email_automations
  for each row execute function public.set_updated_at();

create or replace function public.create_email_automation(
  p_name text,
  p_description text,
  p_graph jsonb,
  p_created_by text
)
returns setof public.email_automations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created public.email_automations%rowtype;
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    raise exception 'invalid_automation_graph';
  end if;

  insert into public.email_automations (name, description, graph, created_by)
  values (trim(p_name), coalesce(p_description, ''), p_graph, coalesce(p_created_by, ''))
  returning * into v_created;

  insert into public.email_automation_revisions
    (automation_id, version, graph, name, description, status, created_by)
  values
    (v_created.id, v_created.version, v_created.graph, v_created.name,
     v_created.description, v_created.status, v_created.created_by);

  return next v_created;
end;
$$;

revoke execute on function public.create_email_automation(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_email_automation(text, text, jsonb, text)
  to service_role;

create or replace function public.save_email_automation(
  p_id uuid,
  p_expected_version integer,
  p_name text,
  p_description text,
  p_status text,
  p_graph jsonb,
  p_created_by text
)
returns setof public.email_automations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved public.email_automations%rowtype;
begin
  if p_status not in ('draft', 'validated', 'archived') then
    raise exception 'invalid_automation_status';
  end if;
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    raise exception 'invalid_automation_graph';
  end if;

  update public.email_automations
    set name = trim(p_name),
        description = coalesce(p_description, ''),
        status = p_status,
        graph = p_graph,
        version = version + 1
  where id = p_id and version = p_expected_version
  returning * into v_saved;

  if not found then
    raise exception 'version_conflict';
  end if;

  insert into public.email_automation_revisions
    (automation_id, version, graph, name, description, status, created_by)
  values
    (v_saved.id, v_saved.version, v_saved.graph, v_saved.name,
     v_saved.description, v_saved.status, coalesce(p_created_by, ''));

  return next v_saved;
end;
$$;

revoke execute on function public.save_email_automation(uuid, integer, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_email_automation(uuid, integer, text, text, text, jsonb, text)
  to service_role;

commit;
