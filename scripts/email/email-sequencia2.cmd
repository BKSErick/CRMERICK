@echo off
REM Dispara a fila do segundo e-mail da sequencia de UM dia. Chamado pelo Agendador via
REM email-oculto.vbs (janela oculta). Uso: email-sequencia2.cmd AAAA-MM-DD
REM Fila e log proprios (--queue/--log): o sent_log.json principal nunca ve sequencia.
setlocal
cd /d "%~dp0"
set DIA=%1
if "%DIA%"=="" (
  echo Uso: email-sequencia2.cmd AAAA-MM-DD
  exit /b 1
)
if not exist "email_queue_seq2_%DIA%.json" (
  echo [%DATE% %TIME%] Sem fila email_queue_seq2_%DIA%.json. Nada a fazer. >> "..\..\logs\email-seq2-%DIA%.log"
  exit /b 0
)
echo [%DATE% %TIME%] Iniciando sequencia 2 de %DIA% >> "..\..\logs\email-seq2-%DIA%.log"
node --env-file-if-exists=..\..\.env brevo_send.mjs --queue=email_queue_seq2_%DIA%.json --log=sent_log_seq2.json --limit=60 --cap=100 >> "..\..\logs\email-seq2-%DIA%.log" 2>&1
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] Fim rc=%RC% >> "..\..\logs\email-seq2-%DIA%.log"
exit /b %RC%
