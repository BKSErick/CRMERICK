@echo off
REM Dispara um lote do e-mail 1 (institucional) a partir do email_queue.json. Chamado pelo
REM Agendador via email-institucional-oculto.vbs (janela oculta).
REM Uso: email-institucional.cmd AAAA-MM-DD N
REM Fila e log padrao (email_queue.json / sent_log.json): o build do frio le esse log pra
REM jaEnviado/mesmaCasa. Acima de 20/dia e --limit=N --cap=N de proposito (runbook).
setlocal
cd /d "%~dp0"
set DIA=%1
set N=%2
if "%DIA%"=="" (
  echo Uso: email-institucional.cmd AAAA-MM-DD N
  exit /b 1
)
if "%N%"=="" set N=20
if not exist "email_queue.json" (
  echo [%DATE% %TIME%] Sem fila email_queue.json. Nada a fazer. >> "..\..\logs\email-inst-%DIA%.log"
  exit /b 0
)
echo [%DATE% %TIME%] Iniciando institucional %DIA% limit=%N% cap=%N% >> "..\..\logs\email-inst-%DIA%.log"
node --env-file-if-exists=..\..\.env brevo_send.mjs --limit=%N% --cap=%N% >> "..\..\logs\email-inst-%DIA%.log" 2>&1
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] Fim rc=%RC% >> "..\..\logs\email-inst-%DIA%.log"
exit /b %RC%
