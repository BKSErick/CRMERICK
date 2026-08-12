' Roda prospeccao-aprovada.cmd SEM janela de console.
'
' Por que isto existe: a tarefa do Agendador roda com InteractiveToken, entao cada
' tick de 5 minutos abria um cmd.exe preto na area de trabalho do Erick. Em
' 12/08/2026 a manha inteira se perdeu porque as tres primeiras tentativas
' levaram Ctrl+C (os tres "^C" gravados no task.log) quando as janelas foram
' fechadas durante o trabalho normal; a quarta morreu depois de UMA mensagem e
' o lote bateu em max_attempts. Sem janela, nao ha o que fechar.
'
' Uso: wscript //nologo prospeccao-oculta.vbs AAAA-MM-DD morning|afternoon

Option Explicit

Dim shell, aspas, base, alvo, argumentos, comando, i

Set shell = CreateObject("WScript.Shell")
aspas = Chr(34)
base = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
alvo = base & "prospeccao-aprovada.cmd"

argumentos = ""
For i = 0 To WScript.Arguments.Count - 1
  argumentos = argumentos & " " & WScript.Arguments(i)
Next

' O caminho tem espaco ("CRM ERICK"), entao o cmd /c precisa das aspas externas
' alem das aspas do proprio caminho.
comando = "cmd /c " & aspas & aspas & alvo & aspas & argumentos & aspas

' 0 = janela oculta, True = espera terminar (o Agendador precisa do exit code).
WScript.Quit shell.Run(comando, 0, True)
