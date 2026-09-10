begin;

drop function if exists public.complete_email_automation_dispatch(bigint, text, integer, timestamptz, boolean);
drop function if exists public.claim_email_automation_dispatch(uuid, integer, bigint, text, integer, text, text, text, text, text, integer);
drop table if exists public.email_automation_dispatches;
drop table if exists public.email_automation_enrollments;

commit;
