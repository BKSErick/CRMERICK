# Design - Kanban operacional de prospeccao Instagram

## Problema

A grade atual renderiza dezenas de cards completos. Ao abrir um perfil, a acao muda o
status, atualiza a fila e reposiciona o card, fazendo o operador perder o contexto.
Copy, historico e controles ocupam espaco mesmo quando o lead nao esta em foco.

## Decisao aprovada

Usar um kanban compacto com painel lateral persistente. O board oferece visao geral;
o painel concentra a operacao de um unico lead.

## Estrutura

- **Para abordar:** status `review` e `ready`.
- **Perfil aberto:** status `opened`.
- **Em follow-up:** status `contacted`.
- **Respondeu:** status `replied`.
- **Arquivados:** status `paused` e `opted_out`, exibidos sob demanda.

Cada coluna mostra contador e cards compactos com @, nome, segmento e proxima acao.
Nao ha drag-and-drop: a mudanca de coluna continua vinculada a uma acao auditavel.

## Painel do lead

- Abre ao selecionar um card e permanece selecionado apos qualquer refresh.
- Exibe copy editavel, abrir perfil, copiar, confirmar envio, registrar resposta,
  classificar, agendar, pausar, opt-out e historico.
- Ao usar `Abrir perfil`, o Instagram abre em nova aba, o card migra para
  `Perfil aberto`, o board rola horizontalmente ate ele e aplica destaque visual.

## Busca e estados

- Busca local por nome da empresa ou @username.
- Filtro separado para arquivados.
- Estado vazio por coluna, sem esconder as demais etapas.
- Desktop: board horizontal e painel lateral sticky.
- Mobile: board horizontal e painel abaixo do board.

## Direcao visual

Modern Corporate alinhado ao CRM: fundo claro, colunas em papel suave, violeta como
acento, bordas discretas, cards de alta densidade e microinteracao curta no lead
selecionado. A hierarquia privilegia a proxima acao e reduz o ruido visual.

## Fora de escopo

- Envio automatico de mensagens.
- Drag-and-drop que altere status sem acao auditavel.
- Automacao de navegador do Instagram.
- Mudanca da cadencia ou do modelo de dados.
