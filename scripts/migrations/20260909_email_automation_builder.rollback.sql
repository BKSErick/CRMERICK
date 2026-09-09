begin;

drop function if exists public.save_email_automation(uuid, integer, text, text, text, jsonb, text);
drop function if exists public.create_email_automation(text, text, jsonb, text);
drop table if exists public.email_automation_test_runs;
drop table if exists public.email_automation_revisions;
drop table if exists public.email_automations;

commit;
