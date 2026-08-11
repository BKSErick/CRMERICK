-- Story 027: motor central, versionado e seguro de eventos e acoes comerciais.
-- Migration aditiva. RLS deny-by-default; somente rotas/CLIs server-side usam service-role.

alter table public.deals
  add column if not exists priority text,
  add column if not exists priority_source text not null default 'automatic';

update public.deals
set priority_source = 'manual'
where nullif(trim(priority), '') is not null and priority_source = 'automatic';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_priority_source_check' and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals add constraint deals_priority_source_check
      check (priority_source in ('automatic', 'manual'));
  end if;
end $$;

create table if not exists public.commercial_events (
  id bigserial primary key,
  external_key text not null unique,
  contract_version integer not null default 1 check (contract_version > 0),
  event_type text not null check (event_type in (
    'message.received', 'message.sent', 'deal.stage_changed',
    'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed'
  )),
  deal_id integer references public.deals(id) on delete set null,
  source text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.commercial_automation_rules (
  id text primary key,
  name text not null,
  description text not null default '',
  version integer not null default 1 check (version > 0),
  event_type text not null check (event_type in (
    'message.received', 'message.sent', 'deal.stage_changed',
    'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed'
  )),
  conditions jsonb not null default '[]'::jsonb,
  action_type text not null check (action_type in (
    'task.upsert', 'priority.set', 'draft.create', 'alert.create', 'confirmation.request'
  )),
  action_payload jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_automation_runs (
  id bigserial primary key,
  event_id bigint not null references public.commercial_events(id) on delete cascade,
  execution_key text not null unique,
  deal_id integer references public.deals(id) on delete set null,
  rule_id text not null references public.commercial_automation_rules(id) on delete restrict,
  rule_version integer not null,
  event_type text not null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('planned', 'applied', 'awaiting_confirmation', 'skipped', 'failed')),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists commercial_events_deal_occurred_idx
  on public.commercial_events (deal_id, occurred_at desc);
create index if not exists commercial_rules_event_enabled_idx
  on public.commercial_automation_rules (event_type, enabled);
create index if not exists commercial_runs_deal_created_idx
  on public.commercial_automation_runs (deal_id, created_at desc);
create index if not exists commercial_runs_status_created_idx
  on public.commercial_automation_runs (status, created_at desc);

alter table public.commercial_events enable row level security;
alter table public.commercial_automation_rules enable row level security;
alter table public.commercial_automation_runs enable row level security;
drop policy if exists "Allow all" on public.commercial_events;
drop policy if exists "Allow all" on public.commercial_automation_rules;
drop policy if exists "Allow all" on public.commercial_automation_runs;

drop trigger if exists commercial_automation_rules_updated_at on public.commercial_automation_rules;
create trigger commercial_automation_rules_updated_at
  before update on public.commercial_automation_rules
  for each row execute function public.set_updated_at();

insert into public.commercial_automation_rules
  (id, name, description, version, event_type, conditions, action_type, action_payload, enabled)
values
  ('inbound-next-action-v1', 'Proxima acao apos resposta', 'Cria tarefa segura a partir de uma mensagem recebida.', 1, 'message.received',
   '[{"field":"event.payload.suggestedTask.at","operator":"exists"}]'::jsonb, 'task.upsert',
   '{"nextActionAt":"$event.payload.suggestedTask.at","nextActionType":"$event.payload.suggestedTask.type","note":"$event.payload.suggestedTask.note"}'::jsonb, true),
  ('outbound-next-action-v1', 'Proxima acao apos envio', 'Agenda o follow-up sem enviar mensagem automaticamente.', 1, 'message.sent',
   '[{"field":"event.payload.suggestedTask.at","operator":"exists"}]'::jsonb, 'task.upsert',
   '{"nextActionAt":"$event.payload.suggestedTask.at","nextActionType":"$event.payload.suggestedTask.type","note":"$event.payload.suggestedTask.note"}'::jsonb, true),
  ('won-stage-alert-v1', 'Alerta de oportunidade ganha', 'Destaca a mudanca manual para a etapa ganha.', 1, 'deal.stage_changed',
   '[{"field":"event.payload.stage","operator":"equals","value":"won"}]'::jsonb, 'alert.create',
   '{"message":"Oportunidade marcada como ganha. Confira o fechamento."}'::jsonb, true),
  ('hot-score-priority-v1', 'Prioridade para lead quente', 'Sugere prioridade alta quando o score chega a 60.', 1, 'deal.score_updated',
   '[{"field":"event.payload.score","operator":"gte","value":60}]'::jsonb, 'priority.set',
   '{"priority":"Alta"}'::jsonb, true),
  ('due-next-action-alert-v1', 'Alerta de proxima acao vencida', 'Exibe no Comando uma proxima acao vencida.', 1, 'deal.next_action_due',
   '[]'::jsonb, 'alert.create', '{"message":"Proxima acao comercial vencida."}'::jsonb, true),
  ('held-meeting-confirmation-v1', 'Confirmar resultado da reuniao', 'Pede confirmacao humana apos uma reuniao realizada.', 1, 'meeting.status_changed',
   '[{"field":"event.payload.status","operator":"equals","value":"held"}]'::jsonb, 'confirmation.request',
   '{"message":"Reuniao realizada. Confirme o resultado e a proxima acao."}'::jsonb, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  version = excluded.version,
  event_type = excluded.event_type,
  conditions = excluded.conditions,
  action_type = excluded.action_type,
  action_payload = excluded.action_payload,
  updated_at = now();
