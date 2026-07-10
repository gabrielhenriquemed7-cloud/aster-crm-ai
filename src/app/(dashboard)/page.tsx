import {
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  UserPlus,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const metrics = [
  {
    label: "Consultas hoje",
    value: "12",
    description: "3 aguardando confirmação",
    icon: CalendarDays,
  },
  {
    label: "Receita do mês",
    value: "R$ 84.250",
    description: "+14,8% em relação ao mês anterior",
    icon: CircleDollarSign,
  },
  {
    label: "Novos pacientes",
    value: "23",
    description: "+6 nesta semana",
    icon: UserPlus,
  },
  {
    label: "Pendências",
    value: "05",
    description: "2 prontuários para revisar",
    icon: ClipboardList,
  },
];

const appointments = [
  {
    time: "09:00",
    patient: "Marina Souza",
    detail: "Consulta de retorno",
    status: "Confirmada",
  },
  {
    time: "10:30",
    patient: "Carlos Henrique",
    detail: "Avaliação inicial",
    status: "Em breve",
  },
  {
    time: "14:00",
    patient: "Ana Beatriz",
    detail: "Teleconsulta",
    status: "Confirmada",
  },
];

export default function DashboardPage() {
  return (
    <>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Quinta-feira, 9 de julho
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Bom dia, José.
          </h1>
        </div>
        <Button>Adicionar paciente</Button>
      </section>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between border-b px-5 py-5">
            <div>
              <CardTitle>Agenda</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Consultas programadas para hoje
              </p>
            </div>
            <Button variant="ghost" size="sm">
              Ver agenda
            </Button>
          </CardHeader>
          <CardContent className="divide-y px-5">
            {appointments.map(({ detail, patient, status, time }) => (
              <div key={time} className="flex items-center gap-4 py-4">
                <p className="w-10 text-sm font-medium text-muted-foreground">
                  {time}
                </p>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{patient}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {detail}
                  </p>
                </div>
                <Badge
                  variant={status === "Em breve" ? "default" : "secondary"}
                >
                  {status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between border-b px-5 py-5">
            <div>
              <CardTitle>IA Clínica</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Insights para sua rotina
              </p>
            </div>
            <Bot className="size-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium">
                Resumo de prontuários pronto
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                A IA preparou um resumo dos últimos atendimentos de Marina
                Souza.
              </p>
              <Button variant="link" size="sm" className="mt-2 h-auto px-0">
                Revisar resumo
              </Button>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 size-4 text-primary"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                4 pacientes podem receber um lembrete de retorno hoje.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between border-b px-5 py-5">
            <div>
              <CardTitle>Próximos pacientes</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhamento prioritário da semana
              </p>
            </div>
            <Button variant="ghost" size="sm">
              Ver pacientes
            </Button>
          </CardHeader>
          <CardContent className="grid divide-y px-5 md:grid-cols-3 md:divide-x md:divide-y-0">
            {["João Pedro", "Luiza Martins", "Renata Oliveira"].map(
              (patient, index) => (
                <div
                  key={patient}
                  className="py-4 md:px-4 first:pl-0 last:pr-0"
                >
                  <p className="text-sm font-medium">{patient}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {index === 0
                      ? "Retorno em 2 dias"
                      : index === 1
                        ? "Aguardando exames"
                        : "Consulta em 15 de julho"}
                  </p>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
