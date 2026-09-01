-- Story 044: mutacao de demanda vira transacao unica.
-- Aditiva e repetivel (so cria funcoes, nao toca em dado nem em coluna).
--
-- O problema: a rota /api/demands fazia cada operacao de negocio em varios comandos
-- soltos contra o PostgREST. Se o comando do meio falhava, o banco ficava num estado
-- que a aplicacao considera impossivel:
--   1. sair do parcelado apagava as cobrancas ANTES do update; update falhando deixava
--      a demanda 'installment' sem nenhuma cobranca;
--   2. o evento de auditoria entrava DEPOIS do update; falha so na auditoria devolvia
--      erro HTTP com a alteracao ja gravada, convidando o operador a repetir.
--
-- Mesmo padrao ja usado em transition_deal_stage_atomic (20260811_deal_loss_reasons):
-- security definer, select ... for update, tudo numa transacao, sem acesso para
-- anon/authenticated.

create or replace function public.apply_demand_update_atomic(
  p_demand_id bigint,
  p_updates jsonb,
  p_actor text,
  p_event_type text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.client_demands
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Whitelist: a rota so alcanca o que o operador edita. id, created_at e updated_at
  -- ficam fora de proposito.
  v_allowed constant text[] := array[
    'title', 'description', 'copy_text', 'assignee', 'destination_label', 'priority',
    'destination_type', 'starts_at', 'due_at', 'value', 'billing_type', 'billing_month',
    'billing_until', 'client_id', 'deal_id', 'folder_id', 'status', 'completed_at'
  ];
  v_row public.client_demands%rowtype;
  v_new public.client_demands%rowtype;
  v_key text;
begin
  if p_demand_id is null or p_demand_id <= 0 then
    raise exception 'Demanda invalida.';
  end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' or p_updates = '{}'::jsonb then
    raise exception 'Nenhuma alteracao valida informada.';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'Autoria da alteracao e obrigatoria.';
  end if;
  if nullif(trim(p_event_type), '') is null then
    raise exception 'Tipo do evento e obrigatorio.';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Metadata do evento deve ser um objeto.';
  end if;

  for v_key in select jsonb_object_keys(p_updates) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Coluna % nao pode ser alterada por esta rota.', v_key;
    end if;
  end loop;

  -- O lock fecha a janela entre a leitura que a rota faz para validar e a escrita.
  select * into v_row from public.client_demands where id = p_demand_id for update;
  if not found then
    raise exception 'Demanda nao encontrada.';
  end if;

  -- Orfa e a demanda que perdeu cliente E deal: so volta a aceitar escrita quando o
  -- proprio update traz um dono.
  if v_row.client_id is null and v_row.deal_id is null
     and not (p_updates ? 'client_id') and not (p_updates ? 'deal_id') then
    raise exception 'A demanda perdeu o cliente e e somente leitura. Vincule um cliente para editar.';
  end if;

  v_new := jsonb_populate_record(v_row, p_updates);

  -- Sair do parcelado apaga as cobrancas: mantidas, elas continuariam aparecendo na
  -- conta do mes de uma demanda que agora e pontual ou mensal. Vai junto do update na
  -- mesma transacao, e a decisao e tomada sob o lock, sobre o billing_type real.
  if (p_updates ? 'billing_type')
     and v_row.billing_type = 'installment'
     and v_new.billing_type is distinct from 'installment' then
    delete from public.client_demand_charges where demand_id = p_demand_id;
  end if;

  update public.client_demands set
    title = v_new.title,
    description = v_new.description,
    copy_text = v_new.copy_text,
    assignee = v_new.assignee,
    destination_label = v_new.destination_label,
    priority = v_new.priority,
    destination_type = v_new.destination_type,
    starts_at = v_new.starts_at,
    due_at = v_new.due_at,
    value = v_new.value,
    billing_type = v_new.billing_type,
    billing_month = v_new.billing_month,
    billing_until = v_new.billing_until,
    client_id = v_new.client_id,
    deal_id = v_new.deal_id,
    folder_id = v_new.folder_id,
    status = v_new.status,
    completed_at = v_new.completed_at
  where id = p_demand_id
  returning * into v_row;

  insert into public.client_demand_events (demand_id, actor, event_type, description, metadata)
  values (p_demand_id, trim(p_actor), trim(p_event_type), coalesce(p_description, ''), p_metadata);

  return v_row;
end;
$$;

-- Exclusao definitiva: o banco resolve tudo o que sabe desfazer e devolve os caminhos
-- do Storage para o chamador limpar DEPOIS do commit. O inverso (apagar arquivo antes)
-- perdia o arquivo de vez quando o delete falhava.
create or replace function public.purge_demands_atomic(p_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_deleted bigint[];
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Informe ao menos um demandId valido.';
  end if;

  select coalesce(array_agg(a.storage_path), array[]::text[])
    into v_paths
  from public.client_demand_attachments a
  where a.demand_id = any(p_ids);

  -- Linhas filhas (anexos, cobrancas, checklist, links, eventos) caem por cascade.
  with removidas as (
    delete from public.client_demands where id = any(p_ids) returning id
  )
  select coalesce(array_agg(id), array[]::bigint[]) into v_deleted from removidas;

  if array_length(v_deleted, 1) is null then
    return jsonb_build_object('deleted', array[]::bigint[], 'paths', array[]::text[]);
  end if;

  return jsonb_build_object('deleted', v_deleted, 'paths', v_paths);
end;
$$;

revoke all on function public.apply_demand_update_atomic(bigint, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.purge_demands_atomic(bigint[])
  from public, anon, authenticated;
grant execute on function public.apply_demand_update_atomic(bigint, jsonb, text, text, text, jsonb)
  to service_role;
grant execute on function public.purge_demands_atomic(bigint[])
  to service_role;
