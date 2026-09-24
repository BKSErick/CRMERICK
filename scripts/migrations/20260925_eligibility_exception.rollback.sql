-- Rollback de 20260925_eligibility_exception.sql (Story 064).
-- Remove a coluna; as excecoes aprovadas somem junto. Rodar pelo apply-migration.mjs.

alter table public.deals
  drop column if exists eligibility_exception;
