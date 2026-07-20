import { mockDiagnosticClassifications } from "@/lib/diagnosis-engine/mock-classifications";
import type {
  DiagnosisSearchFilters,
  DiagnosisSearchService,
  DiagnosticClassificationProvider,
  DiagnosticClassificationSystem,
  DiagnosticSearchResult,
} from "@/lib/diagnosis-engine/types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export class LocalClassificationProvider implements DiagnosticClassificationProvider {
  constructor(public readonly system: DiagnosticClassificationSystem) {}

  async search(query: string, filters: DiagnosisSearchFilters) {
    const term = normalize(query.trim());
    if (!term || !filters.systems.includes(this.system)) return [];
    return mockDiagnosticClassifications
      .filter((item) => item.classificationSystem === this.system)
      .filter((item) =>
        [item.code, item.description, ...(item.synonyms ?? [])]
          .map(normalize)
          .some((value) => value.includes(term)),
      )
      .slice(0, filters.limit ?? 20);
  }
}

export class LocalDiagnosisSearchService implements DiagnosisSearchService {
  constructor(
    private readonly providers: DiagnosticClassificationProvider[] = [
      new LocalClassificationProvider("CID-10"),
      new LocalClassificationProvider("CID-11"),
      new LocalClassificationProvider("CIAP-2"),
    ],
  ) {}

  async search(query: string, filters: DiagnosisSearchFilters) {
    const results = await Promise.all(
      this.providers.map((provider) => provider.search(query, filters)),
    );
    return results
      .flat()
      .slice(0, filters.limit ?? 20) as DiagnosticSearchResult[];
  }
}

export const localDiagnosisSearchService = new LocalDiagnosisSearchService();
