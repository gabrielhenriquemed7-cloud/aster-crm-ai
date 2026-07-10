import { Plus, UsersRound } from "lucide-react";
import Link from "next/link";

import { listPatients } from "@/app/(dashboard)/patients/actions";
import { PatientActions } from "@/components/patients/patient-actions";
import { PatientFilters } from "@/components/patients/patient-filters";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCpf } from "@/lib/patients/format";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; gender?: string; insurance?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { patients, total, pageSize } = await listPatients({ page, search: params.q, gender: params.gender, insurance: params.insurance });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.gender) query.set("gender", params.gender);
  if (params.insurance) query.set("insurance", params.insurance);
  const pageHref = (next: number) => { const nextQuery = new URLSearchParams(query); nextQuery.set("page", String(next)); return `/patients?${nextQuery.toString()}`; };

  return <section>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm text-muted-foreground">Cadastros da clínica</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Pacientes</h1></div>
      <Button render={<Link href="/patients/new" />} className="cursor-pointer" aria-label="Novo paciente"><Plus /> Novo paciente</Button>
    </div>
    <Card className="mt-7 gap-0 py-0 shadow-none">
      <CardContent className="p-5"><PatientFilters /></CardContent>
      <div className="border-t"><Table><TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>CPF</TableHead><TableHead className="hidden md:table-cell">Telefone</TableHead><TableHead className="hidden lg:table-cell">Convênio</TableHead><TableHead><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader><TableBody>
        {patients.map((patient) => <TableRow key={patient.id}><TableCell><Link href={`/patients/${patient.id}`} className="flex items-center gap-3"><Avatar size="default"><AvatarImage src={patient.photo_url ?? undefined} alt="" /><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{patient.full_name.split(" ").slice(0, 2).map((name) => name[0]).join("")}</AvatarFallback></Avatar><span><span className="block font-medium">{patient.full_name}</span><span className="text-xs text-muted-foreground md:hidden">{patient.phone || "Sem telefone"}</span></span></Link></TableCell><TableCell className="text-muted-foreground">{formatCpf(patient.cpf)}</TableCell><TableCell className="hidden text-muted-foreground md:table-cell">{patient.phone || "—"}</TableCell><TableCell className="hidden text-muted-foreground lg:table-cell">{patient.insurance || "Particular"}</TableCell><TableCell className="text-right"><PatientActions id={patient.id} name={patient.full_name} /></TableCell></TableRow>)}
        {!patients.length && <TableRow><TableCell colSpan={5} className="py-16 text-center"><UsersRound className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Nenhum paciente encontrado</p><p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou cadastre o primeiro paciente.</p></TableCell></TableRow>}
      </TableBody></Table></div>
      {total > 0 && <div className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground"><p>{total} paciente{total !== 1 && "s"}</p><div className="flex gap-2">{page > 1 ? <Button size="sm" variant="outline" render={<Link href={pageHref(page - 1)} />}>Anterior</Button> : <Button size="sm" variant="outline" disabled>Anterior</Button>}<span className="px-2 py-1">{page} de {totalPages}</span>{page < totalPages ? <Button size="sm" variant="outline" render={<Link href={pageHref(page + 1)} />}>Próxima</Button> : <Button size="sm" variant="outline" disabled>Próxima</Button>}</div></div>}
    </Card>
  </section>;
}
