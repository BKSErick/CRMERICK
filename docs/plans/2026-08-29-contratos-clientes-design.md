# Design - Contratos dentro de Clientes

## Objetivo

Permitir que o operador abra um cliente, escolha um dos quatro tipos de servico,
preencha as condicoes comerciais, revise o texto e gere um PDF identificado com a
marca Mydrion, sem redigitar os dados fiscais ja existentes no CRM.

## Decisoes aprovadas

- Contratos fica dentro do painel de cada cliente, nao como nova entrada principal.
- O catalogo inicial tem quatro modelos: prestacao de servicos geral, identidade
  visual, gestao de redes sociais e site/sistema/automacao Mydrion.
- O fluxo e `Rascunho -> Previa editavel -> PDF gerado`; depois o operador pode
  marcar o registro como enviado, assinado ou cancelado.
- A marca exibida e Mydrion. A parte contratada usa a razao social, CNPJ e endereco
  confirmados nos comprovantes cadastrais fornecidos pelo Erick.
- Os DOCX de 2023 sao referencia de escopo, nao fonte pronta para publicacao. O
  catalogo novo corrige placeholders e inconsistencias e deve receber revisao
  juridica antes do primeiro uso externo.
- O PDF congela snapshots do cliente, da contratada, do texto e das condicoes no
  momento da geracao. Alterar o cadastro depois nao reescreve contrato emitido.
- Um contrato gerado nao e editado silenciosamente. Para corrigir, volta-se a
  rascunho, invalida-se o artefato anterior e gera-se uma nova versao auditavel.
- Nao ha envio nem assinatura eletronica nesta story. Download e mudanca manual de
  status sao suficientes para a primeira versao.

## Experiencia

O painel do cliente ganha uma secao `Contratos`, com historico e o botao `Novo
contrato`. O formulario abre em dialogo e possui:

1. modelo do servico;
2. titulo e descricao do objeto;
3. escopo/entregaveis editaveis;
4. valor, forma e condicoes de pagamento;
5. inicio, termino ou duracao;
6. cidade/data e dados do representante do cliente;
7. observacoes especificas do modelo.

Antes de salvar, a tela aponta dados obrigatorios ausentes no cadastro. Depois de
salvar o rascunho, a previa apresenta o documento completo em formato de pagina. O
botao `Gerar PDF` cria a versao final e libera o download.

## Dados e auditoria

- `clients` recebe nome e documento do representante para reaproveitamento futuro.
- `client_contracts` guarda numero, cliente, modelo, status, versao do modelo,
  campos editaveis, snapshots, data de geracao e timestamps.
- Numero no formato `CTR-AAAA-NNNN`, alocado no banco sem colisao.
- Status validos: `draft`, `generated`, `sent`, `signed`, `cancelled`.
- RLS permanece sem policy publica; leitura e escrita passam por rota administrativa
  server-side, seguindo Clientes e Demandas.
- O PDF e regeneravel a partir do snapshot da versao emitida e nao depende dos DOCX
  fora do repositorio.

## Templates

- `general_services`: objeto e escopo livres, para prestacao geral.
- `visual_identity`: identidade, aplicacoes, entregaveis, revisoes e arquivos finais.
- `social_media`: canais, volume de conteudo, aprovacao, verba de midia e vigencia.
- `mydrion_technology`: site, sistema ou automacao, com escopo, aceite, acessos,
  propriedade intelectual, suporte e itens fora de escopo.

Cada template e versionado em codigo. Campos comerciais sao editaveis; clausulas-base
sao revisadas como conjunto para evitar que contratos do mesmo tipo divirjam sem
rastro.

## PDF e identidade

- Documento A4 com cabecalho Mydrion, numero/versao, tipografia legivel, rodape e
  areas de assinatura.
- Usar o logo oficial existente no site institucional; criar variante propria para
  fundo claro sem inventar simbolo ou tipografia.
- O endpoint de PDF roda apenas no servidor e devolve `application/pdf` com nome de
  arquivo sanitizado.
- Nenhum dado bancario antigo dos modelos e copiado automaticamente.

## Fora do escopo

- Assinatura eletronica, envio por e-mail/WhatsApp, cobranca automatica e integracao
  com Clicksign/DocuSign.
- Editor juridico livre de clausulas e criacao de templates pelo usuario.
- Importacao automatica dos contratos historicos assinados.

## Verificacao

- TDD de templates, validacao, numeracao, snapshots e transicoes de status.
- Teste de contrato para migration, rotas, painel, previa e download.
- Smoke do PDF comprovando assinatura `%PDF`, logo/texto Mydrion e dados snapshotados.
- `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
