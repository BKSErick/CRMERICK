-- Rollback de emergencia da Story 046.
-- ATENCAO: remove os metadados e threads de e-mail gravados depois da ativacao.
begin;

drop trigger if exists email_threads_updated_at on public.email_threads;
drop index if exists public.messages_email_thread_occurred_idx;

alter table public.messages
  drop column if exists attachments,
  drop column if exists source_message_id,
  drop column if exists html_content,
  drop column if exists reply_to_email,
  drop column if exists bcc_emails,
  drop column if exists cc_emails,
  drop column if exists recipient_emails,
  drop column if exists from_email,
  drop column if exists subject,
  drop column if exists email_thread_id;

drop table if exists public.email_threads;

commit;
