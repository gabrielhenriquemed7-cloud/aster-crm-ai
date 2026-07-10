import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const moduleDetails = {
  agenda: {
    description: "Organize consultas, bloqueios e disponibilidade da equipe.",
    title: "Agenda",
  },
  pacientes: {
    description:
      "Acompanhe pacientes, prontuários e histórico de atendimentos.",
    title: "Pacientes",
  },
  consultas: {
    description: "Gerencie consultas, confirmações e status dos atendimentos.",
    title: "Consultas",
  },
  "ia-clinica": {
    description: "Use insights para apoiar sua rotina clínica com segurança.",
    title: "IA Clínica",
  },
  financeiro: {
    description: "Acompanhe receitas, repasses e indicadores financeiros.",
    title: "Financeiro",
  },
  relatorios: {
    description: "Visualize indicadores e relatórios da sua clínica.",
    title: "Relatórios",
  },
  configuracoes: {
    description: "Ajuste preferências, equipe e configurações da clínica.",
    title: "Configurações",
  },
} as const;

interface ModulePageProps {
  params: Promise<{ module: string }>;
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { module } = await params;
  const moduleDetail = moduleDetails[module as keyof typeof moduleDetails];

  if (!moduleDetail) {
    notFound();
  }

  return (
    <section>
      <p className="text-sm text-muted-foreground">ASTER CRM AI</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        {moduleDetail.title}
      </h1>
      <Card className="mt-7 max-w-2xl shadow-none">
        <CardHeader>
          <CardTitle>Em preparação</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            {moduleDetail.description}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
