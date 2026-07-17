"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("root application error", error); }, [error]);
  return <html lang="pt-BR"><body><main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground"><ErrorState className="w-full max-w-xl" title="Erro interno do ASTER" description="Não foi possível concluir esta operação. Tente novamente em instantes." action={<Button onClick={reset}>Tentar novamente</Button>} /></main></body></html>;
}
