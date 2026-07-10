import { UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const patients = [
  { name: "João Pedro", next: "Retorno em 2 dias" },
  { name: "Luiza Martins", next: "Aguardando exames" },
  { name: "Renata Oliveira", next: "Consulta em 15 de julho" },
];

export function ProximosPacientes() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <UserPlus className="size-5 text-primary" aria-hidden="true" />
            Próximos pacientes
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Foco nos acompanhamentos prioritários.
          </p>
        </div>
        <Badge variant="outline">Semana</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        {patients.map((patient) => (
          <div
            key={patient.name}
            className="rounded-[1.75rem] border border-border bg-background/70 p-4"
          >
            <p className="text-sm font-semibold text-foreground">{patient.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{patient.next}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
