# Diagnóstico de fundo de funil — 02/09/2026

> Leitura de 100% das conversas do CRM (clone Alex Hormozi). Derivado de `activities` +
> `messages` direto do Supabase de produção. `last_inbound_at`/`last_outbound_at` ignorados
> de propósito (mentem — ver memória `project-crm-erick-funil-medido`).
> Scripts da apuração: scratchpad da sessão (`funil-audit.mjs`, `gargalo.mjs`, `cadencia2.mjs`).

## 1. Funil real (base fria, exclui Jotta/Metalthec/Erick/órfãos)

| Passagem | Nº | % do anterior | % da base abordada |
|---|---:|---:|---:|
| Base fria no CRM | 1.372 | — | — |
| Abordados (≥1 mensagem) | 393 | 29% | 100% |
| Responderam alguma coisa | 150 | 38% | 38% |
| Resposta com humano de verdade | 82 | 55% | 21% |
| Receberam o exemplo (link do case) | 54 | 66% | 14% |
| Conversa chegou a preço | 11 | **20%** | 2,8% |
| Won | 1 | 9% | 0,25% |

Comparação com a medição de 18/08: abordados 351 → 393, preço 12 → 11, won 1 → 1
(a venda mudou de dono: **GM Solução #1020, R$997, `won`** — primeira venda que veio
de prospecção fria de verdade; o Jotta era CRM, produto diferente).

**A queda de 80% entre "recebeu o exemplo" e "falou preço" é a restrição do sistema.**
Não é resposta (38% em frio é bom), não é volume de lead (927 nunca abordados na base).

## 2. Onde as 142 conversas morrem

| Categoria | Nº | O que é |
|---|---:|---|
| Só autoresponder | 60 | Bot respondeu, nunca chegou num humano |
| Disse sim e sumiu | 32 | Recebeu o exemplo, nunca mais falou |
| Bola com o Erick | 31 | Lead falou por último e não foi respondido |
| Recusa explícita | 14 | "Já tenho", "não temos interesse" |
| Chegou a preço | 11 | Ver §4 |

