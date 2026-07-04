/**
 * CRM ERICK — Banco de Dados Mockado Centralizado
 * Esta é a única fonte de verdade para os dados estáticos do CRM.
 * Facilita a migração futura para APIs e Banco de Dados (ex: Supabase).
 */

window.stages = [
  { id: 'prospect', label: 'Prospect', color: '#0091ff' },
  { id: 'qualified', label: 'Qualified', color: '#7b68ee' },
  { id: 'proposal', label: 'Proposal', color: '#ed6c02' },
  { id: 'negotiation', label: 'Negotiation', color: '#d32f2f' },
  { id: 'won', label: 'Won', color: '#2e7d32' },
  { id: 'lost', label: 'Lost', color: '#646464' }
];

window.ownerMeta = {
  JM: { initials: 'JM', cls: 'av-mira', name: 'João M.' },
  CS: { initials: 'CS', cls: 'av-cale', name: 'Carla S.' },
  PA: { initials: 'PA', cls: 'av-pri', name: 'Pedro A.' },
  AL: { initials: 'AL', cls: 'av-al', name: 'Ana L.' },
  RT: { initials: 'RT', cls: 'av-rt', name: 'Rafael T.' },
  DP: { initials: 'DP', cls: 'av-dev', name: 'Devon P.' },
  PB: { initials: 'PB', cls: 'av-pri', name: 'Priya B.' },
  MR: { initials: 'MR', cls: 'av-mira', name: 'Mira R.' }
};

window.deals = [
  { id: 1, name: 'TechCorp Solutions', company: 'TechCorp', value: 180000, prob: 80, stage: 'negotiation', owner: 'JM', ownerName: 'João M.', close: '15/08/2026', tag: 'Enterprise', tagType: 'feature', ticketId: 'NOR-301', points: 5, progress: 0, assignee: 'DP' },
  { id: 2, name: 'Inovação Sistemas', company: 'Inovação Ltda', value: 95000, prob: 60, stage: 'proposal', owner: 'CS', ownerName: 'Carla S.', close: '22/08/2026', tag: 'SMB', tagType: 'design', ticketId: 'NOR-302', points: 3, progress: 0, assignee: 'MR' },
  { id: 3, name: 'DataPrime Analytics', company: 'DataPrime', value: 82000, prob: 40, stage: 'qualified', owner: 'PA', ownerName: 'Pedro A.', close: '10/09/2026', tag: 'Enterprise', tagType: 'bug', ticketId: 'NOR-303', points: 2, progress: 80, assignee: 'CA' },
  { id: 4, name: 'CloudNine Hosting', company: 'CloudNine', value: 76000, prob: 55, stage: 'proposal', owner: 'AL', ownerName: 'Ana L.', close: '05/09/2026', tag: 'Startup', tagType: 'feature', ticketId: 'NOR-304', points: 8, progress: 0, assignee: 'PB' },
  { id: 5, name: 'Nexa Digital', company: 'Nexa Group', value: 64000, prob: 75, stage: 'negotiation', owner: 'RT', ownerName: 'Rafael T.', close: '28/07/2026', tag: 'SMB', tagType: 'chore', ticketId: 'NOR-305', points: 1, progress: 0, assignee: 'CA' },
  { id: 6, name: 'Atlas Solutions', company: 'Atlas Corp', value: 120000, prob: 25, stage: 'prospect', owner: 'JM', ownerName: 'João M.', close: '20/10/2026', tag: 'Enterprise', tagType: 'research', ticketId: 'NOR-306', points: 8, progress: 0, assignee: 'PB' },
  { id: 7, name: 'PrimeWave Tech', company: 'PrimeWave', value: 54000, prob: 35, stage: 'prospect', owner: 'PA', ownerName: 'Pedro A.', close: '15/11/2026', tag: 'Startup', tagType: 'feature', ticketId: 'NOR-307', points: 5, progress: 0, assignee: 'DP' },
  { id: 8, name: 'Stellar Systems', company: 'Stellar Inc', value: 156000, prob: 90, stage: 'negotiation', owner: 'CS', ownerName: 'Carla S.', close: '01/08/2026', tag: 'Enterprise', tagType: 'feature', ticketId: 'NOR-308', points: 5, progress: 0, assignee: 'DP' },
  { id: 9, name: 'Quantum Finance', company: 'Quantum', value: 42000, prob: 45, stage: 'qualified', owner: 'AL', ownerName: 'Ana L.', close: '12/09/2026', tag: 'SMB', tagType: 'bug', ticketId: 'NOR-309', points: 2, progress: 0, assignee: 'CA' },
  { id: 10, name: 'EcoPower Energy', company: 'EcoPower', value: 88000, prob: 30, stage: 'prospect', owner: 'RT', ownerName: 'Rafael T.', close: '30/11/2026', tag: 'Startup', tagType: 'design', ticketId: 'NOR-310', points: 3, progress: 0, assignee: 'MR' },
  { id: 11, name: 'NovaTech BR', company: 'NovaTech', value: 73000, prob: 65, stage: 'proposal', owner: 'JM', ownerName: 'João M.', close: '08/09/2026', tag: 'SMB', tagType: 'feature', ticketId: 'NOR-311', points: 3, progress: 0, assignee: 'DP' },
  { id: 12, name: 'Fusion Analytics', company: 'Fusion', value: 210000, prob: 85, stage: 'negotiation', owner: 'PA', ownerName: 'Pedro A.', close: '10/08/2026', tag: 'Enterprise', tagType: 'chore', ticketId: 'NOR-312', points: 1, progress: 0, assignee: 'CA' }
];

