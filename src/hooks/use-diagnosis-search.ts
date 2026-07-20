"use client";

import { useEffect, useState } from "react";

import { localDiagnosisSearchService } from "@/lib/diagnosis-engine/services";
import type {
  DiagnosticClassificationSystem,
  DiagnosticSearchResult,
} from "@/lib/diagnosis-engine/types";

export function useDiagnosisSearch(
  query: string,
  systems: DiagnosticClassificationSystem[],
) {
  const [results, setResults] = useState<DiagnosticSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      localDiagnosisSearchService
        .search(query, { systems, limit: 20 })
        .then(setResults)
        .catch(() => {
          setResults([]);
          setError("Não foi possível pesquisar diagnósticos.");
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, systems]);

  return query.trim()
    ? { results, loading, error }
    : { results: [], loading: false, error: "" };
}
