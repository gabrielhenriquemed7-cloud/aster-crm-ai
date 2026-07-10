import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

export function MetricCard({
  description,
  icon: Icon,
  label,
  value,
}: MetricCardProps) {
  return (
    <Card className="gap-4 py-5 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between px-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="px-5">
        <p className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
