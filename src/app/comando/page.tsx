import { ModuleScaffold } from "@/components/ModuleScaffold";

// Sala de Comando: visao executiva. No shell legado era 100% dado fabricado (pipeline, deals,
// TechNova, quedas ficticias). Portado como scaffold nativo com estado vazio + atalhos para os
// modulos que ja tem dado real (pipeline, funil, conteudo, sinais).

export default function ComandoPage() {
  return (
    <ModuleScaffold
      title="Sala de Comando"
      subtitle="Visao executiva da operacao - prioridades, riscos e decisoes consolidadas em um unico painel. O estado do negocio em segundos."
      emptyNotice="Sem leitura consolidada ainda. Conforme pipeline, conteudo e sinais forem alimentados, a Sala de Comando resume aqui as prioridades, riscos e decisoes do periodo. Nenhum numero e inventado."
      sections={[
        { title: "Prioridades", description: "Alerta principal, gargalo atual, oportunidade mais quente e decisao pendente do periodo." },
        { title: "KPIs Estrategicos", description: "Pipeline, conversao do funil, receita projetada e fechamento - a partir das fontes reais." },
        { title: "Nucleo Operacional", description: "Visao consolidada de Funis, Pipeline, Conteudo e Sinais em um so lugar." },
        { title: "Fila Prioritaria", description: "O que fazer agora: leads e propostas para revisar, follow-ups e gargalos para atacar." },
        { title: "Inteligencia", description: "Leitura interpretativa: tendencia principal, maior queda, melhor recuperacao e hipoteses." },
        { title: "Decisoes Pendentes", description: "Aprovacoes e validacoes que destravam o proximo movimento da operacao." },
      ]}
      links={[
        { label: "Abrir Pipeline", href: "/pipeline" },
        { label: "Ver Funis", href: "/funil" },
        { label: "Ver Conteudo", href: "/conteudo" },
        { label: "Ver Sinais", href: "/sinais" },
      ]}
    />
  );
}
