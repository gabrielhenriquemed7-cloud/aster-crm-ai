export interface MedicationCatalogResult {
  sourceKey: string;
  presentationId: string | null;
  productName: string;
  activeIngredient: string | null;
  concentration: string | null;
  pharmaceuticalForm: string | null;
  presentation: string | null;
  packageDescription: string | null;
  therapeuticClass: string | null;
  regulatoryCategory: string | null;
  registrationNumber: string | null;
  registrationHolder: string | null;
  regulatoryStatus: string | null;
  manufacturer: string | null;
  ean: string | null;
  productType: string | null;
  source: string | null;
  sourceUpdatedAt: string | null;
}
