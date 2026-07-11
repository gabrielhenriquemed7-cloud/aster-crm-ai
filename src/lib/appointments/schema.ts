import { z } from "zod";
import { appointmentStatuses, appointmentTypes } from "@/lib/appointments/types";

export const appointmentSchema = z.object({
  patient_id: z.string().uuid("Selecione um paciente."),
  professional_id: z.string().uuid("Selecione um profissional."),
  title: z.string().trim().min(2, "Informe o título.").max(160),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário inicial."),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário final."),
  appointment_type: z.enum(appointmentTypes),
  status: z.enum(appointmentStatuses),
  notes: z.string().trim().max(2000).optional(),
  cancellation_reason: z.string().trim().max(1000).optional(),
}).refine((value) => value.end_time > value.start_time, { message: "O horário final deve ser posterior ao inicial.", path: ["end_time"] })
  .refine((value) => value.status !== "cancelled" || Boolean(value.cancellation_reason?.trim()), { message: "Informe o motivo do cancelamento.", path: ["cancellation_reason"] });

export type AppointmentFormValues = z.infer<typeof appointmentSchema>;
