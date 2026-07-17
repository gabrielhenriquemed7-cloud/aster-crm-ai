"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => { console.error("application error", error); }, [error]); return <main className="grid min-h-dvh place-items-center bg-background p-6"><ErrorState className="w-full max-w-xl border-0" title="Não foi possível carregar esta página" description="Tente novamente. Se o problema persistir, entre em contato com o suporte." action={<Button onClick={reset}>Tentar novamente</Button>} /></main>; }
