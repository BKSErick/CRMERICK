-- Story 032: copiloto contextual de gestao comercial.
-- Migration aditiva. O copiloto NAO ganha caminho proprio de escrita: quando o operador
-- aprova uma sugestao, ela entra pelo motor seguro da Story 027 como um evento comercial
-- normal, com regra versionada, execution_key idempotente e trilha em
-- commercial_automation_runs. Aqui so ampliamos o vocabulario de eventos e cadastramos
-- as duas regras permitidas (tarefa sugerida e rascunho). Nada de envio, etapa ou preco.

alter table public.commercial_events
  drop constraint if exists commercial_events_event_type_check;
alter table public.commercial_events
  add constraint commercial_events_event_type_check check (event_type in (
    'message.received', 'message.sent', 'deal.stage_changed',
    'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed',
    'deal.qualification_updated', 'copilot.suggestion_accepted'
  ));

alter table public.commercial_automation_rules
  drop constraint if exists commercial_automation_rules_event_type_check;
alter table public.commercial_automation_rules
  add constraint commercial_automation_rules_event_type_check check (event_type in (
    'message.received', 'message.sent', 'deal.stage_changed',
    'deal.score_updated', 'deal.next_action_due', 'meeting.status_changed',
    'deal.qualification_updated', 'copilot.suggestion_accepted'
  ));

-- As duas unicas acoes que uma sugestao do copiloto pode virar. Ambas exigem o gesto
-- explicito do operador para o evento ser emitido; as condicoes garantem que um evento
-- de tarefa nunca dispare a regra de rascunho e vice-versa.
insert into public.commercial_automation_rules
  (id, name, description, version, event_type, conditions, action_type, action_payload, enabled)
values
  ('copilot-task-suggestion-v1', 'Tarefa sugerida pelo copiloto',
   'Agenda a proxima acao que o operador aprovou no copiloto. Nao envia mensagem.', 1,
   'copilot.suggestion_accepted',
   '[{"field":"event.payload.suggestion.kind","operator":"equals","value":"task"},{"field":"event.payload.confirmedBy","operator":"exists"}]'::jsonb,
   'task.upsert',
   '{"nextActionAt":"$event.payload.suggestion.nextActionAt","nextActionType":"$event.payload.suggestion.nextActionType","note":"$event.payload.suggestion.note"}'::jsonb,
   true),
  ('copilot-draft-suggestion-v1', 'Rascunho sugerido pelo copiloto',
   'Guarda o rascunho aprovado como atividade. O envio continua manual.', 1,
   'copilot.suggestion_accepted',
   '[{"field":"event.payload.suggestion.kind","operator":"equals","value":"draft"},{"field":"event.payload.confirmedBy","operator":"exists"}]'::jsonb,
   'draft.create',
   '{"text":"$event.payload.suggestion.text"}'::jsonb,
   true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  version = excluded.version,
  event_type = excluded.event_type,
  conditions = excluded.conditions,
  action_type = excluded.action_type,
  action_payload = excluded.action_payload,
  updated_at = now();