### 2.1 Os 60 bots nunca foram trabalhados
Existe template pronto para isso (`followups.bot` em `content/sales-playbook.json`:
"Imagino que minha mensagem tenha caído no atendimento automático. Quem cuida do site
da X aí?"). **Disparos desse template até hoje: 0.** São 60 empresas que atenderam o
telefone e ninguém pediu para falar com gente.

### 2.2 Bola com o Erick — casos vivos parados
`#963 Manuttech` pediu literalmente "Você poderia me mostrar os outros ajustes que
identificou?" — **34 dias sem resposta**. Outros: `#1203 TOHRU` ("sou eu mesmo que
olho", 6d), `#307 GMS` ("Ok", 23d), `#1069 TGM` ("vou olhar, te retorno", 27d),
`#1165 Retífica Juliano` (8d), `#312 Grupo Elétrica` (mandou e-mail do decisor, 23d).

### 2.3 Decisor indicado: 11 vCards capturados, 10 nunca contatados
`referred_contacted_at` preenchido em 1 de 11. PRESSMIX (diretora, 34d), Salatini
(Rafael, 2d), Valvugás (Wesley, 19d), Helmo (Geiziane), Provith (André).
É o vazamento mais barato de tapar: o gatekeeper já deu a permissão.

## 3. A cadência existe no código e não roda

| Toques por deal abordado | Deals |
|---|---:|
| 1 toque | **196 (51%)** |
| 2 toques | 158 |
| 3 toques | 25 |
| 4+ | 2 |

Disparos por tier: **M1 = 0**, M2 = 104, M3 = 83.
Mediana do intervalo entre 1º e 2º toque: **9 dias** (a janela do M1 é D+2 a D+4).

Ou seja: metade da base abordada recebeu uma mensagem e nunca mais nada, e o toque
mais barato da sequência (M1, retomada leve) nunca aconteceu — quando a máquina roda,
o lead já está em D+9 e ela classifica direto como M2.

## 4. As 11 conversas que chegaram a preço

| Deal | Valor | Desfecho |
|---|---|---|
| #1020 GM Solução | R$997 | **won** — visita presencial marcada no mesmo dia |
| #380 Instrumentech | R$997 | página entregue, lead sumiu, `lost` |
| #980 ILB Soldas | R$997→**R$697** | `negotiation`, desconto de 30% dado sem contrapartida |
| #976 JOHN Refrigeração | R$557→2x278 | `proposal`, parado 9d |
| #338 HM Usinagem | R$600→3x200 | `lost` ("ainda não vai ser dessa forma") |
| #903 Usiville | — | `proposal`, 34d parado |
| +5 | — | pessoais/indicação |

Padrão: **preço cai antes de o valor subir.** R$997 → R$697 → R$600 → R$557 →
parcelado em 2x e 3x. Em 4 dos 5 casos o desconto foi oferecido pelo Erick, sem o
lead pedir contrapartida nenhuma.

## 5. Auditoria das mensagens

### Msg 1 (`gerarCopy` v3, 31/08) — está certa, não mexer
Declaração de papel + sinal positivo + fricção como hipótese + pergunta de
reconhecimento. Não aponta defeito no site do lead, não pede call, não põe link.
38% de resposta sustenta. **Ressalva de medição:** a v3 tem 420 copies gravadas no
banco mas **0 disparos** ainda — todas as 108 primeiras mensagens medidas são de
versões anteriores. A taxa de resposta da v3 ainda não existe.

### Msg 2 (`mensagemExemplo`) — é aqui que o funil quebra
Duas versões circulando e as duas terminam sem próximo passo:
- Versão no código: "Te mostro em 15 min como ficaria (...) amanhã de manhã ou à tarde?"
  — **reprovada pelo Erick em 12/08** e ainda não reescrita.
- Versão realmente enviada nas conversas: "Pra X seria a mesma ideia. Faz sentido pra vocês?"

A segunda é a que gerou os 32 sumiços. "Faz sentido pra vocês?" devolve a decisão
para o lead sem data, sem entregável e sem custo de dizer não.

**Contraprova dentro da própria base:** as conversas que avançaram não terminaram em
pergunta, terminaram em **data ou entregável**.
- GM Solução (won): "Você tá por Monlevade essa semana? (...) segunda 9h30, o que acha?"
- Instrumentech: escopo + prazo + valor no mesmo bloco, página montada antes de cobrar.
- JD Aço Forte: "posso te chamar na quinta-feira?" → "dia 17/09" agendado.
- JV Caldeiraria, Túlio, USIPOOL: todas com data marcada.

### M1/M2/M3 (`sales-playbook.json`) — texto bom, disparo inexistente
M1 e M2 avançam um degrau de consciência por mensagem e terminam em pergunta, coerente
com a doutrina. M3 (breakup) está correto. O problema não é redação: é que M1 nunca sai
e 51% da base só levou um toque.

## 6. Plano dos próximos 7 dias

Ordem de retorno sobre esforço, do maior para o menor. Nada aqui depende de lead novo.

1. **Responder os 12 leads vivos parados** (§2.2) e disparar os 10 decisores indicados
   (§2.3) com `mensagemDecisorIndicado()`. Custo: uma tarde. É a única etapa do funil
   com lead que já disse sim.
2. **Reescrever a msg 2**: cortar "Faz sentido pra vocês?" e fechar com escolha dupla
   de data ou com entregável ("monto a primeira versão da sua e te mando quinta").
   O CTA de call continua proibido na msg 1 — a mudança é só depois do "sim".
3. **Ligar o follow-up de bot** para as 60 empresas com autoresponder (template já pronto).
4. **Fazer o M1 existir**: rodar a fila em D+2/D+3 em vez de deixar cair em D+9.
5. **Congelar desconto**: R$997 é o preço. Quem pedir abatimento troca por algo
   (depoimento em vídeo, indicação de 2 empresas, pagamento à vista). Nunca corte sozinho.

## 7. Métrica que decide o próximo ciclo

Uma só: **`exemplo enviado → preço falado`, hoje 20% (11/54).**
Se a msg 2 nova levar isso a 40% com o mesmo volume, dobra a venda sem lead novo,
sem copy nova de topo e sem gastar teto do número.
