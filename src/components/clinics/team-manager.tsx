"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  inviteClinicMember,
  removeClinicMember,
  resendClinicInvite,
  revokeClinicInvite,
  updateClinicMember,
} from "@/app/(dashboard)/settings/team/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clinicRoleLabels, type Clinic, type ClinicRole, type TeamRecord } from "@/lib/clinics/types";

const roles = ["clinic_admin", "doctor", "secretary", "receptionist"] as const;
const statusLabels: Record<TeamRecord["status"], string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Convite pendente",
  expired: "Convite expirado",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function TeamManager({
  clinic,
  records,
  error,
}: {
  clinic: Clinic | null;
  records: TeamRecord[];
  error: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("receptionist");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removal, setRemoval] = useState<TeamRecord | null>(null);

  async function finish(result: { error?: string; success?: string }) {
    if (result.error) toast.error(result.error);
    else toast.success(result.success);
    if (!result.error) router.refresh();
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await inviteClinicMember({ email, full_name: fullName, role });
    setSaving(false);
    await finish(result);
    if (!result.error) {
      setEmail("");
      setFullName("");
      setRole("receptionist");
    }
  }

  async function perform(id: string, action: () => Promise<{ error?: string; success?: string }>) {
    setBusyId(id);
    await finish(await action());
    setBusyId(null);
  }

  async function confirmRemoval() {
    if (!removal) return;
    const selected = removal;
    setRemoval(null);
    await perform(selected.id, () => selected.record_type === "invite"
      ? revokeClinicInvite(selected.id)
      : removeClinicMember(selected.id));
  }

  if (error) {
    return <Card className="shadow-none"><CardContent className="p-6 text-sm text-muted-foreground">{error}</CardContent></Card>;
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit shadow-none">
          <CardHeader><CardTitle>Convidar para {clinic?.name}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={invite} className="space-y-3">
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nome completo" required minLength={3} maxLength={160} />
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="E-mail" required />
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as (typeof roles)[number])}>
                {roles.map((item) => <option key={item} value={item}>{clinicRoleLabels[item]}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">O convite expira em 7 dias e só pode ser aceito pelo e-mail informado.</p>
              <Button type="submit" disabled={saving} className="w-full">
                <UserPlus /> {saving ? "Enviando..." : "Enviar convite"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0 shadow-none">
          <CardHeader><CardTitle>Usuários vinculados</CardTitle></CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    const pending = record.record_type === "invite";
                    const protectedRole = record.role === "platform_admin";
                    return (
                      <TableRow key={`${record.record_type}-${record.id}`}>
                        <TableCell>
                          <div className="min-w-44">
                            <p className="font-medium">{record.full_name || record.email || "Usuário"}</p>
                            <p className="text-xs text-muted-foreground">{record.email || "E-mail indisponível"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {pending || protectedRole ? (
                            <span className="text-sm">{clinicRoleLabels[record.role]}</span>
                          ) : (
                            <select
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                              value={record.role}
                              disabled={busyId === record.id}
                              onChange={(event) => perform(record.id, () => updateClinicMember(record.id, { role: event.target.value as ClinicRole }))}
                            >
                              {roles.map((item) => <option key={item} value={item}>{clinicRoleLabels[item]}</option>)}
                            </select>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.status === "active" ? "secondary" : record.status === "expired" ? "destructive" : "outline"}>
                            {statusLabels[record.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatDate(record.created_at)}</span>
                          {pending && record.expires_at && <p className="text-xs text-muted-foreground">Expira {formatDate(record.expires_at)}</p>}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5">
                            {pending ? (
                              <Button size="sm" variant="outline" disabled={busyId === record.id} onClick={() => perform(record.id, () => resendClinicInvite(record.id))}>
                                <RefreshCw /> Reenviar
                              </Button>
                            ) : !protectedRole ? (
                              <Button size="sm" variant="outline" disabled={busyId === record.id} onClick={() => perform(record.id, () => updateClinicMember(record.id, { status: record.status === "active" ? "inactive" : "active" }))}>
                                {record.status === "active" ? "Desativar" : "Ativar"}
                              </Button>
                            ) : null}
                            {!protectedRole && (
                              <Button size="icon-sm" variant="destructive" disabled={busyId === record.id} aria-label={pending ? "Cancelar convite" : "Remover vínculo"} onClick={() => setRemoval(record)}>
                                {pending ? <Mail /> : <Trash2 />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(removal)} onOpenChange={(open) => !open && setRemoval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{removal?.record_type === "invite" ? "Cancelar convite?" : "Remover vínculo?"}</DialogTitle>
            <DialogDescription>
              {removal?.record_type === "invite"
                ? `O convite enviado para ${removal.email} será cancelado.`
                : `${removal?.full_name || removal?.email || "Este usuário"} perderá o acesso à clínica ativa.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Voltar</Button></DialogClose>
            <Button variant="destructive" onClick={confirmRemoval}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