window.activityTemplates = [
  { user: 'Erick Sena', initials: 'ES', action: 'criou esta tarefa' },
  { user: 'João M.', initials: 'JM', action: 'moveu para o estágio atual' },
  { user: 'Carla S.', initials: 'CS', action: 'atualizou o valor do deal' },
  { user: 'Pedro A.', initials: 'PA', action: 'adicionou uma descrição' },
  { user: 'Ana L.', initials: 'AL', action: 'anexou um arquivo' },
  { user: 'Rafael T.', initials: 'RT', action: 'comentou: Precisa de aprovação do diretor' },
  { user: 'Erick Sena', initials: 'ES', action: 'alterou a prioridade para Alta' },
  { user: 'Carla S.', initials: 'CS', action: 'agendou reunião para próxima semana' }
];

window.activityTimes = [
  'hoje às 14:50', 'hoje às 11:20', 'ontem às 16:30', 'ontem às 09:15', 'terça, 10:45', 'segunda, 15:00', '28 jun, 13:30', '26 jun, 10:00'
];

window.customFieldTemplates = [
  { type: 'select', label: 'Fase', icon: '⊞', options: [
    { label: 'Briefing', color: '#f97316' },
    { label: 'Acessos', color: '#3b82f6' },
    { label: 'Configuração', color: '#a855f7' },
    { label: 'Treinamento', color: '#0d9488' },
    { label: 'Go Live', color: '#22c55e' }
  ]},
  { type: 'url', label: 'Link Drive', icon: '🔗' },
  { type: 'user', label: 'Responsável Cliente', icon: '👥' },
  { type: 'currency', label: 'Valor Mensal (R$)', icon: '💰' },
  { type: 'date', label: 'Início do Contrato', icon: '📅' },
  { type: 'select', label: 'Tipo de Serviço', icon: '⊞' },
  { type: 'date', label: 'Renovação', icon: '📅' },
  { type: 'url', label: 'Link do Contrato', icon: '🔗' }
];

