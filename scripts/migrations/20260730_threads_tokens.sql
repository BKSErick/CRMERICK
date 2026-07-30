-- Threads (Meta) — guarda o token de usuario do Threads no banco, nao no .env.
-- Motivo: o token do Threads e de USUARIO (nasce de um OAuth no navegador) e expira
-- em 60 dias. Guardando no banco, o callback grava e a rota renova sozinha, sem
-- precisar editar variavel de ambiente na Vercel a cada renovacao.
--
-- Reaproveita integration_settings (ja usada pelo webhook da Uazapi), so somando colunas.

alter table if exists public.integration_settings
  add column if not exists access_token text,
  add column if not exists account_id text,
  add column if not exists username text,
  add column if not exists token_expires_at timestamptz;

comment on column public.integration_settings.access_token is
  'Token de acesso do provider (Threads: long-lived, 60 dias). Somente service_role le.';
comment on column public.integration_settings.token_expires_at is
  'Quando o token expira. A rota renova sozinha quando faltam menos de 7 dias.';

-- RLS segue deny-by-default (nenhuma policy para anon): so o service_role enxerga.
alter table public.integration_settings enable row level security;