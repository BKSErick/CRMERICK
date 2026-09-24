begin;

alter table public.deals
  drop column if exists icp_classified_at,
  drop column if exists icp_model,
  drop column if exists icp_confidence,
  drop column if exists icp_evidence;

commit;
