-- Variante de copy da vertente de casas de evento (25/09/2026).
-- Aditiva e repetivel. Sem begin/commit proprios: scripts/apply-migration.mjs embrulha o
-- arquivo (ver 20260925_eligibility_exception.sql).
--
-- Por que: o uazapi-send-batch grava deals.copy_variant = 'eventos' no primeiro contato de
-- casa de evento (experimento eventos-corporativo-sp-2026-09, Story 24/09). A constraint de
-- 10/08 so aceitava 'A' e 'B', o PATCH de rastreio voltava 400 (23514) e o script parava o
-- lote por "atividade NAO registrada" depois da primeira mensagem. Manha de 25/09: 1 de 3.

alter table public.deals drop constraint if exists deals_copy_variant_check;

alter table public.deals
  add constraint deals_copy_variant_check
    check (copy_variant is null or copy_variant in ('A', 'B', 'eventos'));
