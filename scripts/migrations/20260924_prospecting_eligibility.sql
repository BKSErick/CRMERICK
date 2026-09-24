-- Regua comercial auditavel da prospeccao (Story 059).
-- Aditiva e repetivel: nao muda fila, mensagens, estagios nem atividades.

begin;

alter table public.deals
  add column if not exists capacity_tier text
    check (capacity_tier is null or capacity_tier in ('governante', 'estruturado', 'micro', 'incerto')),
  add column if not exists capacity_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(capacity_evidence) = 'array'),
  add column if not exists decision_access text
    check (decision_access is null or decision_access in ('decisor', 'indicado', 'gatekeeper', 'bot', 'incerto')),
  add column if not exists offer_track text
    check (offer_track is null or offer_track in ('projeto', 'entrada', 'nenhuma')),
  add column if not exists eligibility_reason text;

create index if not exists idx_deals_prospecting_eligibility
  on public.deals (is_icp, capacity_tier, offer_track)
  where is_prospect is distinct from false;

comment on column public.deals.capacity_tier is
  'Capacidade comercial: governante, estruturado, micro ou incerto. Score nao altera este gate.';
comment on column public.deals.capacity_evidence is
  'Evidencias deterministicas usadas para classificar capacidade, em JSON array.';
comment on column public.deals.decision_access is
  'Acesso comercial conhecido: decisor, indicado, gatekeeper, bot ou incerto.';
comment on column public.deals.offer_track is
  'Trilha autorizada: projeto, entrada ou nenhuma.';
comment on column public.deals.eligibility_reason is
  'Motivo legivel da ultima avaliacao da regua de prospeccao.';

commit;
