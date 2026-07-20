"use client";

import { useEffect, useState } from "react";

import { searchMedicationCatalog } from "@/app/(dashboard)/consultas/medication-catalog-actions";
import type { MedicationCatalogResult } from "@/lib/medication-catalog/types";

export function useMedicationCatalogSearch(query: string) {
  const [results, setResults] = useState<MedicationCatalogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const response = await searchMedicationCatalog(term);
      if (!active) return;
      setResults(response.medications);
      setError(response.error);
      setLoading(false);
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return query.trim().length < 2
    ? { results: [], loading: false, error: null }
    : { results, loading, error };
}
