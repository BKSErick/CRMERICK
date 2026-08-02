# Mecanismo único: Ficha de Escopo

Decidido em 02/08/2026. É o que separa a oferta de "mais uma landing page" e o
que sustenta cobrar mais.

## O que é

**A Ficha de Escopo é a triagem técnica que acontece antes do contato chegar no
dono.** Antes de falar com você, o cliente informa:

- o serviço que precisa
- o equipamento ou a peça
- a medida e o material
- a urgência
- a foto ou o desenho, anexados

O pedido cai no WhatsApp já preenchido, em vez de virar ida e volta de mensagem
até descobrir o que a pessoa quer.

**Não é o visual da página.** Esse é o ponto inteiro: o visual é commodity, a
triagem não.

## Por que esse mecanismo e não outro

Saiu dos dados, não de brainstorm. É o ângulo que mais funcionou na prospecção
real e resolve a dor concreta do industrial: hora técnica virando atendimento e
cotação lenta. O comprador some enquanto você tenta descobrir a medida.

## Por que "Ficha"

O industrial já usa a palavra todo dia (ficha técnica, ficha de serviço), então
não soa a marketing. Nomeia o **artefato**, a coisa que aparece na tela, e não um
benefício abstrato. Dá pra apontar pra ela. E dá pra pedir: "me manda a ficha".

## Onde entra, e onde NÃO entra

| Momento | Entra? | Por quê |
|---|---|---|
| **Msg 1** (abordagem fria) | **Não** | A msg 1 tem um trabalho só: ele saber quem fala em 3 segundos. Nome próprio sem contexto em DM fria lê como vendedor de curso. Ali fica só a categoria: "faço página de vendas pra indústria". |
| **Msg 2** (depois do "quer ver?") | **Sim, é o lugar** | Ele já disse sim e está prestando atenção. Aqui tem espaço pra explicar. |
| **Follow-up M2** | Sim | Prova + mecanismo dá motivo novo pra responder. "Fiz uma página pra uma empresa do ramo" é o que todo mundo diz. |
| **Objeção de mensalidade** | **Não** | Ver "Preço" abaixo. O mensal atual é hospedagem e troca de texto/foto, então vender "a ficha evoluindo" por R$150 prometeria trabalho que não está no escopo. |
| **Página e proposta** | Sim | É o item que justifica o preço. |

## Onde vive no código

- `MECANISMO` e `mensagemExemplo()` em `src/lib/followup.ts` (msg 2 dinâmica, link
  por segmento)
- `READY_MESSAGES` em `src/app/comando/page.tsx` (versão copiável, com `[EMPRESA]`)
- Follow-up M2 em `followupMessage()`

Link do case por segmento: Metalthec para usinagem e caldeiraria, Jotta para o
resto. **Regra anti-invenção:** o link citado tem que ser o que será realmente
enviado.

## Preço (definido em 02/08/2026)

**R$1.000 pela página + R$150/mês.**

O mensal cobre **hospedagem e troca de texto e foto**. Mudança maior (página
nova, função nova) é combinada e cobrada à parte, sempre antes de executar.

É preço de **entrada**, escolhido de propósito para começar a fechar e subir
depois.

Consequência que a copy precisa respeitar: o mensal **não** pode ser vendido como
"a Ficha de Escopo evoluindo". Isso prometeria trabalho contínuo que não está no
escopo de R$150, e o atrito apareceria na primeira cobrança extra. A mensagem de
objeção descreve o escopo real, palavra por palavra.

⚠️ **Não existe venda de landing page fechada ainda.** O deal de R$3.000 do Jotta
é um CRM em 3 parcelas, produto diferente. Ele estava registrado como R$1.000
(uma parcela) e foi corrigido em 02/08. Ou seja: R$1.000 é hipótese de preço, não
referência validada. A primeira venda é que vira âncora.

Atenção ao **HM Usinagem**, em negotiation com R$600 registrado: 40% abaixo da
tabela. Se fechar nesse valor, é ele que vira a referência real.

## Quando revisar

Depois dos ~400 disparos com a msg 1 nova. A sofisticação de mercado medida hoje
é 2.0 a 2.3, mas com n=11 e um caso contrário dentro dela (LS Usinagens, que
respondeu "já tenho uma empresa que faz todo esse trabalho pra mim", sofisticação
4). Se o volume confirmar sofisticação 3+, o mecanismo precisa subir na conversa,
não descer.

Ver `docs/ANALISE-conversas.md` para a leitura por segmento.