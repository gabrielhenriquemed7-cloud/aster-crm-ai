import type { ExamOrderPackage } from "@/lib/clinical-plan/types";

// Pacotes demonstrativos: sempre exigem revisão antes da inclusão.
export const examOrderPackages: ExamOrderPackage[] = [
  {
    id: "basic-checkup",
    name: "Check-up básico",
    description: "Amostra inicial para revisão profissional.",
    itemIds: ["hemogram", "fasting-glucose", "creatinine"],
  },
  {
    id: "diabetes",
    name: "Avaliação de diabetes",
    description: "Itens demonstrativos para acompanhamento metabólico.",
    itemIds: ["fasting-glucose", "hba1c", "creatinine"],
  },
  {
    id: "cardiovascular",
    name: "Perfil cardiovascular",
    description: "Itens demonstrativos para avaliação cardiovascular.",
    itemIds: ["electrocardiogram", "fasting-glucose", "lipid-profile"],
  },
  {
    id: "preoperative",
    name: "Pré-operatório",
    description: "Amostra demonstrativa para revisão conforme procedimento.",
    itemIds: ["hemogram", "fasting-glucose", "creatinine", "electrocardiogram"],
  },
  {
    id: "thyroid",
    name: "Avaliação tireoidiana",
    description: "Amostra inicial para revisão profissional.",
    itemIds: ["tsh"],
  },
  {
    id: "anemia",
    name: "Investigação de anemia",
    description: "Amostra inicial sem indicação clínica automática.",
    itemIds: ["hemogram"],
  },
  {
    id: "renal",
    name: "Avaliação renal",
    description: "Itens demonstrativos para avaliação de função renal.",
    itemIds: ["urea", "creatinine"],
  },
  {
    id: "hepatic",
    name: "Perfil hepático",
    description: "Itens demonstrativos para avaliação hepática.",
    itemIds: ["alt", "ast"],
  },
  {
    id: "lipid",
    name: "Avaliação lipídica",
    description: "Amostra inicial para revisão profissional.",
    itemIds: ["lipid-profile"],
  },
];
