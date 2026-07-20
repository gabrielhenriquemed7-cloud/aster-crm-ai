import { Clock3 } from "lucide-react";

import type { MedicalRecordTimelineItem } from "@/lib/medical-record-center/types";

export function MedicalRecordTimeline({
  items,
}: {
  items: MedicalRecordTimelineItem[];
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Clock3 className="size-4 text-primary" />
        Timeline Clínica
      </h2>
      {items.length ? (
        <ol className="mt-3 space-y-3 border-l pl-4">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <strong>{item.date}</strong> · {item.time} · {item.professional}
              <p className="text-xs text-muted-foreground">
                {item.specialty || "Especialidade não informada"} · {item.type}{" "}
                · {item.status}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Estrutura preparada para a linha do tempo consolidada. A fonte
          longitudinal será conectada em etapa futura.
        </p>
      )}
    </section>
  );
}
