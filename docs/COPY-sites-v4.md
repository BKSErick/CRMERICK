# Copy dos sites, alinhada ao brandbook v4.0

**17/08/2026.** Fonte da verdade: `content/brandbook.json` v4.0.

Este documento é a **especificação de copy** para o dev aplicar. Cada bloco traz o texto
final entre aspas, o arquivo alvo e o motivo. O motivo não vai pro site, ele existe pra
quem revisar entender por que a string é essa e não outra.

## Regras que valem para os dois sites

1. **Sem travessão (—).** Vírgula, ponto ou dois pontos. O código atual usa travessão em
   vários lugares e todos saem nesta passada.
2. **Sem cidade como atributo de marca.** Nada de "Monlevade", "Vale do Aço" ou coordenada
   geográfica em hero, rodapé ou sobre. Atendimento é Brasil inteiro, entrega remota.
   Proximidade continua existindo, mas só na conversa de WhatsApp com lead da região.
3. **Um arquétipo por bloco.** Mago demonstra mecanismo e nunca fala preço. Governante fala
   escopo, fronteira e o que não se entrega, e nunca demonstra ferramenta.
4. **Nada de "sob medida" solto.** Se usar, tem que dizer sob medida pra qual problema.

---

# 1. Mydrion

**Repo:** `d:\001Gravity\aios-core\apps\mydrion-site`
**Arquivo principal:** `src/data/siteContent.ts`
**Atenção:** existe `src/data/siteContent.test.ts` com asserções sobre esse conteúdo. Os
testes precisam ser atualizados junto, não contornados.

