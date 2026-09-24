begin;

drop index if exists public.idx_deals_prospecting_eligibility;

alter table public.deals
  drop column if exists eligibility_reason,
  drop column if exists offer_track,
  drop column if exists decision_access,
  drop column if exists capacity_evidence,
  drop column if exists capacity_tier;

commit;
