"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

const roleLabels: Record<string, string> = { administrator: "Administrador", doctor: "Médico", secretary: "Secretária", receptionist: "Recepcionista" };

export function UserMenu() {
  const router = useRouter(); const [name, setName] = useState("Usuário"); const [role, setRole] = useState("receptionist");
  useEffect(() => { const supabase = createClient(); void (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(); setName(data?.full_name || user.user_metadata.full_name || user.email || "Usuário"); setRole(data?.role || "receptionist"); })(); }, []);
  async function logout() { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }
  const initials = name.split(" ").slice(0, 2).map((item) => item[0]).join("").toUpperCase();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="ml-1 size-9 rounded-full p-0" aria-label="Abrir menu do perfil"><Avatar size="default"><AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback></Avatar></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><p className="text-sm font-medium">{name}</p><p className="mt-0.5 text-xs font-normal text-muted-foreground">{roleLabels[role] ?? role}</p></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/profile"><UserRound /> Meu perfil</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={logout}><LogOut /> Sair</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
