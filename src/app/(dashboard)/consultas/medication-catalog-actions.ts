"use server";

import { z } from "zod";

import type { MedicationCatalogResult } from "@/lib/medication-catalog/types";
import { createClient } from "@/lib/supabase/server";

const searchSchema = z.string().trim().min(2).max(120);

interface CatalogRow {
  source_key: string;
  presentation_id: string | null;
  product_name: string;
  active_ingredient: string | null;
  concentration: string | null;
  pharmaceutical_form: string | null;
  presentation: string | null;
  package_description: string | null;
  therapeutic_class: string | null;
  regulatory_category: string | null;
  registration_number: string | null;
  registration_holder: string | null;
  regulatory_status: string | null;
  manufacturer: string | null;
  ean: string | null;
  product_type: string | null;
  source: string | null;
  source_updated_at: string | null;
}

export async function searchMedicationCatalog(input: string): Promise<{
  medications: MedicationCatalogResult[];
  error: string | null;
}> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { medications: [], error: null };

  const supabase = await createClient();
  if (!supabase)
    return {
      medications: [],
      error: "Catálogo indisponível: Supabase não configurado.",
    };

  const auth = await supabase.auth.getUser();
  if (!auth.data.user)
    return { medications: [], error: "Sua sessão expirou." };

  const result = await supabase.rpc("search_medication_catalog", {
    search_term: parsed.data,
    result_limit: 20,
  });
  if (result.error) {
    console.error("ASTER_MEDICATION_CATALOG_SEARCH_ERROR", {
      code: result.error.code,
      message: result.error.message,
    });
    return {
      medications: [],
      error:
        result.error.code === "PGRST202"
          ? "Catálogo ainda não instalado no banco."
          : "Não foi possível pesquisar o catálogo agora.",
    };
  }

  return {
    medications: ((result.data ?? []) as CatalogRow[]).map((row) => ({
      sourceKey: row.source_key,
      presentationId: row.presentation_id,
      productName: row.product_name,
      activeIngredient: row.active_ingredient,
      concentration: row.concentration,
      pharmaceuticalForm: row.pharmaceutical_form,
      presentation: row.presentation,
      packageDescription: row.package_description,
      therapeuticClass: row.therapeutic_class,
      regulatoryCategory: row.regulatory_category,
      registrationNumber: row.registration_number,
      registrationHolder: row.registration_holder,
      regulatoryStatus: row.regulatory_status,
      manufacturer: row.manufacturer,
      ean: row.ean,
      productType: row.product_type,
      source: row.source,
      sourceUpdatedAt: row.source_updated_at,
    })),
    error: null,
  };
}
