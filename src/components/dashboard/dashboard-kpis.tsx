import { CalendarDays, CircleDollarSign, ClipboardList, UserPlus } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const metrics = [
  {
    label: "Consultas hoje",
    value: "12",
    description: "3 aguardando confirmação",
    icon: CalendarDays,
    badge: { label: "+14%", variant: "secondary" as const },
  },
  {
    label: "Receita do mês",
    value: "R$ 84.250",
    description: "+14,8% em relação ao mês anterior",
    icon: CircleDollarSign,
    badge: { label: "Financeiro estável", variant: "default" as const },
  },
  {
    label: "Novos pacientes",
    value: "23",
    description: "+6 nesta semana",
    icon: UserPlus,
    badge: { label: "Top 10%", variant: "secondary" as const },
  },
  {
    label: "Pendências",
    value: "05",
    description: "2 prontuários para revisar",
    icon: ClipboardList,
    badge: { label: "Ação necessária", variant: "destructive" as const },
  },
];

export function DashboardKPIs() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-border bg-surface p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Visão geral do dia</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Performance da clínica
          </h2>
        </div>
        <Button variant="outline" size="sm">
          Ver relatório completo
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric}>
            <Badge variant={metric.badge.variant} className="mt-4">
              {metric.badge.label}
            </Badge>
          </MetricCard>
        ))}
      </div>
    </section>
  );
}