**Diagnóstico que motiva a mudança:** a Mydrion hoje se anuncia pela mercadoria ("sistemas,
sites e produtos digitais") e não tem nenhuma fronteira declarada. Empresa sem fronteira
vira tabela comparada. A pessoa (Erick) e o produto (OStrack) já estão posicionados em
indústria; a empresa ficou falando com founder e startup, público que a operação nunca
abordou.

## 1.1 Hero

**Arquivo:** `src/data/siteContent.ts` → `export const hero`

| Campo | Valor final |
|---|---|
| `eyebrow` | `"TECNOLOGIA SOB MEDIDA PARA INDÚSTRIA"` |
| `headline` | `"A GENTE ORGANIZA O COMERCIAL E A OPERAÇÃO DE QUEM FABRICA."` |
| `body` | `"O comprador industrial pesquisa antes de ligar. Do outro lado, o pedido ainda chega vago e a ordem de serviço vive em planilha, WhatsApp e memória da equipe. A Mydrion resolve os dois lados: a triagem na entrada e o controle na operação."` |
| `primaryCta.label` | `"Mapear meu projeto"` (mantém) |
| `secondaryCta.label` | `"Ver projetos reais"` (mantém) |

**Sai:** `"CONSTRUÍMOS O QUE NÃO EXISTE PRONTO."` e o eyebrow
`"SISTEMAS / SITES / PRODUTOS DIGITAIS"`.

**Motivo:** "construímos o que não existe pronto" é a promessa mais genérica possível
vestida de manifesto. Qualquer software house do Brasil assina embaixo sem trocar uma
vírgula. O eyebrow antigo nomeia mercadoria; o novo nomeia território.

## 1.2 Prova (proofPoints)

**Arquivo:** `src/data/siteContent.ts` → `export const proofPoints`

```
"Produto próprio em operação"
"Cases industriais reais"
"Entrega remota, Brasil inteiro"
```

**Motivo:** "Arquitetura + design + desenvolvimento" descreve o processo interno, que não é
prova de nada pro dono de indústria. Trocado por alcance, que responde a objeção real
("vocês são de onde? precisa vir aqui?").

## 1.3 Capacidades viram escada

**Arquivo:** `src/data/siteContent.ts` → `export const capabilities`

Manter os `id` existentes para não quebrar componentes. Mudam `index`, `eyebrow`, `title`,
`body` e `outcome`, e muda a **ordem**: hoje são quatro capacidades soltas, passam a ser
quatro degraus em sequência.

**Degrau 01** (`id: "sites"`)
- `eyebrow`: `"Entrada"`
- `title`: `"Páginas industriais com Ficha de Escopo"`
- `body`: `"O cliente informa serviço, equipamento, medida, material e urgência, e anexa foto ou desenho, antes de falar com você. O pedido cai no WhatsApp já preenchido em vez de virar uma ida e volta até descobrir o que ele quer."`
- `outcome`: `"Menos hora técnica virando atendimento."`

**Degrau 02** (`id: "systems"`)
- `eyebrow`: `"Operação"`
- `title`: `"Sistemas de operação"`
- `body`: `"A ordem de serviço sai da planilha, do WhatsApp e da memória da equipe. Etapa, responsável, tempo parado e próxima ação num lugar só, com rastro de quem fez o quê e quando."`
- `outcome`: `"O prazo para de se perder no intervalo."`

**Degrau 03** (`id: "saas"`)
- `eyebrow`: `"Produto"`
- `title`: `"Produtos SaaS"`
- `body`: `"Quando uma operação que funciona pode virar produto: jornadas, permissões, dados, cobrança e evolução planejados como sistema vivo. É o caminho que a gente percorreu no OStrack."`
- `outcome`: `"Uma operação que vira produto."`

**Degrau 04** (`id: "automation"`)
- `eyebrow`: `"Escala"`
- `title`: `"Automação e IA"`
- `body`: `"O trabalho manual que hoje depende de alguém lembrar de fazer. Automação com regra, contexto e supervisão humana, sem criar uma caixa-preta nova no meio do processo."`
- `outcome`: `"Velocidade sem perder o comando."`

**Motivo:** quatro capacidades paralelas fazem a Mydrion parecer fornecedora de horas. Como
escada, cada degrau justifica o próximo e o cliente entende onde ele está.

## 1.4 Cercadinho (bloco NOVO)

**Arquivo:** `src/data/siteContent.ts` → criar `export const boundaries`
**Componente:** criar `src/sections/Boundaries.tsx`, inserir **logo depois de Capabilities**

Esta é a mudança de maior impacto do site inteiro. Hoje a Mydrion não diz em lugar nenhum
o que ela não faz.

- `title`: `"Onde a gente entra, e onde não entra."`
- `intro`: `"Escopo não é arrogância. Fora do perfil abaixo eu não entrego o resultado que prometo, e prefiro dizer isso antes da proposta."`

`fits` (título: `"A Mydrion entra quando"`):
```
"Você atende pedido técnico variável, onde medida e material mudam o preço."
"O orçamento nasce de uma conversa de WhatsApp até alguém descobrir o que o cliente quer."
"A ordem de serviço é tocada em planilha, e-mail e memória da equipe."
"Você atende cliente grande e precisa provar rastreabilidade, escopo aprovado e qualidade."
```

`doesNotFit` (título: `"A Mydrion não entra quando"`):
```
"Você quer só identidade visual, sem mudar como o pedido chega."
"A comparação é com preço de mercado de site, e não com a hora técnica que se gasta hoje."
"O negócio é comércio, revenda simples ou serviço padronizado, sem pedido técnico."
"O que falta é um ERP fiscal, financeiro ou de estoque."
"É startup ou agência procurando uma software house genérica."
```

**Motivo:** é o parágrafo que já funciona no LinkedIn do Erick ("com quem eu não
trabalho"), transplantado pra empresa. É o que faz o site ser lido como escolha e não como
necessidade.

## 1.5 Projetos

**Arquivo:** `src/data/siteContent.ts` → `export const projects`

Manter os três. Ajustar só o statement do OStrack, que hoje descreve funcionalidade e passa
a nomear o problema:

- OStrack `statement`: `"Gestão de ordem de serviço para recuperadoras e usinagens: etapa, responsável, tempo parado e próxima ação, com escopo aprovado sem vazar preço pro cliente."`

Manter Metalthec e Jotta como estão. **Jotta é manutenção INDUSTRIAL, nunca "predial".**

## 1.6 Processo

**Arquivo:** `src/data/siteContent.ts` → `export const processSteps`

Mantém os cinco passos. Só uma troca:

- `04 Validamos` → `body`: `"Testamos fluxo, conteúdo, responsividade, desempenho e os pontos onde a operação costuma travar."`

## 1.7 Limpezas

- Remover a coordenada geográfica `19°55′S / 43°56′W` e o marcador `M / 01` do Hero.
- Remover todos os travessões (—) das strings de `siteContent.ts`. Hoje há pelo menos um em
  `capabilities.systems.body`.
- Conferir se `contactHref` continua apontando pro WhatsApp certo. O texto pré-preenchido
  ("Conheci a Mydrion e quero mapear um projeto") está bom, mantém.

---

# 2. OStrack

**Repo:** `d:\001Gravity\ostrack-site`
**Arquivos:** `app/page.jsx`, `components/content.js`

**Diagnóstico:** a copy do OStrack está **boa**. "Sua OS não trava na máquina. Trava antes
da aprovação e do databook" nomeia o gargalo invisível e é Governante puro. O "Serve para /
Não é para" já existe e é o cercadinho funcionando. Aqui não tem reescrita, tem ajuste.

## 2.1 Assinatura Mydrion (mudança principal)

Hoje o site do OStrack não diz em lugar nenhum que ele é produto da Mydrion. A cadeia
(marca → produto) não aparece, e isso é justamente a prova mais densa que a Mydrion tem.

**Onde:** `components/Footer.jsx` e, se couber sem poluir, um selo discreto no Header.

- Rodapé: `"OStrack é um produto Mydrion."` com link para o site da Mydrion.

**Motivo:** produto próprio em operação é o que separa a Mydrion de software house. Se o
OStrack não assina Mydrion, a prova fica órfã dos dois lados.

## 2.2 Ajustes finos

- Remover travessões das strings de copy, mesma regra do outro site.
- Não introduzir cidade ou região em nenhum ponto novo.
- Manter "recuperadoras, usinagens e oficinas industriais" como público nomeado. Está certo.

---

# Checklist de aceite

- [ ] Nenhuma ocorrência de travessão (—) nas strings de copy dos dois sites
- [ ] Nenhuma ocorrência de "Monlevade", "Vale do Aço" ou coordenada geográfica
- [ ] Hero da Mydrion sem "construímos o que não existe pronto"
- [ ] Seção de cercadinho no ar no site da Mydrion, depois de Capabilities
- [ ] `siteContent.test.ts` atualizado e passando
- [ ] Build dos dois sites passando
- [ ] Rodapé do OStrack assinando Mydrion
- [ ] "Jotta" descrito como manutenção industrial, nunca predial
