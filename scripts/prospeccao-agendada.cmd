@echo off
REM Passo agendado do dia de prospeccao, chamado pelo Agendador de Tarefas do Windows.
REM   prospeccao-agendada.cmd followup 7    -> 7 follow-ups (respeita o teto de 7/hora)
REM   prospeccao-agendada.cmd novos 38      -> primeira mensagem ate fechar 38 no dia
REM
REM O teto do dia e contado NO BANCO, entao reexecutar nao zera nada e um passo que
REM falhar nao estoura o total. Os dois scripts recusam rodar fora da janela comercial.
cd /d "D:\001Gravity\CRM ERICK"
if not exist logs mkdir logs
echo. >> "logs\prospeccao.log"
echo ===== %DATE% %TIME% :: %1 %2 >> "logs\prospeccao.log"
if "%1"=="followup" (
  node scripts\uazapi-followup-batch.mjs --go --limit=%2 >> "logs\prospeccao.log" 2>&1
) else if "%1"=="novos" (
  node scripts\uazapi-send-batch.mjs --go --dia-inteiro --teto-dia=%2 >> "logs\prospeccao.log" 2>&1
) else if "%1"=="previa" (
  REM Dry-run antes da janela abrir: escreve a fila do dia pro Erick conferir e
  REM cancelar algum passo se algo estiver errado. Nao envia nada.
  node scripts\uazapi-followup-batch.mjs --limit=%2 >> "logs\previa.log" 2>&1
  node scripts\uazapi-send-batch.mjs >> "logs\previa.log" 2>&1
) else (
  echo passo desconhecido: %1 >> "logs\prospeccao.log"
)
