-- Excecao manual da regua de prospeccao (Story 064, P0 do checklist de 24/09/2026).
-- Aditiva e repetivel. Nao libera, move nem altera nenhum deal: a coluna nasce vazia.
--
-- Sem begin/commit proprios de proposito: scripts/apply-migration.mjs embrulha o arquivo em
-- begin/commit (ou begin/rollback com --dry-run). Um commit dentro do arquivo transformaria o
-- dry-run em gravacao real.
--
-- A excecao so vale com evidencia industrial escrita, tier de oferta principal, aprovador e
-- data (src/lib/prospectingEligibility.mjs, excecaoValida). O unico caminho de escrita e
-- scripts/approve-eligibility-exception.mjs.

alter table public.deals
  add column if not exists eligibility_exception jsonb
    check (
      eligibility_exception is null
      or (
        jsonb_typeof(eligibility_exception) = 'object'
        and coalesce(btrim(eligibility_exception->>'evidence'), '') <> ''
        and coalesce(btrim(eligibility_exception->>'approved_by'), '') <> ''
        and coalesce(btrim(eligibility_exception->>'approved_at'), '') <> ''
        and eligibility_exception->>'tier' in ('governante', 'estruturado')
      )
    );

comment on column public.deals.eligibility_exception is
  'Excecao manual da regua de prospeccao: {evidence, tier, approved_by, approved_at}. So o CLI approve-eligibility-exception grava.';
