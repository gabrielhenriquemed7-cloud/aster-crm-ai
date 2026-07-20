import Image from "next/image";

import { MedicalRecordCenterActions } from "@/components/medical-records/medical-record-center-actions";
import { MedicalRecordGovernance } from "@/components/medical-records/medical-record-governance";
import { MedicalRecordTimeline } from "@/components/medical-records/medical-record-timeline";
import { Badge } from "@/components/ui/badge";
import { scoreDefinitions } from "@/lib/clinical-scores/engine";
import type { MedicalRecordCenterData } from "@/lib/medical-record-center/types";

function age(birthDate: string | null) {
  if (!birthDate) return "Não informada";
  const birth = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  let value = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  )
    value -= 1;
  return `${value} anos`;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">
        {value?.trim() || "Não informado"}
      </dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid overflow-hidden rounded-xl border bg-card shadow-sm print:rounded-none print:shadow-none">
      <h2 className="border-b bg-muted/30 px-4 py-3 text-sm font-semibold uppercase tracking-wide">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function MedicalRecordCenter({
  data,
  canEdit,
}: {
  data: MedicalRecordCenterData;
  canEdit: boolean;
}) {
  const { appointment, record, clinic, professional } = data;
  const patient = appointment.patient;
  const date = new Date(`${appointment.appointment_date}T12:00:00`);
  return (
    <article className="mx-auto max-w-6xl space-y-4">
      <header className="sticky top-0 z-20 -mx-1 space-y-3 border-b bg-background/95 px-1 py-3 backdrop-blur print:static print:border-0 print:bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Central de Prontuário Clínico
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Prontuário do Atendimento
            </h1>
          </div>
          <MedicalRecordCenterActions
            appointmentId={appointment.id}
            canEdit={canEdit}
          />
        </div>
      </header>

      <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          {clinic.logoUrl ? (
            <Image
              src={clinic.logoUrl}
              width={48}
              height={48}
              alt={`Logo ${clinic.name}`}
              className="size-12 rounded-lg object-contain"
              unoptimized
            />
          ) : (
            <span className="grid size-12 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              ASTER
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{clinic.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {clinic.legalName || "Identidade institucional"}
            </p>
          </div>
        </div>
        <Badge variant="outline">
          {record?.status === "finalized" ? "Finalizado" : "Rascunho"}
        </Badge>
      </div>

      <Section title="Identificação">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Paciente"
            value={patient?.social_name || patient?.full_name}
          />
          <Field label="Idade" value={age(patient?.birth_date ?? null)} />
          <Field label="Sexo" value={patient?.gender} />
          <Field label="CPF" value={patient?.cpf} />
          <Field label="Telefone" value={patient?.phone} />
          <Field label="Convênio" value={patient?.insurance} />
          <Field label="Número do prontuário" value={record?.id} />
          <Field label="Profissional" value={professional.name} />
          <Field
            label="CRM / Conselho"
            value={[
              professional.council,
              professional.councilNumber,
              professional.councilState,
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <Field label="Especialidade" value={professional.specialty} />
          <Field label="Data" value={date.toLocaleDateString("pt-BR")} />
          <Field label="Hora" value={appointment.start_time.slice(0, 5)} />
        </dl>
      </Section>

      <Section title="Anamnese">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Queixa Principal" value={record?.chief_complaint} />
          <Field label="História da Doença Atual" value={record?.hpi} />
          <Field label="Antecedentes" value={record?.pmh} />
          <Field label="Medicações" value={record?.medications} />
          <Field label="Alergias" value={record?.allergies} />
          <Field label="Hábitos" value={record?.social_history} />
          <Field
            label="Revisão de Sistemas"
            value="Não estruturada separadamente no modelo atual."
          />
        </dl>
      </Section>

      <Section title="Scores Clínicos">
        {data.scores.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Nome</th>
                  <th className="p-2">Resultado</th>
                  <th className="p-2">Classificação</th>
                  <th className="p-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {data.scores.map((score) => {
                  const definition = scoreDefinitions.find(
                    (item) => item.id === score.score,
                  );
                  return (
                    <tr key={score.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">
                        {definition?.name || score.score}
                      </td>
                      <td className="p-2">{score.result}</td>
                      <td className="p-2">
                        {definition?.interpret(score.result) ||
                          "Resultado registrado"}
                      </td>
                      <td className="p-2">
                        {new Date(score.calculated_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum score registrado neste atendimento.
          </p>
        )}
      </Section>

      <Section title="Exame Físico">
        <dl className="space-y-5">
          <Field label="Sinais Vitais" value={record?.vital_signs} />
          <Field
            label="Estado Geral, Sistemas e Observações"
            value={record?.physical_exam}
          />
        </dl>
      </Section>

      <Section title="Hipóteses">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Hipóteses diagnósticas" value={record?.assessment} />
          {!record?.assessment?.includes("[PRINCIPAL]") && (
            <Field label="CID" value={record?.cid10} />
          )}
        </dl>
      </Section>

      <Section title="Conduta">
        <dl className="grid gap-5 md:grid-cols-2">
          <Field label="Plano e Conduta" value={record?.plan} />
          <Field label="Solicitação de Exames" value={record?.exam_requests} />
          <Field label="Retorno" value={record?.return_guidance} />
          <Field label="Orientações" value={record?.guidance} />
          <Field label="Atestados" value={record?.certificate} />
        </dl>
      </Section>

      <Section title="Prescrição Médica">
        <Field label="Prescrição vinculada" value={record?.prescription} />
      </Section>

      <Section title="Anexos">
        <p className="text-sm text-muted-foreground">
          Estrutura preparada para exames, PDFs, imagens, laudos e documentos.
          Upload não habilitado nesta etapa.
        </p>
      </Section>

      <MedicalRecordTimeline items={[]} />
      <MedicalRecordGovernance
        access={data.access}
        audit={data.audit}
        signature={data.signature}
      />

      <footer className="grid gap-3 border-t pt-5 text-sm sm:grid-cols-2">
        <Field label="Profissional" value={professional.name} />
        <Field
          label="CRM / Especialidade"
          value={[
            professional.council,
            professional.councilNumber,
            professional.councilState,
            professional.specialty,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Field label="Data" value={date.toLocaleDateString("pt-BR")} />
        <Field label="Hora" value={appointment.start_time.slice(0, 5)} />
      </footer>
    </article>
  );
}
