# Design - Inteligencia Operacional de Follow-up

## Problema

O pipeline informa o estado comercial, mas a operacao diaria ainda depende do ultimo
`whatsapp_sent`. Isso mistura silencio, resposta automatica e resposta humana, omite
envios sincronizados pela Uazapi e nao registra a proxima acao como dado do card.

## Decisao aprovada

Manter as etapas atuais do pipeline e adicionar uma camada operacional ortogonal:

- classificacao da resposta;
- ultima entrada e ultima saida;
- tempo de resposta;
- proxima acao, data e motivo;
- fila organizada pelo trabalho que precisa ser feito agora.

`bot` e um tipo de resposta, nunca uma etapa do pipeline. Nenhuma mensagem sera
enviada automaticamente.

## Regras comerciais

- Sem resposta: D+2, D+5 e D+10.
- Bot: D+7, D+14 e D+21.
- Humana: responder agora.
- Encaminhamento: contatar o responsavel agora.
- Objecao: resposta contextual, sem catalogo de servicos.
- Perdido: sem proxima acao automatica.

## Modelo

Campos aditivos em `deals`:

- `response_type`
- `next_action_at`
- `next_action_type`
- `next_action_note`
- `last_inbound_at`
- `last_outbound_at`
- `response_time_minutes`

A migracao e retrocompativel. Classificacoes automaticas usam somente regras
deterministicas e podem ser corrigidas manualmente.

## Operacao CLI

A mesma engine deve funcionar antes da UI por `npm run followup:ops -- list`,
`classify` e `schedule`. Os comandos apenas leem ou persistem estado operacional;
nunca enviam WhatsApp nem alteram a etapa comercial.

## Interface

A fila de follow-up tera seis secoes: Responder agora, Encaminhamentos, Bots D+7,
Follow-ups vencidos, Aguardando cadencia e Dados inconsistentes. Cada linha mostra
o contexto minimo para decidir e oferece abrir WhatsApp, copiar, classificar e
agendar. O pipeline recebe badges compactos, sem novas colunas. Antes de abrir o
WhatsApp, uma mensagem que mencione outra empresa conhecida exige correcao.

## Integridade

O resumo considera `whatsapp_sent` e `whatsapp_sent_sync`. Telefones brasileiros
sao normalizados e comparados com a variante segura do nono digito somente para
numeros moveis. Correspondencias ausentes continuam visiveis como inconsistencia.

## Validacao

TDD para dominio e telefone, teste de webhook, lint, typecheck, suite completa e
build. A migracao deve ser aplicada antes do deploy que passa a ler os novos campos.
