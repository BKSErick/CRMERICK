' Roda email-sequencia2.cmd SEM janela de console (mesmo motivo do prospeccao-oculta.vbs:
' janela visivel leva Ctrl+C durante o trabalho normal e o lote morre no meio).
'
' Uso: wscript //nologo email-oculto.vbs AAAA-MM-DD

Option Explicit

Dim shell, aspas, base, alvo, argumentos, comando, i

Set shell = CreateObject("WScript.Shell")
aspas = Chr(34)
base = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
alvo = base & "email-sequencia2.cmd"

argumentos = ""
For i = 0 To WScript.Arguments.Count - 1
  argumentos = argumentos & " " & WScript.Arguments(i)
Next

' O caminho tem espaco ("CRM ERICK"), entao o cmd /c precisa das aspas externas
' alem das aspas do proprio caminho.
comando = "cmd /c " & aspas & aspas & alvo & aspas & argumentos & aspas

' 0 = janela oculta, True = espera terminar (o Agendador precisa do exit code).
WScript.Quit shell.Run(comando, 0, True)
