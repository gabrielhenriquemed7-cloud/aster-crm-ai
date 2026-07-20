import { mockExamCatalog } from "@/lib/clinical-plan/mock-exam-catalog";
import type {
  ExamCatalogService,
  Referral,
  ReferralService,
} from "@/lib/clinical-plan/types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export class LocalExamCatalogService implements ExamCatalogService {
  async search(query: string) {
    const term = normalize(query.trim());
    if (!term) return [];
    return mockExamCatalog.filter((item) =>
      [item.name, item.category, item.abbreviation ?? "", ...item.synonyms]
        .map(normalize)
        .some((value) => value.includes(term)),
    );
  }
}

export class LocalReferralService implements ReferralService {
  async validate(referral: Referral) {
    return referral.destination.trim() ? [] : ["Informe o destino."];
  }
}

export const localExamCatalogService = new LocalExamCatalogService();
