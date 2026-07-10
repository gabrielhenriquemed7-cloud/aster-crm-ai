import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <main className="grid min-h-dvh place-items-center bg-background p-6 text-center"><div><p className="text-sm text-muted-foreground">404</p><h1 className="mt-2 text-3xl font-semibold">Página não encontrada</h1><p className="mt-3 text-sm text-muted-foreground">Verifique o endereço ou retorne ao painel.</p><Button render={<Link href="/dashboard" />} className="mt-6">Ir para o dashboard</Button></div></main>; }
