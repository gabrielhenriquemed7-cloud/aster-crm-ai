import type { ExamTemplate } from "@/lib/physical-exam/types";

export const medicalClinicExamTemplate: ExamTemplate = {
  id: "medical-clinic-v1",
  specialty: "medical_clinic",
  label: "Clínica Médica",
  version: "1.0.0",
  sections: [
    {
      id: "vital_signs",
      label: "Sinais Vitais",
      kind: "vital_signs",
      fields: [
        {
          id: "pa",
          label: "PA",
          kind: "vital_sign",
          unit: "mmHg",
          placeholder: "120x80",
          inputMode: "text",
        },
        {
          id: "fc",
          label: "FC",
          kind: "vital_sign",
          unit: "bpm",
          inputMode: "decimal",
        },
        {
          id: "fr",
          label: "FR",
          kind: "vital_sign",
          unit: "irpm",
          inputMode: "decimal",
        },
        {
          id: "temperature",
          label: "Temperatura",
          kind: "vital_sign",
          unit: "°C",
          inputMode: "decimal",
        },
        {
          id: "spo2",
          label: "SatO2",
          kind: "vital_sign",
          unit: "%",
          inputMode: "decimal",
        },
        {
          id: "weight",
          label: "Peso",
          kind: "vital_sign",
          unit: "kg",
          inputMode: "decimal",
        },
        {
          id: "height",
          label: "Altura",
          kind: "vital_sign",
          unit: "cm",
          inputMode: "decimal",
        },
        {
          id: "glucose",
          label: "Glicemia",
          kind: "vital_sign",
          unit: "mg/dL",
          inputMode: "decimal",
          optional: true,
        },
      ],
    },
    {
      id: "systems",
      label: "Exame por sistemas",
      kind: "systems",
      fields: [
        {
          id: "general",
          label: "Estado Geral",
          kind: "system",
          normalText:
            "Bom estado geral, lúcido, orientado em tempo e espaço, hidratado, corado, afebril.",
        },
        {
          id: "skin",
          label: "Pele e Mucosas",
          kind: "system",
          normalText: "Pele íntegra, corada, hidratada, sem lesões aparentes.",
        },
        {
          id: "head_neck",
          label: "Cabeça e Pescoço",
          kind: "system",
          normalText:
            "Normocefálico, pupilas isocóricas e fotorreagentes, sem alterações aparentes.",
        },
        {
          id: "cardiovascular",
          label: "Cardiovascular",
          kind: "system",
          normalText:
            "Ritmo cardíaco regular em dois tempos, bulhas normofonéticas, sem sopros.",
        },
        {
          id: "respiratory",
          label: "Respiratório",
          kind: "system",
          normalText:
            "Murmúrio vesicular presente bilateralmente, sem ruídos adventícios.",
        },
        {
          id: "abdomen",
          label: "Abdome",
          kind: "system",
          normalText:
            "Plano, flácido, indolor à palpação, ruídos hidroaéreos presentes.",
        },
        {
          id: "genitourinary",
          label: "Geniturinário",
          kind: "system",
          normalText: "Sem alterações aparentes ao exame geniturinário.",
        },
        {
          id: "musculoskeletal",
          label: "Musculoesquelético",
          kind: "system",
          normalText:
            "Amplitude de movimentos preservada, sem deformidades aparentes.",
        },
        {
          id: "neurologic",
          label: "Neurológico",
          kind: "system",
          normalText: "Lúcido, orientado, sem déficits neurológicos focais.",
        },
        {
          id: "extremities",
          label: "Extremidades",
          kind: "system",
          normalText:
            "Sem edema, pulsos periféricos palpáveis, perfusão preservada.",
        },
      ],
    },
    {
      id: "observations",
      label: "Observações Gerais",
      kind: "observations",
      fields: [
        {
          id: "general_observations",
          label: "Observações Gerais",
          kind: "textarea",
          placeholder:
            "Registre achados adicionais não contemplados nos sistemas.",
        },
      ],
    },
  ],
};
