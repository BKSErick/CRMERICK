# Design aprovado - Razoes de perda e aprendizado comercial

## Objetivo

Exigir uma razao estruturada antes de efetivar `lost`, preservar todas as
versoes do historico e transformar perdas reais em distribuicoes auditaveis nas
telas existentes.

## Contrato

- Catalogo v1: `no_budget`, `no_priority`, `no_response`,
  `no_decision_maker_access`, `bad_timing`, `competitor`, `bad_offer`, `no_fit`,
  `invalid_channel_data` e `other`.
- `other` exige nota. Os demais motivos aceitam nota opcional.
- Deals legados em `lost` sem registro aparecem como `not_informed`; nenhum
  backfill ou classificacao automatica sera executado.
- O ator e a data sao definidos no servidor/banco, nunca confiados ao cliente.

## Persistencia e atomicidade

- `deal_loss_records` guarda uma linha por versao, agrupada por `episode_id`.
- Corrigir supersede a versao anterior e insere outra; nenhuma evidencia e
  sobrescrita.
- Reabrir marca a ultima versao como superada por reabertura e preserva o
  episodio.
- Funcoes PostgreSQL com acesso apenas pela service role executam mudanca de
  etapa, historico e timeline na mesma transacao.
- O deal mantem um snapshot do ultimo motivo para leitura eficiente; o historico
  e a fonte auditavel.

## Interface e aprendizado

- Drag/drop ou select para `lost` abre a captura antes de qualquer escrita.
- Cancelar fecha a captura e mantem a etapa anterior.
- O overlay mostra o motivo atual, autoria, data e versoes anteriores, permitindo
  correcao auditada.
- Funis e Achados mostram contagens e participacao por motivo, segmento e origem
  no periodo. Abaixo da amostra minima, a taxa e marcada como indicativa.
- O forecast continua excluindo `lost`, mas passa a explicar o motivo registrado
  ou a ausencia dele.
- O CLI e estritamente read-only e lista legados sem motivo e agregados do periodo.

## Superficies

Somente `Pipeline`, `Funis` e `Achados` sao alterados. Nao ha nova aba, rota de
pagina ou navegacao.