window.contacts = [
  { name: 'Lucas Oliveira', company: 'TechCorp', email: 'lucas.oliveira@techcorp.com', phone: '(11) 99999-1001', status: 'active', initials: 'LO', owner: 'JM', ownerName: 'João M.' },
  { name: 'Juliana Costa', company: 'Inovação Sistemas', email: 'juliana@inovacao.com', phone: '(21) 98888-2002', status: 'active', initials: 'JC', owner: 'CS', ownerName: 'Carla S.' },
  { name: 'Felipe Almeida', company: 'DataPrime Analytics', email: 'felipe@dataprime.com', phone: '(31) 97777-3003', status: 'active', initials: 'FA', owner: 'PA', ownerName: 'Pedro A.' },
  { name: 'Beatriz Santos', company: 'CloudNine Hosting', email: 'beatriz@cloudnine.io', phone: '(41) 96666-4004', status: 'lead', initials: 'BS', owner: 'AL', ownerName: 'Ana L.' },
  { name: 'Rafael Torres', company: 'Nexa Digital', email: 'rafael.t@nexadigital.com', phone: '(51) 95555-5005', status: 'active', initials: 'RT', owner: 'RT', ownerName: 'Rafael T.' },
  { name: 'Camila Rocha', company: 'Atlas Solutions', email: 'camila@atlassol.com', phone: '(61) 94444-6006', status: 'lead', initials: 'CR', owner: 'JM', ownerName: 'João M.' },
  { name: 'Thiago Martins', company: 'PrimeWave Tech', email: 'thiago@primewave.com', phone: '(71) 93333-7007', status: 'active', initials: 'TM', owner: 'PA', ownerName: 'Pedro A.' },
  { name: 'Amanda Ferreira', company: 'Stellar Systems', email: 'amanda@stellarsys.com', phone: '(81) 92222-8008', status: 'inactive', initials: 'AF', owner: 'CS', ownerName: 'Carla S.' },
  { name: 'Diego Nascimento', company: 'Quantum Finance', email: 'diego@quantumfin.com', phone: '(91) 91111-9009', status: 'active', initials: 'DN', owner: 'AL', ownerName: 'Ana L.' },
  { name: 'Larissa Mendes', company: 'EcoPower Energy', email: 'larissa@ecopower.com', phone: '(11) 90000-1010', status: 'lead', initials: 'LM', owner: 'RT', ownerName: 'Rafael T.' },
  { name: 'Gabriel Souza', company: 'NovaTech BR', email: 'gabriel@novatech.com', phone: '(21) 91234-5678', status: 'active', initials: 'GS', owner: 'JM', ownerName: 'João M.' },
  { name: 'Patrícia Lima', company: 'Fusion Analytics', email: 'patricia@fusionanalytics.com', phone: '(31) 98765-4321', status: 'active', initials: 'PL', owner: 'CS', ownerName: 'Carla S.' },
  { name: 'André Cardoso', company: 'MegaCorp Brasil', email: 'andre@megacorp.com', phone: '(41) 93456-7890', status: 'inactive', initials: 'AC', owner: 'PA', ownerName: 'Pedro A.' },
  { name: 'Sofia Rodrigues', company: 'NovaGeração Tech', email: 'sofia@novageracao.com', phone: '(51) 94567-8901', status: 'lead', initials: 'SR', owner: 'AL', ownerName: 'Ana L.' },
  { name: 'Eduardo Barbosa', company: 'SigmaData', email: 'eduardo@sigmadata.com', phone: '(61) 95678-9012', status: 'active', initials: 'EB', owner: 'RT', ownerName: 'Rafael T.' }
];

window.contactsDB = window.contacts; // Alias para compatibilidade

window.topDeals = [
  { id: 1, name: 'TechCorp Solutions', value: 180000, stage: 'negotiation', stageLabel: 'Negociação', stageClass: 'negotiation', owner: 'JM', ownerName: 'João M.' },
  { id: 2, name: 'Inovação Sistemas', value: 95000, stage: 'proposal', stageLabel: 'Proposta', stageClass: 'proposal', owner: 'CS', ownerName: 'Carla S.' },
  { id: 3, name: 'DataPrime Analytics', value: 82000, stage: 'qualified', stageLabel: 'Qualificado', stageClass: 'qualified', owner: 'PA', ownerName: 'Pedro A.' },
  { id: 4, name: 'CloudNine Hosting', value: 76000, stage: 'proposal', stageLabel: 'Proposta', stageClass: 'proposal', owner: 'AL', ownerName: 'Ana L.' },
  { id: 5, name: 'Nexa Digital', value: 64000, stage: 'negotiation', stageLabel: 'Negociação', stageClass: 'negotiation', owner: 'RT', ownerName: 'Rafael T.' }
];

