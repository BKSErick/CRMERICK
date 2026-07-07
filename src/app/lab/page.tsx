import { ModuleScaffold } from "@/components/ModuleScaffold";

// Lab: centro de experimentacao. No shell legado era dado fabricado (experimentos, owners e
// metricas ficticios, "Estrategia ABA" de outro cliente). Portado como scaffold nativo com
// estado vazio - o Erick registra o primeiro experimento real quando iniciar.

export default function LabPage() {
  return (
    <ModuleScaffold
      title="Lab"
      subtitle="Centro de experimentacao estrategica - hipoteses, testes, aprendizados e ativacoes em andamento. Menos suposicao, mais sinal."
      emptyNotice="Nenhum experimento cadastrado ainda. Teste principal, experimentos ativos, hipoteses, aprendizados e proximas ativacoes aparecem aqui quando voce registrar o primeiro. Sem resultado inventado."
      sections={[
        { title: "Experimento Principal", description: "O teste de maior prioridade e impacto potencial no momento, revisado a cada semana." },
        { title: "Experimentos Ativos", description: "Testes rodando, em setup ou planejados, com confianca, impacto e proxima leitura." },
        { title: "Hipoteses", description: "Ideias ainda nao ativadas como teste - aguardam evidencia inicial, risco e owner." },
        { title: "Testes por Frente", description: "Distribuicao por area: Conteudo, Funil, Aquisicao, Oferta, Operacao e Marca." },
        { title: "Aprendizados", description: "O que os experimentos ensinaram: validado, invalidado, repetir/escalar e descartar." },
        { title: "Proximas Ativacoes", description: "Testes prontos para rodar, ajustes necessarios e dependencias identificadas." },
      ]}
    />
  );
}
