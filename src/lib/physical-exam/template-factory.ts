import { medicalClinicExamTemplate } from "@/lib/physical-exam/templates/medical-clinic";
import type { ExamSpecialty, ExamTemplate } from "@/lib/physical-exam/types";

const templates = new Map<ExamSpecialty, ExamTemplate>([
  [medicalClinicExamTemplate.specialty, medicalClinicExamTemplate],
]);

export const ExamTemplateFactory = {
  get(specialty: ExamSpecialty): ExamTemplate {
    const template = templates.get(specialty);
    if (!template)
      throw new Error(`Template de exame não configurado: ${specialty}`);
    return template;
  },
  has: (specialty: ExamSpecialty) => templates.has(specialty),
  list: () => [...templates.values()],
  register: (template: ExamTemplate) =>
    templates.set(template.specialty, template),
};
