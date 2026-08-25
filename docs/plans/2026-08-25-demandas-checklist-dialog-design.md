# Design - Checklist limpo e dialogos centralizados em Demandas

## Status

Aprovado pelo Erick em 2026-08-25.

## Problemas observados

- A linha do checklist declara tres colunas, mas renderiza checkbox, texto e tres
  botoes como cinco filhos. O grid cria uma segunda linha implicita e o botao
  `x` ocupa a coluna flexivel inteira.
- O `<dialog>` compartilhado nao define posicionamento explicito na viewport e
  aparece no canto em alguns navegadores.
- Exclusoes de checklist, links e anexos ainda usam `window.confirm`, fora do
  padrao visual e sem controle de layout.

## Solucao aprovada

### Checklist

- Manter uma linha por item: checkbox, titulo editavel e um unico grupo de acoes.
- Agrupar subir, descer e excluir em botoes quadrados compactos com SVG e rotulo
  acessivel.
- Usar lixeira discreta no lugar do `x`; cor de perigo aparece no hover/foco.
- Suavizar e riscar o titulo concluido sem impedir edicao ou reabertura.
- Transformar a porcentagem existente em uma barra de progresso visivel.
- Em telas estreitas, manter checkbox e titulo na primeira linha e levar apenas
  o grupo de acoes para baixo, alinhado a direita.

### Dialogos

- Preservar o `<dialog>` nativo para foco preso, Esc e semantica.
- Centralizar explicitamente com posicao fixa no centro da viewport, largura
  limitada, altura maxima baseada em `100dvh` e rolagem interna.
- Reutilizar `DemandDialog` para confirmar exclusoes de checklist, links e
  anexos, eliminando `window.confirm` da area de Demandas.

## Fora de escopo

- Alterar APIs, banco, ordem, persistencia ou calculo do checklist.
- Redesenhar todo o workspace de Demandas.
- Alterar a arvore, overview ou regras de permissao.
- Commit, push ou deploy.

## Validacao

- Teste de contrato reproduz e protege estrutura, centralizacao e confirmacoes.
- Lint, typecheck, suite completa, build e `git diff --check`.
