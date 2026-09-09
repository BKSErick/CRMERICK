# Design - Mydrion CRM Design System

## Decisao aprovada

Manter o produto, o checkout e as integracoes do `CRM ERICK`, substituindo o sistema
visual legado de `Hub Operacional / CRM Erick` pela identidade oficial da Mydrion.
A mudanca e de marca e interface; dados, rotas, permissoes e automacoes permanecem
inalterados.

## Identidade

- Nome visivel: `Mydrion CRM`.
- Descritor: `Operacao comercial`.
- Logo: wordmark oficial existente em `public/brand/mydrion-contract.svg`.
- Simbolo: monograma oficial da Mydrion, usado em favicon e superficies compactas.
- Tipografia: `Instrument Sans` para interface e `IBM Plex Mono` para metadados.

## Tokens

- Ink 950: `#08090b`.
- Ink 900: `#0e1013`.
- Ink 800: `#191c21`.
- Ink 700: `#262a30`.
- Smoke 500: `#7b7f87`.
- Smoke 300: `#a4a7ae`.
- Paper 100: `#f7f5f0`.
- Paper 0: `#ffffff`.
- Sand 300: `#f9d9b1`.
- Sand 400: `#e8c49a`.
- Accent acessivel em superficies claras: `#8d5c25`.
- Accent forte: `#70451d`.

## Aplicacao

- Sidebar escura com wordmark Mydrion, navegacao ativa em areia e rodape preservado.
- Topbar clara e aquecida, breadcrumb `Mydrion CRM / modulo` e busca consistente.
- Conteudo em paper warm, cards brancos, bordas discretas e sombras mais editoriais.
- Botoes primarios em ink/accent, estados de foco e selecao em sand/accent.
- Login integralmente Mydrion, sem violeta ou referencias a Hub/CRM Erick.
- Formularios, tabelas, kanbans, modais e automacoes herdam os novos tokens.
- Cores funcionais de sucesso, alerta, perigo e categorias permanecem semanticamente
  distintas; apenas o antigo violeta de marca e removido.
- Responsividade e `prefers-reduced-motion` existentes sao preservados.

## Limites

- Sem alteracao de banco, API, autenticacao ou regras comerciais.
- Sem renomear a pasta `CRM ERICK`, o repositorio Git ou variaveis de integracao.
- Sem commit, push ou deploy antes da aprovacao visual no localhost.
- Alteracoes preexistentes nos arquivos compartilhados devem ser preservadas.

## Validacao

- Teste estrutural garante marca, logo, tokens e ausencia da paleta violeta legada.
- Lint, typecheck, testes e build validam regressao tecnica.
- Revisao visual em desktop e mobile valida contraste, hierarquia e responsividade.

