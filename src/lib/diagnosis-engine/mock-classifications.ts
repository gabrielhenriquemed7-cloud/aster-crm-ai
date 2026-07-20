import type { DiagnosticSearchResult } from "@/lib/diagnosis-engine/types";

// Amostra local e isolada para validar a experiência de busca. Não substitui
// bases oficiais, não deve ser usada para decisão clínica e não é exaustiva.
export const mockDiagnosticClassifications: DiagnosticSearchResult[] = [
  {
    code: "I10",
    description: "Hipertensão essencial (primária)",
    classificationSystem: "CID-10",
    category: "Doenças do aparelho circulatório",
    synonyms: ["hipertensão arterial", "pressão alta"],
  },
  {
    code: "E11.9",
    description: "Diabetes mellitus tipo 2 sem complicações",
    classificationSystem: "CID-10",
    category: "Doenças endócrinas, nutricionais e metabólicas",
    synonyms: ["diabetes tipo 2", "diabetes mellitus"],
  },
  {
    code: "R51",
    description: "Cefaleia",
    classificationSystem: "CID-10",
    category: "Sintomas e sinais gerais",
    synonyms: ["dor de cabeça"],
  },
  {
    code: "BA00",
    description: "Hipertensão essencial",
    classificationSystem: "CID-11",
    category: "Doenças do sistema circulatório",
    synonyms: ["hipertensão arterial"],
  },
  {
    code: "5A11",
    description: "Diabetes mellitus tipo 2",
    classificationSystem: "CID-11",
    category: "Doenças endócrinas, nutricionais ou metabólicas",
    synonyms: ["diabetes tipo 2"],
  },
  {
    code: "K86",
    description: "Hipertensão sem complicações",
    classificationSystem: "CIAP-2",
    category: "Aparelho circulatório",
    synonyms: ["hipertensão"],
  },
  {
    code: "T90",
    description: "Diabetes não insulinodependente",
    classificationSystem: "CIAP-2",
    category: "Endócrino, metabólico e nutricional",
    synonyms: ["diabetes tipo 2"],
  },
  {
    code: "N01",
    description: "Cefaleia",
    classificationSystem: "CIAP-2",
    category: "Sistema neurológico",
    synonyms: ["dor de cabeça"],
  },
];
