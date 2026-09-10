begin;

create table if not exists public.email_automation_enrollments (
  id bigint generated always as identity primary key,
  automation_id uuid not null references public.email_automations(id) on delete cascade,
  automation_version integer not null check (automation_version > 0),
  deal_id integer not null references public.deals(id) on delete cascade,
  contact_id integer references public.contacts(id) on delete set null,
  recipient_email text not null check (recipient_email = lower(trim(recipient_email)) and position('@' in recipient_email) > 1),
  company text not null default '',
  contact_name text not null default '',
  started_at timestamptz not null default now(),
  next_step integer not null default 0 check (next_step >= 0),
  next_due_at timestamptz not null default now(),
  last_sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed', 'stopped')),
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, recipient_email)
);

create table if not exists public.email_automation_dispatches (
  id bigint generated always as identity primary key,
  enrollment_id bigint not null references public.email_automation_enrollments(id) on delete cascade,
  automation_id uuid not null references public.email_automations(id) on delete cascade,
  automation_version integer not null check (automation_version > 0),
  node_id text not null,
  step_index integer not null check (step_index >= 0),
  idempotency_key text not null unique,
  recipient_email text not null,
  subject text not null,
  html_snapshot text not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed', 'uncertain', 'skipped')),
  provider_message_id text,
  error text,
  created_by text not null default '',
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, step_index)
);

create index if not exists email_automation_enrollments_due_idx
  on public.email_automation_enrollments (automation_id, automation_version, status, next_due_at, id);
create index if not exists email_automation_dispatches_daily_idx
  on public.email_automation_dispatches (claimed_at desc, status, id);

comment on table public.email_automation_enrollments is
  'Progresso persistente de cada destinatario no disparo manual de uma automacao validada.';
comment on table public.email_automation_dispatches is
  'Claim idempotente e snapshot de cada e-mail tentado pelo operador no CRM.';

alter table public.email_automation_enrollments enable row level security;
alter table public.email_automation_dispatches enable row level security;
revoke all on public.email_automation_enrollments from anon, authenticated;
revoke all on public.email_automation_dispatches from anon, authenticated;

drop trigger if exists email_automation_enrollments_updated_at on public.email_automation_enrollments;
create trigger email_automation_enrollments_updated_at
  before update on public.email_automation_enrollments
  for each row execute function public.set_updated_at();
drop trigger if exists email_automation_dispatches_updated_at on public.email_automation_dispatches;
create trigger email_automation_dispatches_updated_at
  before update on public.email_automation_dispatches
  for each row execute function public.set_updated_at();

