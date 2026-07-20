import {
  Activity,
  ArrowLeft,
  CalendarDays,
  FileText,
  HeartPulse,
  MapPin,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPatient } from "@/app/(dashboard)/patients/actions";
import { PatientActions } from "@/components/patients/patient-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCpf, formatDate } from "@/lib/patients/format";

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">
        {value || "Não informado"}
      </p>
    </div>
  );
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();
  const initials = patient.full_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const address = [
    patient.address,
    patient.address_number,
    patient.address_complement,
    patient.neighborhood,
    patient.city,
    patient.state,
    patient.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/patients" />}
            className="mb-2 -ml-2"
          >
            <ArrowLeft /> Pacientes
          </Button>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={patient.photo_url ?? undefined} alt="" />
              <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                {patient.social_name || patient.full_name}
              </h1>
              {patient.social_name && (
                <p className="text-sm text-muted-foreground">
                  Nome civil: {patient.full_name}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                CPF {formatCpf(patient.cpf)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link href={`/patients/${id}/prontuario`} />}
          >
            <FileText /> Prontuário
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/patients/${id}/longitudinal`} />}
          >
            <Activity /> Visão longitudinal
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/patients/${id}/edit`} />}
          >
            <Pencil /> Editar
          </Button>
          <PatientActions id={id} name={patient.full_name} />
        </div>
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" /> Identificação
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Nascimento" value={formatDate(patient.birth_date)} />
            <Detail label="Sexo / gênero" value={patient.gender} />
            <Detail label="Raça / cor" value={patient.race_ethnicity} />
            <Detail label="RG" value={patient.rg} />
            <Detail label="CNS" value={patient.cns} />
            <Detail label="Estado civil" value={patient.marital_status} />
            <Detail label="Nacionalidade" value={patient.nationality} />
            <Detail label="Naturalidade" value={patient.birthplace} />
            <Detail label="Profissão" value={patient.occupation} />
            <Detail label="Nome da mãe" value={patient.mother_name} />
            <Detail label="Nome do pai" value={patient.father_name} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" /> Contato e endereço
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Detail label="Telefone" value={patient.phone} />
            <Detail label="WhatsApp" value={patient.whatsapp} />
            <Detail label="E-mail" value={patient.email} />
            <Detail label="Endereço" value={address} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" /> Convênio e
              emergência
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Detail label="Convênio" value={patient.insurance} />
            <Detail label="Carteirinha" value={patient.insurance_card} />
            <Detail
              label="Contato de emergência"
              value={patient.emergency_contact_name}
            />
            <Detail
              label="Telefone de emergência"
              value={patient.emergency_contact_phone}
            />
            <Detail
              label="Relação"
              value={patient.emergency_contact_relationship}
            />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="size-4 text-primary" /> Dados clínicos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Detail label="Tipo sanguíneo" value={patient.blood_type} />
            <Detail label="Alergias" value={patient.allergies} />
            <Detail label="Comorbidades" value={patient.comorbidities} />
            <Detail
              label="Medicamentos contínuos"
              value={patient.continuous_medications}
            />
            <Detail
              label="Histórico médico / cirúrgico"
              value={patient.medical_history}
            />
            <Detail label="Observações" value={patient.notes} />
          </CardContent>
        </Card>
        <Card className="shadow-none xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" /> Registro
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Detail
              label="Cadastrado em"
              value={new Date(patient.created_at).toLocaleString("pt-BR")}
            />
            <Detail
              label="Atualizado em"
              value={new Date(patient.updated_at).toLocaleString("pt-BR")}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
