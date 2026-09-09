# Story 050 - Atribuicao GA4 da Mydrion

## Status

In Progress

## Story

Como operador do CRM, quero que a aba Google conte somente visitas e CTAs da
Mydrion, para nao misturar o site institucional com OStrack, diagnosticos ou
cliques internos.

## Acceptance Criteria

1. Consultas GA4 usam apenas `www.mydrion.com.br` e `mydrion.com.br` por padrao.
2. A configuracao aceita sobrescrever a lista por ambiente.
3. CTA Mydrion aceita apenas `mydrion_cta_click`, `organic_cta_click` e `blog_cta_click`.
4. `click`, `blog_internal_link_click`, `ostrack_*` e `diagnostico_*` nao entram no indicador.
5. Leads usam `generate_lead` e vendas usam `purchase`.
6. Testes, lint, typecheck e build sao executados.
7. Nenhum commit, push ou deploy ocorre sem autorizacao.

## Tasks

- [ ] Criar testes RED de taxonomia e filtro de hostname.
- [ ] Aplicar filtro central nas consultas do GA4.
- [ ] Trocar classificacao ampla por nomes explicitos.
- [ ] Atualizar contrato da rota resumida.
- [ ] Executar gates e leitura local do painel.

## Dependencia

- `D:/001Gravity/aios-core/apps/mydrion-site/docs/stories/STORY-MYDRION-TRACKING-014.md`

## File List

- `docs/stories/story-050-mydrion-ga4-attribution.md`

## Change Log

- 2026-09-09: Story criada para separar atribuicao Mydrion das demais origens.

