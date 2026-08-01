-- Cidade e demais campos do Google Maps no CRM.
--
-- Por que: o medidor de conversao (lead-winning-profile) so conseguia agrupar por DDD,
-- e o 31 mistura BH, Vale do Aco e Joao Monlevade num balde so. Decidir onde vender com
-- isso e grosseiro. Com city da para medir cidade a cidade.
--
-- De quebra entram os campos que o scoring (src/lib/leadScoring.js) JA sabe pontuar,
-- rating e reviews_count, mas que o CRM jogava fora na ingestao: o lead entrava, era
-- pontuado uma vez na garimpagem e perdia a nota para sempre. Sem eles nao da para
-- responder "empresa com nota alta responde mais?".
--
-- maps_cid identifica o lugar no Google e serve de chave de deduplicacao entre puxadas
-- (nome e telefone mudam de grafia, o cid nao).

alter table if exists public.contacts
  add column if not exists city          text,
  add column if not exists uf            text,
  add column if not exists address       text,
  add column if not exists rating        numeric,
  add column if not exists reviews_count integer,
  add column if not exists maps_cid      text,
  add column if not exists lat           numeric,
  add column if not exists lng           numeric,
  add column if not exists source        text;

comment on column public.contacts.city is
  'Cidade do lead, vinda da puxada do Maps. Usada para medir conversao por cidade.';
comment on column public.contacts.uf is 'Sigla do estado (MG, SC, SP...).';
comment on column public.contacts.rating is 'Nota no Google Maps na data da coleta.';
comment on column public.contacts.reviews_count is 'Quantidade de avaliacoes no Maps na coleta.';
comment on column public.contacts.maps_cid is
  'Identificador do lugar no Google. Chave estavel de deduplicacao entre puxadas.';
comment on column public.contacts.source is
  'Origem do lead: serper_maps, garimpo, manual, quiz...';

create index if not exists contacts_city_idx on public.contacts (city);
-- Parcial: so as linhas com cid entram no indice, e ele garante que a mesma empresa
-- nao seja inserida duas vezes por puxadas repetidas da mesma cidade.
create unique index if not exists contacts_maps_cid_uidx
  on public.contacts (maps_cid) where maps_cid is not null;