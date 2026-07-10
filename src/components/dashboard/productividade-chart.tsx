import { ArrowUpRight, Clock3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const productivity = [
  { name: "Seg", value: 85 },
  { name: "Ter", value: 92 },
  { name: "Qua", value: 88 },
  { name: "Qui", value: 95 },
  { name: "Sex", value: 90 },
  { name: "Sáb", value: 76 },
  { name: "Dom", value: 65 },
];

const maxValue = Math.max(...productivity.map((item) => item.value));

export function ProductividadeChart() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-xl font-semibold">Productividade</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Evolução diária dos atendimentos.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" aria-hidden="true" /> Última semana
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4 rounded-[2rem] border border-border bg-muted/10 p-4">
          {productivity.map((item) => (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{item.name}</span>
                <span>{item.value}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-3xl border border-border bg-background/70 px-4 py-3">
          <p className="text-sm text-muted-foreground">Média semanal</p>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
            86% <ArrowUpRight className="size-4 text-primary" aria-hidden="true" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
