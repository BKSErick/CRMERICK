-- Recuperacao de telefone: 528 dos 727 prospects estao com numero fixo e 79 sem
-- telefone nenhum. Duas fontes recuperam boa parte disso:
--   1) Uazapi confirma se o numero (fixo inclusive) existe no WhatsApp
--   2) o proprio site do lead costuma ter botao de WhatsApp que o scraper nao pegou
-- Nada e sobrescrito: as descobertas entram em colunas novas e o phone original fica.

alter table if exists public.contacts
  add column if not exists whatsapp_jid text,
  add column if not exists whatsapp_check timestamptz,
  add column if not exists whatsapp_site text,
  add column if not exists site_url text;

comment on column public.contacts.whatsapp_jid is
  'JID confirmado pela Uazapi (ex: 553133334444@s.whatsapp.net). Nulo = verificado e nao tem WhatsApp.';
comment on column public.contacts.whatsapp_check is
  'Quando o numero foi verificado na Uazapi. Nulo = nunca verificado.';
comment on column public.contacts.whatsapp_site is
  'Numero de WhatsApp encontrado no site do proprio lead (wa.me / api.whatsapp).';
comment on column public.contacts.site_url is
  'Site do lead, usado para raspar contato e para a auditoria.';

create index if not exists contacts_whatsapp_jid_idx on public.contacts (whatsapp_jid);