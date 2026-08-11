-- Story 031: razoes de perda estruturadas e historico imutavel.
-- Nenhum deal legado e classificado ou alterado por esta migration.

alter table public.deals
  add column if not exists loss_reason_code text,
  add column if not exists loss_reason_note text,
  add column if not exists loss_recorded_at timestamptz,
  add column if not exists loss_recorded_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_loss_reason_code_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_loss_reason_code_check check (
      loss_reason_code is null or loss_reason_code in (
        'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
        'bad_timing', 'competitor', 'bad_offer', 'no_fit',
        'invalid_channel_data', 'other'
      )
    );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_loss_other_note_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_loss_other_note_check check (
      loss_reason_code <> 'other' or nullif(trim(loss_reason_note), '') is not null
    );
  end if;
end $$;

create table if not exists public.deal_loss_records (
  id bigint generated always as identity primary key,
  deal_id integer references public.deals(id) on delete set null,
  episode_id uuid not null default gen_random_uuid(),
  reason_code text not null check (reason_code in (
    'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
    'bad_timing', 'competitor', 'bad_offer', 'no_fit',
    'invalid_channel_data', 'other'
  )),
  note text,
  previous_stage text not null,
  company_snapshot text,
  segment_snapshot text,
  origin_snapshot text,
  value_snapshot numeric,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by text,
  superseded_reason text check (superseded_reason is null or superseded_reason in ('corrected', 'reopened')),
  supersedes_id bigint references public.deal_loss_records(id) on delete set null,
  constraint deal_loss_records_other_note_check check (
    reason_code <> 'other' or nullif(trim(note), '') is not null
  )
);

create unique index if not exists deal_loss_records_one_active_idx
  on public.deal_loss_records(deal_id)
  where deal_id is not null and superseded_at is null;
create index if not exists deal_loss_records_period_idx
  on public.deal_loss_records(recorded_at desc, reason_code);
create index if not exists deal_loss_records_episode_idx
  on public.deal_loss_records(episode_id, recorded_at desc);

alter table public.deal_loss_records enable row level security;
drop policy if exists "Allow all" on public.deal_loss_records;
revoke all on table public.deal_loss_records from public, anon, authenticated;

create or replace function public.transition_deal_stage_atomic(
  p_deal_id bigint,
  p_target_stage text,
  p_reason_code text default null,
  p_reason_note text default null,
  p_actor text default null
)
returns public.deals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals%rowtype;
  v_record public.deal_loss_records%rowtype;
  v_now timestamptz := now();
begin
  if p_deal_id is null or p_deal_id <= 0 then
    raise exception 'Deal invalido.';
  end if;
  if p_target_stage is null or not (p_target_stage = any(array[
    'prospect', 'abordado', 'followup', 'qualified', 'proposal',
    'negotiation', 'won', 'lost'
  ])) then
    raise exception 'Etapa de destino invalida.';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Autoria da transicao e obrigatoria.';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;
  if not found then
    raise exception 'Deal % nao encontrado.', p_deal_id;
  end if;
  if v_deal.stage = p_target_stage then
    return v_deal;
  end if;

  if p_target_stage = 'lost' then
    if p_reason_code is null or not (p_reason_code = any(array[
      'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
      'bad_timing', 'competitor', 'bad_offer', 'no_fit',
      'invalid_channel_data', 'other'
    ])) then
      raise exception 'Razao de perda invalida.';
    end if;
    if p_reason_code = 'other' and nullif(trim(p_reason_note), '') is null then
      raise exception 'Nota e obrigatoria para a razao Outro.';
    end if;

    insert into public.deal_loss_records (
      deal_id, reason_code, note, previous_stage, company_snapshot,
      segment_snapshot, origin_snapshot, value_snapshot, recorded_by, recorded_at
    ) values (
      v_deal.id, p_reason_code, nullif(trim(p_reason_note), ''), v_deal.stage,
      coalesce(v_deal.company, v_deal.name), v_deal.segment, v_deal.origin,
      v_deal.value, trim(p_actor), v_now
    )
    returning * into v_record;

    update public.deals
    set stage = 'lost',
        stage_entered_at = v_now,
        loss_reason_code = p_reason_code,
        loss_reason_note = nullif(trim(p_reason_note), ''),
        loss_recorded_at = v_now,
        loss_recorded_by = trim(p_actor)
    where id = v_deal.id;

    insert into public.activities (deal_id, type, description, metadata, created_at)
    values
      (v_deal.id, 'stage_change', 'Movido para Lost', jsonb_build_object(
        'previous_stage', v_deal.stage, 'stage', 'lost', 'atomic', true
      ), v_now),
      (v_deal.id, 'deal_lost', 'Perda registrada: ' || p_reason_code, jsonb_build_object(
        'loss_record_id', v_record.id, 'episode_id', v_record.episode_id,
        'reason_code', p_reason_code, 'note', nullif(trim(p_reason_note), ''),
        'actor', trim(p_actor)
      ), v_now);

  elsif v_deal.stage = 'lost' then
    select * into v_record
    from public.deal_loss_records
    where deal_id = v_deal.id and superseded_at is null
    order by recorded_at desc, id desc
    limit 1
    for update;

    if found then
      update public.deal_loss_records
      set superseded_at = v_now,
          superseded_by = trim(p_actor),
          superseded_reason = 'reopened'
      where id = v_record.id;
    end if;

    update public.deals
    set stage = p_target_stage,
        stage_entered_at = v_now,
        loss_reason_code = null,
        loss_reason_note = null,
        loss_recorded_at = null,
        loss_recorded_by = null
    where id = v_deal.id;

    insert into public.activities (deal_id, type, description, metadata, created_at)
    values
      (v_deal.id, 'stage_change', 'Movido para ' || p_target_stage, jsonb_build_object(
        'previous_stage', 'lost', 'stage', p_target_stage, 'atomic', true
      ), v_now),
      (v_deal.id, 'deal_reopened', 'Negocio reaberto em ' || p_target_stage, jsonb_build_object(
        'loss_record_id', v_record.id, 'episode_id', v_record.episode_id,
        'actor', trim(p_actor)
      ), v_now);
  else
    update public.deals
    set stage = p_target_stage,
        stage_entered_at = v_now
    where id = v_deal.id;

    insert into public.activities (deal_id, type, description, metadata, created_at)
    values (v_deal.id, 'stage_change', 'Movido para ' || p_target_stage, jsonb_build_object(
      'previous_stage', v_deal.stage, 'stage', p_target_stage, 'atomic', true
    ), v_now);
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  return v_deal;
end;
$$;

