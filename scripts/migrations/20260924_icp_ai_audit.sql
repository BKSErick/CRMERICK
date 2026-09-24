-- Auditoria da classificacao ICP por IA (Story 062).
-- Aditiva e repetivel. Nao classifica, desbloqueia ou move nenhum deal.

begin;

alter table public.deals
  add column if not exists icp_evidence text,
  add column if not exists icp_confidence smallint
    check (icp_confidence is null or icp_confidence between 0 and 2),
  add column if not exists icp_model text,
  add column if not exists icp_classified_at timestamptz;

comment on column public.deals.icp_evidence is
  'Trecho literal de segmento, CNAE ou porte usado na ultima decisao ICP por IA.';
comment on column public.deals.icp_confidence is
  'Confianca tipada da IA: 0 sem evidencia, 1 inferencia, 2 evidencia explicita.';
comment on column public.deals.icp_model is
  'Provedor/modelo gratuito que respondeu a ultima decisao ICP.';
comment on column public.deals.icp_classified_at is
  'Horario da ultima classificacao ICP persistida pela IA.';

commit;
