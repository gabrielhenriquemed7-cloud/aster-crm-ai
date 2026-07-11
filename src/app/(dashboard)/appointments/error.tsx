"use client";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function AppointmentsError({ reset }: { error: Error; reset: () => void }) { return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"><AlertCircle className="mx-auto size-8 text-destructive" /><h2 className="mt-3 font-semibold">Não foi possível carregar a agenda</h2><p className="mt-1 text-sm text-muted-foreground">Tente novamente. Se o erro persistir, confirme se a migration foi executada.</p><Button className="mt-4" onClick={reset}>Tentar novamente</Button></div>; }
