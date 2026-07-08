-- Story 014: campos aditivos no deals para o painel North Star.
-- ADITIVO apenas (IF NOT EXISTS): nao altera nem remove dados existentes.
-- `value` (numeric) ja existe no schema; aqui adicionamos:
--   recurring  = deal e receita recorrente (MRR) quando ganho
--   closed_at  = timestamp de fechamento (setado server-side ao mover para "won")

alter table public.deals add column if not exists recurring boolean not null default false;
alter table public.deals add column if not exists closed_at timestamptz;
