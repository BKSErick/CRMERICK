import { ModuleScaffold } from "@/components/ModuleScaffold";

// Reunioes: central de alinhamento. No shell legado era 100% fabricado (pessoas, reunioes e
// decisoes ficticias; Erick opera solo). Portado como scaffold nativo com estado vazio - o
// Erick registra os encontros reais quando houver.

export default function ReunioesPage() {
  return (
    <ModuleScaffold
      title="Reunioes"
      subtitle="Central de alinhamento inteligente - contexto, decisoes capturadas, follow-ups e visao executiva de cada encontro."
      emptyNotice="Nenhuma reuniao registrada ainda. Proxima reuniao, linha do tempo, decisoes capturadas e follow-ups aparecem aqui quando voce registrar os encontros. Nenhuma pessoa ou decisao ficticia."
      sections={[
        { title: "Proxima Reuniao", description: "O proximo encontro critico, com pauta, contexto preparado e decisoes pendentes." },
        { title: "Linha do Tempo", description: "Reunioes recentes com decisoes extraidas, pendencias abertas e contexto capturado." },
        { title: "Decisoes Capturadas", description: "Cada decisao extraida das reunioes, com owner e impacto mapeado." },
        { title: "Pendencias e Follow-ups", description: "O que precisa de retorno, o que esta travado e o que depende de alguem para avancar." },
        { title: "Sintese da Semana", description: "Principais alinhamentos, riscos identificados e proximos movimentos." },
      ]}
    />
  );
}