create or replace function public.correct_deal_loss_reason_atomic(
  p_deal_id bigint,
  p_reason_code text,
  p_reason_note text default null,
  p_actor text default null
)
returns public.deals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals%rowtype;
  v_previous public.deal_loss_records%rowtype;
  v_current public.deal_loss_records%rowtype;
  v_now timestamptz := now();
begin
  if p_deal_id is null or p_deal_id <= 0 then
    raise exception 'Deal invalido.';
  end if;
  if p_reason_code is null or not (p_reason_code = any(array[
    'no_budget', 'no_priority', 'no_response', 'no_decision_maker_access',
    'bad_timing', 'competitor', 'bad_offer', 'no_fit',
    'invalid_channel_data', 'other'
  ])) then
    raise exception 'Razao de perda invalida.';
  end if;
  if p_reason_code = 'other' and nullif(trim(p_reason_note), '') is null then
    raise exception 'Nota e obrigatoria para a razao Outro.';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Autoria da correcao e obrigatoria.';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;
  if not found then
    raise exception 'Deal % nao encontrado.', p_deal_id;
  end if;
  if v_deal.stage <> 'lost' then
    raise exception 'Somente deals em lost aceitam correcao do motivo.';
  end if;

  select * into v_previous
  from public.deal_loss_records
  where deal_id = v_deal.id and superseded_at is null
  order by recorded_at desc, id desc
  limit 1
  for update;
  if not found then
    raise exception 'Deal legado sem registro auditavel; reabra e registre uma nova perda.';
  end if;

  update public.deal_loss_records
  set superseded_at = v_now,
      superseded_by = trim(p_actor),
      superseded_reason = 'corrected'
  where id = v_previous.id;

  insert into public.deal_loss_records (
    deal_id, episode_id, reason_code, note, previous_stage,
    company_snapshot, segment_snapshot, origin_snapshot, value_snapshot,
    recorded_by, recorded_at, supersedes_id
  ) values (
    v_deal.id, v_previous.episode_id, p_reason_code, nullif(trim(p_reason_note), ''),
    v_previous.previous_stage, v_previous.company_snapshot, v_previous.segment_snapshot,
    v_previous.origin_snapshot, v_previous.value_snapshot, trim(p_actor), v_now,
    v_previous.id
  )
  returning * into v_current;

  update public.deals
  set loss_reason_code = p_reason_code,
      loss_reason_note = nullif(trim(p_reason_note), ''),
      loss_recorded_at = v_now,
      loss_recorded_by = trim(p_actor)
  where id = v_deal.id;

  insert into public.activities (deal_id, type, description, metadata, created_at)
  values (v_deal.id, 'deal_loss_corrected', 'Motivo da perda corrigido para ' || p_reason_code, jsonb_build_object(
    'previous_loss_record_id', v_previous.id, 'loss_record_id', v_current.id,
    'episode_id', v_current.episode_id, 'reason_code', p_reason_code,
    'note', nullif(trim(p_reason_note), ''), 'actor', trim(p_actor)
  ), v_now);

  select * into v_deal from public.deals where id = p_deal_id;
  return v_deal;
end;
$$;

revoke all on function public.transition_deal_stage_atomic(bigint, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.correct_deal_loss_reason_atomic(bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_deal_stage_atomic(bigint, text, text, text, text)
  to service_role;
grant execute on function public.correct_deal_loss_reason_atomic(bigint, text, text, text)
  to service_role;
