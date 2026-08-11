# Design aprovado - Qualificacao consultiva estruturada

## Decisao

A qualificacao vive no proprio deal como um documento JSON versionado. Cada um
dos sete campos possui valor, estado, autoria, evidencia e data. A ausencia do
documento representa um deal legado nao qualificado, sem backfill inventado.

## Contrato

- Campos: problema, impacto, decisores, urgencia, capacidade de investimento,
  solucao desejada e oferta recomendada.
- Estados: `not_informed`, `suggested` e `confirmed`.
- Sugestoes de IA nunca sobrescrevem valores confirmados e nao contam como
  confirmacao do operador.
- Confirmacao, correcao e limpeza sao mutacoes server-side auditadas.
- Completude considera apenas campos confirmados e exibe pendencias, sem gate de
  etapa ou BANT rigido.

## Superficies

- CLI consulta um deal ou lista oportunidades com pendencias.
- `/api/deals` recebe mutacoes manuais de qualificacao.
- `/api/ai` reutiliza os provedores atuais para sugerir JSON estruturado a partir
  de deal, mensagens e atividades reais.
- O overlay atual do Pipeline revisa evidencias, confirma, corrige e limpa.
- A fila atual da Sala de Comando incorpora lacunas somente de `qualified`,
  `proposal` e `negotiation`, sem nova fila ou aba.

## Seguranca e compatibilidade

- O mapeamento generico do deal nao persiste qualificacao bruta enviada pelo
  cliente; somente o servico validado pode alterar o documento.
- Alteracoes geram atividade e o evento `deal.qualification_updated`, processado
  apenas pelas acoes seguras ja permitidas no motor comercial.
- Migration aditiva adiciona somente `qualification` e amplia os checks do motor.
