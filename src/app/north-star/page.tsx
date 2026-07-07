import { ModuleScaffold } from "@/components/ModuleScaffold";

// North Star: direcao e foco. No shell legado era dado fabricado de outro negocio (clinicas,
// "Dr. Cardoso", MRR ficticio, owners inexistentes). Portado como scaffold nativo com estado
// vazio - o Erick registra a direcao real do trimestre quando definir.

export default function NorthStarPage() {
  return (
    <ModuleScaffold
      title="North Star"
      subtitle="Fonte de direcao e foco do sistema. Esta nao e uma pagina de metricas - e o campo magnetico que orienta cada decisao, aposta e movimento do Hub."
      emptyNotice="Nenhuma direcao registrada ainda. Objetivo do trimestre, apostas, anti-objetivos e riscos aparecem aqui quando voce definir o North Star. Nada e preenchido com meta inventada."
      sections={[
        { title: "Foco Atual", description: "Objetivo central do trimestre, risco principal, aposta principal e proximo movimento." },
        { title: "Objetivos", description: "Tres horizontes de direcao - curto, medio e longo prazo - cada um com owner, status e impacto." },
        { title: "Anti-objetivos", description: "O que nao sera perseguido neste horizonte. Saber o que esta fora do foco tambem orienta." },
        { title: "Apostas Estrategicas", description: "Hipoteses com retorno esperado, risco calculado e nivel de confianca." },
        { title: "Riscos Estrategicos", description: "Os riscos que mais ameacam a direcao atual, cada um com severidade e mitigacao." },
        { title: "Proximos Movimentos", description: "Acoes que destravam avanco, com dependencias identificadas e ordem de prioridade." },
      ]}
    />
  );
}
