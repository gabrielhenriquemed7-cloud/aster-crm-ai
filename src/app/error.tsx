"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => { console.error("application error", error); }, [error]); return <main className="grid min-h-dvh place-items-center bg-background p-6 text-center"><div><p className="text-sm text-muted-foreground">Ocorreu um problema</p><h1 className="mt-2 text-3xl font-semibold">Não foi possível carregar esta página</h1><p className="mt-3 text-sm text-muted-foreground">Tente novamente. Se o problema persistir, entre em contato com o suporte.</p><Button onClick={reset} className="mt-6">Tentar novamente</Button></div></main>; }
