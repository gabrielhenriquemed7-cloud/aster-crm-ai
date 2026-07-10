import { Bot, CheckCircle2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IAClinicaCard() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <Bot className="size-5 text-primary" aria-hidden="true" /> IA Clínica
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Recomendação inteligente para a rotina médica.
          </p>
        </div>
        <Badge variant="secondary">Insights diários</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.75rem] border border-border bg-surface-muted p-5">
          <p className="text-sm font-medium text-foreground">
            Prontuário resumido pronto
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A IA preparou um resumo dos últimos atendimentos de Marina Souza e
            recomendou mensagem de retorno.
          </p>
          <Button variant="link" size="sm" className="px-0">
            Revisar resumo
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-3xl border border-border bg-background/60 p-4">
            <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">4 alertas</p>
              <p className="text-sm text-muted-foreground">
                Pacientes com retorno recomendado hoje.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-3xl border border-border bg-background/60 p-4">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">2 oportunidades</p>
              <p className="text-sm text-muted-foreground">
                Medicina preventiva e follow-up com alta prioridade.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
