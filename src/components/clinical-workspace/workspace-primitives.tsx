export function WorkspaceHeader({
  identity,
  actions,
}: {
  identity: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <header className="flex min-h-11 flex-col gap-2 border-b bg-background py-1.5 xl:flex-row xl:items-center xl:justify-between">
      {identity}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {actions}
      </div>
    </header>
  );
}

export function WorkspaceFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-40 -mx-1 flex min-h-11 items-center justify-end gap-2 border-t bg-background/95 px-2 py-1.5 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.7)] backdrop-blur">
      {children}
    </footer>
  );
}

export function ClinicalSection({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}

export function ClinicalPreview({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <section className="rounded-md border bg-background p-2">
      <h3 className="text-[11px] font-semibold tracking-wide uppercase">
        {title}
      </h3>
      <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-xs text-muted-foreground">
        {content || "Nenhum conteúdo registrado nesta etapa."}
      </p>
    </section>
  );
}

export function WorkspaceNavigation({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="contents">{children}</div>;
}

export function WorkspaceSidebar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-full flex-col gap-3 rounded-xl border border-primary/25 bg-card p-2 shadow-sm">
      {children}
    </div>
  );
}
