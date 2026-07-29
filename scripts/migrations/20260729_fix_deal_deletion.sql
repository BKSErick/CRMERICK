begin;

-- Preserva o historico, mas deixa de bloquear a exclusao do lead.
alter table public.messages
  drop constraint if exists messages_deal_id_fkey;
alter table public.messages
  add constraint messages_deal_id_fkey
  foreign key (deal_id) references public.deals(id) on delete set null;

alter table public.activities
  drop constraint if exists activities_deal_id_fkey;
alter table public.activities
  add constraint activities_deal_id_fkey
  foreign key (deal_id) references public.deals(id) on delete set null;

commit;
