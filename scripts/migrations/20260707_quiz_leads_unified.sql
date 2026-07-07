create table if not exists public.quiz_leads (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  quiz_id text,
  source text default 'quiz',
  name text,
  email text,
  phone text,
  whatsapp text,
  score numeric,
  gargalo text,
  answers jsonb,
  raw_payload jsonb,
  materialized_deal_id bigint references public.deals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quiz_leads_created_at_idx on public.quiz_leads (created_at desc);
create index if not exists quiz_leads_phone_idx on public.quiz_leads (phone) where phone is not null;
create index if not exists quiz_leads_email_idx on public.quiz_leads (email) where email is not null;
create index if not exists quiz_leads_external_id_idx on public.quiz_leads (external_id) where external_id is not null;
create index if not exists quiz_leads_materialized_deal_id_idx on public.quiz_leads (materialized_deal_id) where materialized_deal_id is not null;

alter table public.quiz_leads enable row level security;

drop policy if exists "Allow all" on public.quiz_leads;
drop policy if exists "quiz_leads_anon_insert" on public.quiz_leads;

create policy "quiz_leads_anon_insert"
on public.quiz_leads
for insert
to anon
with check (true);

create or replace function public.set_quiz_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quiz_leads_set_updated_at on public.quiz_leads;
create trigger quiz_leads_set_updated_at
before update on public.quiz_leads
for each row
execute function public.set_quiz_leads_updated_at();

create or replace function public.materialize_quiz_lead_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_deal_id bigint;
  lead_name text;
  score_value numeric;
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
  new.whatsapp := nullif(regexp_replace(coalesce(new.whatsapp, new.phone, ''), '\D', '', 'g'), '');
  new.source := coalesce(nullif(trim(new.source), ''), 'quiz');
  score_value := coalesce(new.score, 0);
  lead_name := coalesce(nullif(trim(new.name), ''), new.email, new.phone, new.external_id, 'Lead do quiz');

  select id into target_deal_id
  from public.deals
  where (new.phone is not null and (phone = new.phone or whatsapp = new.phone))
    or (new.whatsapp is not null and (phone = new.whatsapp or whatsapp = new.whatsapp))
    or (new.email is not null and lower(coalesce(copy_text, '')) like '%' || new.email || '%')
  order by updated_at desc nulls last, id desc
  limit 1;

  if target_deal_id is null then
    insert into public.deals (
      name,
      company,
      segment,
      value,
      prob,
      stage,
      owner,
      tag,
      tag_type,
      ticket_id,
      points,
      progress,
      assignee,
      copy_text,
      phone,
      whatsapp,
      updated_at
    )
    values (
      lead_name,
      lead_name,
      coalesce(nullif(trim(new.gargalo), ''), 'Quiz'),
      0,
      greatest(0, least(100, score_value)),
      'prospect',
      'Erick',
      'Quiz',
      'research',
      'QUIZ-' || coalesce(new.external_id, new.id::text),
      greatest(1, least(10, ceil(score_value / 10.0)::int)),
      greatest(0, least(100, score_value)),
      'Erick',
      concat_ws(E'\n',
        'Lead capturado pelo quiz.',
        case when new.email is not null then 'Email: ' || new.email end,
        case when new.gargalo is not null then 'Gargalo: ' || new.gargalo end,
        'Score: ' || score_value::text
      ),
      new.phone,
      new.whatsapp,
      now()
    )
    returning id into target_deal_id;
  else
    update public.deals
    set
      segment = coalesce(nullif(trim(new.gargalo), ''), segment),
      prob = greatest(coalesce(prob, 0), greatest(0, least(100, score_value))),
      points = greatest(coalesce(points, 1), greatest(1, least(10, ceil(score_value / 10.0)::int))),
      progress = greatest(coalesce(progress, 0), greatest(0, least(100, score_value))),
      tag = coalesce(tag, 'Quiz'),
      tag_type = coalesce(tag_type, 'research'),
      phone = coalesce(phone, new.phone),
      whatsapp = coalesce(whatsapp, new.whatsapp),
      copy_text = concat_ws(E'\n',
        nullif(copy_text, ''),
        'Novo resultado de quiz: score ' || score_value::text || coalesce(' / gargalo ' || nullif(trim(new.gargalo), ''), '')
      ),
      updated_at = now()
    where id = target_deal_id;
  end if;

  new.materialized_deal_id := target_deal_id;
  return new;
end;
$$;

drop trigger if exists quiz_leads_materialize_deal on public.quiz_leads;
create trigger quiz_leads_materialize_deal
before insert on public.quiz_leads
for each row
execute function public.materialize_quiz_lead_deal();
