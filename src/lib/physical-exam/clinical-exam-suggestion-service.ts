import type {
  ClinicalExamSuggestion,
  ClinicalExamSuggestionContext,
  ClinicalExamSuggestionService,
} from "@/lib/physical-exam/types";

/**
 * Ponto de extensão reservado para a IA Clínica.
 * Nenhuma implementação é registrada ou executada nesta etapa.
 */
export abstract class ClinicalExamSuggestionServiceContract implements ClinicalExamSuggestionService {
  abstract suggest(
    context: ClinicalExamSuggestionContext,
  ): Promise<ClinicalExamSuggestion[]>;
}
