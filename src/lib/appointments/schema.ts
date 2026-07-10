import { z } from "zod";
import { appointmentStatuses } from "@/lib/appointments/types";

export const appointmentSchema = z.object({
  patient_id: z.string().uuid("Selecione um paciente."),
  doctor_id: z.string().uuid("Selecione um médico."),
  starts_at: z.string().min(1, "Informe a data e hora."),
  ends_at: z.string().min(1, "Informe o horário final."),
  status: z.enum(appointmentStatuses),
  appointment_type: z.string().trim().min(2, "Informe o tipo da consulta.").max(120),
  notes: z.string().trim().max(2000).optional(),
  cancellation_reason: z.string().trim().max(1000).optional(),
}).refine((value) => new Date(value.ends_at) > new Date(value.starts_at), { message: "O horário final deve ser posterior ao inicial.", path: ["ends_at"] });

export type AppointmentFormValues = z.infer<typeof appointmentSchema>;
