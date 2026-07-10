import { Activity, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const activities = [
  { title: "Registro de novo paciente", detail: "Carlos Henrique", time: "Há 15 min" },
  { title: "Atualização de prontuário", detail: "Marina Souza", time: "Há 40 min" },
  { title: "Receita gerada", detail: "Consulta de Ana Beatriz", time: "Há 1h" },
];

export function AtividadesRecentes() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <Activity className="size-5 text-primary" aria-hidden="true" />
            Atividades recentes
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Ações recentes capturadas pelo sistema.
          </p>
        </div>
        <Badge variant="outline">Tempo real</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((activity) => (
          <div
            key={activity.title}
            className="rounded-3xl border border-border bg-background/70 p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{activity.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{activity.detail}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <Clock3 className="size-3" aria-hidden="true" />
                {activity.time}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
