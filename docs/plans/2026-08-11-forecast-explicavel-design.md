# Design aprovado - Forecast comercial explicavel

## Objetivo

Calcular previsao comercial deterministica a partir dos sinais ja existentes no
CRM, sem substituir a probabilidade manual e sem criar nova rota de pagina,
aba, coluna ou etapa.

## Decisoes

- A engine pura e versionada usa a etapa como probabilidade-base e ajustes
  publicos para saude, qualificacao confirmada, resposta humana, decisor,
  reuniao, proposta, recencia e data esperada de fechamento.
- A probabilidade calculada e a unica fonte dos agregados previstos. A
  probabilidade manual permanece visivel apenas para comparacao.
- Pipeline bruto e ponderado consideram deals ativos com valor valido. Receita
  provavel do periodo exige valor e data de fechamento dentro do periodo.
- Deals ganhos entram somente em realizado; perdidos ficam excluidos. Valores e
  datas ausentes geram avisos e nunca sao inventados.
- MRR e one-off permanecem separados em previsto e realizado.
- A API existente `/api/funnel` serve o resumo e a explicacao individual. A
  Sala de Comando reutiliza a mesma engine na rota existente `/api/comando`.
- O CLI e somente leitura e aceita periodo, deal e etapa como filtros.

## Formula v1

- Base por etapa: prospect 5%, abordado 10%, follow-up 18%, qualificado 35%,
  proposta 55% e negociacao 72%.
- Saude: +8 para 80+, +5 para 65-79, -12 para 25-44 e -18 abaixo de 25.
- Qualificacao confirmada: +8 completa, +4 com 57% ou mais e +2 quando iniciada.
- Evidencias: resposta humana +6, decisor +6, proposta +4, reuniao realizada
  +10, confirmada +6, agendada +3 e no-show -10.
- Recencia: atividade em ate 3 dias +5, ate 7 dias +2 e 14 dias ou mais -8.
- Fechamento: dentro do periodo +4 e data vencida -10.
- Deals ativos sao limitados entre 1% e 95%. Ganhos usam 100% somente para
  realizado; perdidos usam 0% e ficam excluidos.
- Confianca soma 100 pontos de completude: etapa 10, valor 15, fechamento 15,
  saude 10, qualificacao 10, resposta 10, atividade 10, reuniao 10 e proxima
  acao 10.

## Superficies

- `Funis`: cards de previsto versus realizado e taxas do forecast.
- `Sala de Comando`: receita em risco, sem proxima acao e deals relevantes.
- Overlay do `Pipeline`: probabilidade calculada/manual, confianca e evidencias.

## Qualidade

Testes unitarios validam valores exatos, arredondamento, invariantes e filtros.
Lint, typecheck, suite completa e build fecham a story.
