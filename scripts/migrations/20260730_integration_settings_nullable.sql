-- integration_settings nasceu so para o webhook da Uazapi, entao webhook_secret_hash
-- ficou NOT NULL. Ao reusar a tabela para o Threads (que nao tem webhook), o insert
-- do token quebrava: "null value in column webhook_secret_hash violates not-null".
-- A coluna passa a ser opcional: cada provider preenche so o que faz sentido pra ele.

alter table public.integration_settings
  alter column webhook_secret_hash drop not null;

comment on column public.integration_settings.webhook_secret_hash is
  'Hash do segredo do webhook. Só se aplica a providers com webhook (uazapi); nulo no Threads.';