import { CircleDollarSign, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const categories = [
  { label: "Consultas", amount: "R$ 48.500", change: "+12%" },
  { label: "Exames", amount: "R$ 18.750", change: "+8%" },
  { label: "Produtos", amount: "R$ 16.900", change: "-2%" },
];

export function FinanceiroResumo() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <CircleDollarSign className="size-5 text-primary" aria-hidden="true" />
            Financeiro
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Panorama financeiro e previsões de receita.
          </p>
        </div>
        <Badge variant="secondary">Atualizado</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-border bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">Receita</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">R$ 84.250</p>
            <p className="mt-1 text-sm text-muted-foreground">+14,8% em relação ao mês anterior</p>
          </div>
          <div className="rounded-3xl border border-border bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">Despesas</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">R$ 24.150</p>
            <p className="mt-1 text-sm text-muted-foreground">-3,4% em relação ao mês anterior</p>
          </div>
          <div className="rounded-3xl border border-border bg-background/70 p-4">
            <p className="text-sm text-muted-foreground">Lucro</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">R$ 60.100</p>
            <p className="mt-1 text-sm text-muted-foreground">Margem saudável</p>
          </div>
        </div>
        <Table className="min-w-full rounded-3xl border border-border bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Alteração</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.label}>
                <TableCell>{category.label}</TableCell>
                <TableCell>{category.amount}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    {category.change.startsWith("+") ? (
                      <TrendingUp className="size-4 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="size-4 text-destructive" aria-hidden="true" />
                    )}
                    {category.change}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
