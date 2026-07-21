export const clinicalDocumentTypes = ["prescription","special_prescription","medical_certificate","attendance_declaration","exam_request","referral","patient_guidance","medical_report","clinical_summary","printable_evolution"] as const;
export type ClinicalDocumentType = typeof clinicalDocumentTypes[number];
export const clinicalDocumentLabels: Record<ClinicalDocumentType,string> = { prescription:"Receita simples", special_prescription:"Receita de controle especial", medical_certificate:"Atestado médico", attendance_declaration:"Declaração de comparecimento", exam_request:"Solicitação de exames", referral:"Encaminhamento", patient_guidance:"Orientações ao paciente", medical_report:"Relatório médico", clinical_summary:"Sumário clínico", printable_evolution:"Evolução para impressão" };
export type ClinicalDocumentStatus = "draft"|"in_review"|"finalized"|"signed"|"archived"|"cancelled";
export const clinicalDocumentStatusLabels: Record<ClinicalDocumentStatus,string> = {
  draft:"Rascunho",
  in_review:"Em revisão",
  finalized:"Finalizado",
  signed:"Assinado",
  archived:"Arquivado",
  cancelled:"Cancelado",
};
export interface PrescriptionItem { id?:string; medication_name:string; concentration:string; pharmaceutical_form:string; route:string; dosage:string; frequency:string; duration:string; quantity:string; instructions:string; controlled:boolean; sort_order:number; }
export interface OfficialMedicationPresentation { name:string; formAndPackage:string; posology:string; quantity:string; orientations:string[]; }
export interface OfficialClinicalDocumentSnapshot {
  schema_version:number;
  origin:"native_official"|"legacy_current_known";
  is_legacy:boolean;
  title:string;
  document_type:ClinicalDocumentType;
  public_number:number;
  document_version:number;
  issued_at:string|null;
  timezone:string;
  identifiers:Record<string,string|null>;
  patient?:{id?:string;name?:string|null;legal_name?:string|null;birth_date?:string|null;cpf?:string|null};
  professional?:{id?:string;name?:string|null;legal_name?:string|null;profession?:string|null;council?:string|null;council_number?:string|null;council_state?:string|null;specialty?:string|null;rqe?:string|null;registration_text?:string|null};
  clinic?:{id?:string;name?:string|null;legal_name?:string|null;cnpj?:string|null;email?:string|null;phone?:string|null;whatsapp?:string|null;address?:string|null;address_number?:string|null;address_complement?:string|null;neighborhood?:string|null;city?:string|null;state?:string|null;zip_code?:string|null;address_text?:string|null;logo_url?:string|null};
  document_settings?:{header_text?:string|null;footer_text?:string|null;signature_text?:string|null;show_logo?:boolean;show_cnpj?:boolean;show_address?:boolean;show_phone?:boolean;show_email?:boolean;show_council?:boolean;show_specialty?:boolean;show_rqe?:boolean;physical_signature_space?:boolean};
  content?:Record<string,unknown>;
  prescription?:{payload?:Record<string,unknown>;presentation?:{medications?:OfficialMedicationPresentation[];orientations?:string[];observations?:string[]};items?:PrescriptionItem[]};
  legacy?:{source:string;confidence:"high"|"medium"|"low";warning:string};
}
export interface ClinicalDocument {
  id:string; public_number:number; clinic_id:string; patient_id:string; appointment_id:string;
  medical_record_id:string|null; professional_id:string; document_type:ClinicalDocumentType;
  title:string; content:Record<string,unknown>; status:ClinicalDocumentStatus; issued_at:string|null;
  printed_at:string|null; cancelled_at:string|null; cancellation_reason:string|null;
  created_at:string; updated_at:string; snapshot_json:OfficialClinicalDocumentSnapshot|null;
  rendered_html:string|null; pdf_storage_path:string|null; pdf_status:"pending"|"available"|"failed"|"not_applicable";
  content_hash:string|null; hash_algorithm:string|null; hash_generated_at:string|null;
  template_id:string|null; template_version:number|null; renderer_version:number|null;
  generated_by_ai:boolean; reviewed_by_physician:boolean; reviewed_at:string|null; reviewed_by:string|null; signed_at:string|null; signature_provider:string|null;
  schema_version:number|null; document_version:number; immutable_at:string|null;
  supersedes_document_id:string|null; superseded_by_document_id:string|null;
  legacy_migrated_at:string|null; legacy_source:string|null; legacy_confidence:"high"|"medium"|"low"|null;
  patient?:{full_name:string;social_name:string|null;cpf:string|null;birth_date:string|null}|null;
  professional?:{full_name:string|null;professional_name:string|null;profession:string|null;council:string|null;council_number:string|null;council_state:string|null;specialty:string|null;rqe:string|null;signature_url:string|null;stamp_url?:string|null}|null;
  clinic?:{name:string;legal_name:string|null;cnpj:string|null;email:string|null;phone:string|null;whatsapp:string|null;address:string|null;address_number:string|null;address_complement:string|null;neighborhood:string|null;city:string|null;state:string|null;zip_code:string|null;logo_path?:string|null;logo_url:string|null}|null;
  document_settings?:OfficialClinicalDocumentSnapshot["document_settings"]|null;
  items?:PrescriptionItem[];
}
export interface ClinicalDocumentTemplate { id:string; clinic_id:string|null; document_type:ClinicalDocumentType; name:string; title:string; content:Record<string,string|boolean>; version:number; favorite:boolean; sort_order:number; }
