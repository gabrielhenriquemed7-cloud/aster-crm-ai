import type { LucideIcon } from "lucide-react";
import type { PropsWithChildren } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

export function MetricCard({
  children,
  description,
  icon: Icon,
  label,
  value,
}: PropsWithChildren<MetricCardProps>) {
  return (
    <Card className="gap-4 py-5 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between px-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="grid size-8 place-items-center rounded-2xl bg-muted/80 text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="px-5">
        <p className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl text-foreground">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}
