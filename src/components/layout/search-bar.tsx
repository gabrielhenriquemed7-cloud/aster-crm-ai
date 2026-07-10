import { Command, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export function SearchBar() {
  return (
    <div className="relative hidden max-w-md flex-1 md:block">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className="h-9 bg-muted/45 pl-9 pr-16 shadow-none"
        placeholder="Buscar pacientes, agenda..."
        aria-label="Buscar"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        <Command className="mr-0.5 inline size-2.5" aria-hidden="true" />K
      </kbd>
    </div>
  );
}