create or replace function public.claim_email_automation_dispatch(
  p_automation_id uuid,
  p_automation_version integer,
  p_enrollment_id bigint,
  p_node_id text,
  p_step_index integer,
  p_recipient_email text,
  p_subject text,
  p_html text,
  p_idempotency_key text,
  p_actor text,
  p_daily_cap integer
)
returns table (dispatch_id bigint, idempotency_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.email_automation_enrollments%rowtype;
  v_day_start timestamptz;
  v_legacy_count integer;
  v_claimed_count integer;
  v_dispatch_id bigint;
begin
  if p_daily_cap is null or p_daily_cap not between 1 and 250 then
    raise exception 'invalid_daily_cap';
  end if;
  if nullif(trim(p_subject), '') is null or nullif(trim(p_html), '') is null then
    raise exception 'empty_email_snapshot';
  end if;

  -- Um lock por dia torna a soma do limite e o claim uma unica decisao atomica.
  perform pg_advisory_xact_lock(
    20260910,
    (timezone('America/Sao_Paulo', now())::date - date '2020-01-01')::integer
  );

  if not exists (
    select 1 from public.email_automations
    where id = p_automation_id and version = p_automation_version and status = 'validated'
  ) then
    raise exception 'automation_not_validated';
  end if;

  select * into v_enrollment
  from public.email_automation_enrollments
  where id = p_enrollment_id
  for update;

  if not found
     or v_enrollment.automation_id <> p_automation_id
     or v_enrollment.automation_version <> p_automation_version
     or v_enrollment.status <> 'pending'
     or v_enrollment.next_step <> p_step_index
     or v_enrollment.next_due_at > now()
     or v_enrollment.recipient_email <> lower(trim(p_recipient_email)) then
    return;
  end if;

  v_day_start := date_trunc('day', timezone('America/Sao_Paulo', now()))
    at time zone 'America/Sao_Paulo';

  -- Atividades antigas nao possuem dispatch_id. As novas sao contadas pelo claim,
  -- inclusive enquanto a chamada ao provedor ainda esta em andamento.
  select count(*)::integer into v_legacy_count
  from public.activities
  where type = 'email_sent'
    and created_at >= v_day_start
    and nullif(metadata->>'dispatch_id', '') is null;

  select count(*)::integer into v_claimed_count
  from public.email_automation_dispatches
  where claimed_at >= v_day_start
    and status in ('claimed', 'sent', 'uncertain');

  if v_legacy_count + v_claimed_count >= p_daily_cap then return; end if;

  -- Mesmo que o operador clique novamente, um destinatario avanca no maximo uma
  -- etapa por dia e uma mesma etapa jamais ganha um segundo claim.
  if exists (
    select 1 from public.email_automation_dispatches
    where enrollment_id = p_enrollment_id
      and claimed_at >= v_day_start
      and status in ('claimed', 'sent', 'uncertain')
  ) then return; end if;

  insert into public.email_automation_dispatches (
    enrollment_id, automation_id, automation_version, node_id, step_index,
    idempotency_key, recipient_email, subject, html_snapshot, created_by
  ) values (
    p_enrollment_id, p_automation_id, p_automation_version, p_node_id, p_step_index,
    p_idempotency_key, lower(trim(p_recipient_email)), p_subject, p_html, coalesce(p_actor, '')
  )
  on conflict do nothing
  returning id into v_dispatch_id;

  if v_dispatch_id is null then return; end if;
  return query select v_dispatch_id, p_idempotency_key;
end;
$$;

revoke all on function public.claim_email_automation_dispatch(
  uuid, integer, bigint, text, integer, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.claim_email_automation_dispatch(
  uuid, integer, bigint, text, integer, text, text, text, text, text, integer
) to service_role;

create or replace function public.complete_email_automation_dispatch(
  p_dispatch_id bigint,
  p_provider_message_id text,
  p_next_step integer,
  p_next_due_at timestamptz,
  p_completed boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatch public.email_automation_dispatches%rowtype;
  v_enrollment public.email_automation_enrollments%rowtype;
begin
  select * into v_dispatch
  from public.email_automation_dispatches
  where id = p_dispatch_id
  for update;
  if not found then raise exception 'dispatch_not_found'; end if;
  if v_dispatch.status = 'sent' then return true; end if;
  if v_dispatch.status <> 'claimed' then raise exception 'dispatch_not_claimed'; end if;
  if nullif(trim(p_provider_message_id), '') is null then raise exception 'provider_message_id_required'; end if;

  select * into v_enrollment
  from public.email_automation_enrollments
  where id = v_dispatch.enrollment_id
  for update;
  if not found or v_enrollment.next_step <> v_dispatch.step_index then
    raise exception 'enrollment_step_conflict';
  end if;

  update public.email_automation_dispatches
  set status = 'sent', provider_message_id = trim(p_provider_message_id), sent_at = now(), error = null
  where id = p_dispatch_id;

  update public.email_automation_enrollments
  set next_step = p_next_step,
      next_due_at = coalesce(p_next_due_at, now()),
      last_sent_at = now(),
      status = case when p_completed then 'completed' else 'pending' end,
      stop_reason = null
  where id = v_dispatch.enrollment_id;

  insert into public.activities (deal_id, contact_id, type, description, metadata, created_at)
  values (
    v_enrollment.deal_id,
    v_enrollment.contact_id,
    'email_sent',
    'E-mail enviado para ' || v_dispatch.recipient_email || ': ' || v_dispatch.subject,
    jsonb_build_object(
      'provider', 'brevo',
      'message_id', trim(p_provider_message_id),
      'automation_id', v_dispatch.automation_id::text,
      'automation_version', v_dispatch.automation_version,
      'node_id', v_dispatch.node_id,
      'step_index', v_dispatch.step_index,
      'dispatch_id', v_dispatch.id::text,
      'mode', 'manual_crm'
    ),
    now()
  );
  return true;
end;
$$;

revoke all on function public.complete_email_automation_dispatch(bigint, text, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_email_automation_dispatch(bigint, text, integer, timestamptz, boolean)
  to service_role;

commit;
