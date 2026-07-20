"use client";

import { useEffect, useState } from "react";

import { localExamCatalogService } from "@/lib/clinical-plan/services";
import type { ExamCatalogItem } from "@/lib/clinical-plan/types";

export function useExamCatalogSearch(query: string) {
  const [results, setResults] = useState<ExamCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      localExamCatalogService
        .search(query)
        .then(setResults)
        .catch(() => {
          setResults([]);
          setError("Não foi possível pesquisar o catálogo local.");
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return query.trim()
    ? { results, loading, error }
    : { results: [], loading: false, error: "" };
}