window.cmoReportData = {
  weekly: {
    title: 'Relatório Semanal — 23 a 29 de Junho',
    content: '📋 RESUMO EXECUTIVO\n' +
      'Período: 23 a 29 de Junho de 2026\n\n' +
      '🔹 Pipeline Total: R$ 2.4M (+12% vs. semana anterior)\n' +
      '🔹 Deals Novos: 4 (Prospect) — R$ 380K adicionados\n' +
      '🔹 Propostas Enviadas: 3 — R$ 245K em negociação\n' +
      '🔹 Won: 1 deal (Nexa Digital — R$ 64K)\n' +
      '🔹 Win Rate: 68% (estável)\n\n' +
      '📊 TENDÊNCIAS\n' +
      '• O ticket médio subiu 8% nas últimas 4 semanas ($22.7K → $24.5K)\n' +
      '• Deals em Negociação (+1) indicam pipeline saudável para Julho\n' +
      '• Melhor desempenho: equipe de Carla S. (3 deals em Proposta)\n\n' +
      '⚡ RECOMENDAÇÕES\n' +
      '1. Priorizar follow-up dos 3 deals em Negociação (R$ 280K)\n' +
      '2. Revisar critérios de qualificação — taxa de conversão Prospect→Qualified caiu 5pp\n' +
      '3. Acionar IA Objection Breaker nos deals parados há > 7 dias'
  },
  funnel: {
    title: 'Análise de Funil — Junho/2026',
    content: '🔍 ANÁLISE DE FUNIL — JUNHO/2026\n\n' +
      'VISÃO GERAL DO FUNIL\n\n' +
      'Prospect      → 12 deals  |  R$ 850K  |  Conversão: 100%\n' +
      'Qualified     →  8 deals  |  R$ 620K  |  Taxa: 67%\n' +
      'Proposal      →  5 deals  |  R$ 410K  |  Taxa: 63%\n' +
      'Negotiation   →  3 deals  |  R$ 280K  |  Taxa: 60%\n' +
      'Won           → 15 deals  |  R$ 1.2M  |  Taxa: —\n\n' +
      '⚠️ GARGALOS IDENTIFICADOS\n' +
      '• Stage Proposal: 63% de conversão — 2 deals parados há 12+ dias\n' +
      '• Falta de propostas enviadas: 5 deals em Proposal, mas 3 sem proposta registrada\n\n' +
      '✅ OPORTUNIDADES\n' +
      '• Ativar o Construtor de Propostas para acelerar os 3 deals sem documento\n' +
      '• Usar o Objection Breaker nos 2 deals parados em Negociação'
  },
  instagram: {
    title: 'Performance Instagram — Junho/2026',
    content: '📸 PERFORMANCE INSTAGRAM — JUNHO/2026\n\n' +
      '📈 MÉTRICAS PRINCIPAIS\n' +
      '• Seguidores: 18.4K (+5.4% no mês)\n' +
      '• Alcance (30d): 245.8K\n' +
      '• Engajamento médio: 4.8%\n' +
      '• Posts: 24 (média de 0.8/dia)\n\n' +
      '🏆 TOP CONTEÚDO\n' +
      '1. Vídeo: "Como comecei meu primeiro M de faturamento" — 41.2K alcance, 7.4% eng.\n' +
      '2. Vídeo: "5 erros que travam seu negócio" — 28.4K alcance, 6.1% eng.\n' +
      '3. Carrossel: "Estratégia ABA passo a passo" — 18.2K alcance, 4.8% eng.\n\n' +
      '⏰ MELHOR HORÁRIO\n' +
      '• Terça-feira às 19h — engajamento 40% acima da média\n' +
      '• Evitar: sábado/domingo antes das 10h\n\n' +
      '⚡ RECOMENDAÇÕES\n' +
      '1. Aumentar frequência de Reels (formato com maior alcance orgânico)\n' +
      '2. Postar terça e quinta às 19h — horário de pico comprovado\n' +
      '3. Criar mais conteúdo "bastidor" — teve 2.3× mais engagement que posts de produto'
  },
  diagnostic: {
    title: 'Diagnóstico Rápido — CRM',
    content: '⚡ DIAGNÓSTICO RÁPIDO — CRM\n\n' +
      '📊 SAÚDE DO PIPELINE\n' +
      '• ✅ Volume total saudável (R$ 2.4M)\n' +
      '• ⚠️ Taxa de conversão Proposal→Negotiation abaixo do ideal (60%)\n' +
      '• ✅ Win Rate de 68% — acima da média do mercado (48%)\n\n' +
      '🔧 OPORTUNIDADES DE MELHORIA\n' +
      '1. Propostas: 3 deals em Proposal sem proposta registrada — use o Construtor\n' +
      '2. Follow-up: 2 deals em Negociação sem atividade há 7+ dias\n' +
      '3. Qualificação: critérios de Prospect→Qualified podem estar frouxos\n\n' +
      '🤖 IA DISPONÍVEL\n' +
      '• Objection Breaker: integrado no modal do deal — responda objeções em 1 clique\n' +
      '• CMO AI: análises estratégicas como este diagnóstico\n' +
      '• Agentes de IA: copilotos configuráveis para vendas, suporte e mídia\n\n' +
      '🎯 PRÓXIMO PASSO RECOMENDADO\n' +
      'Revisar os 3 deals em Proposal sem proposta e criar os documentos usando o Construtor integrado.'
  }
};
