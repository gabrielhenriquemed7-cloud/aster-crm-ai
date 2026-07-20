import type {
  ClinicalConsistencyContext,
  ClinicalConsistencyIssue,
  ClinicalConsistencyService,
} from "@/lib/physical-exam/types";

/**
 * Ponto de extensão reservado para o painel de consistência clínica.
 * Nenhuma análise automática é realizada nesta etapa.
 */
export abstract class ClinicalConsistencyServiceContract implements ClinicalConsistencyService {
  abstract analyze(
    context: ClinicalConsistencyContext,
  ): Promise<ClinicalConsistencyIssue[]>;
}
