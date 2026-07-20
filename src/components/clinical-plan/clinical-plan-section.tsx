import { CheckCircle2, ChevronRight, type LucideIcon } from "lucide-react";

export function ClinicalPlanSection({
  title,
  description,
  summary,
  count,
  icon: Icon,
  allowMultiple = false,
  children,
}: {
  title: string;
  description: string;
  summary?: string;
  count?: number;
  icon?: LucideIcon;
  allowMultiple?: boolean;
  children: React.ReactNode;
}) {
  const filled = Boolean(count);
  return (
    <details
      name={allowMultiple ? undefined : "clinical-conduct-module"}
      className="group overflow-hidden rounded-lg border bg-background transition-colors open:border-primary/30"
    >
      <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[20px_minmax(0,1fr)_auto_18px] items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
        {Icon ? (
          <Icon className="size-[18px] text-primary" aria-hidden="true" />
        ) : (
          <span />
        )}
        <span className="min-w-0">
          <strong className="block text-sm">{title}</strong>
          <span className="block truncate text-xs text-muted-foreground">
            {summary || description}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {filled && (
            <CheckCircle2
              className="size-3.5 text-emerald-600"
              aria-label="Preenchido"
            />
          )}
          <span className="min-w-6 rounded-full border px-1.5 py-0.5 text-center text-[10px] text-muted-foreground">
            {count ?? 0}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t p-3">{children}</div>
    </details>
  );
}
