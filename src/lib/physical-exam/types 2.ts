export type PhysicalExamStatus = "unassessed" | "normal" | "altered";

export type PhysicalExamSystemId =
  | "general"
  | "skin"
  | "head_neck"
  | "cardiovascular"
  | "respiratory"
  | "abdomen"
  | "genitourinary"
  | "musculoskeletal"
  | "neurologic"
  | "extremities";

export interface PhysicalExamSystemDefinition {
  id: PhysicalExamSystemId;
  label: string;
  normalText: string;
}

export interface PhysicalExamSystemValue {
  status: PhysicalExamStatus;
  description: string;
}

export type PhysicalExamSystems = Record<
  PhysicalExamSystemId,
  PhysicalExamSystemValue
>;

export type VitalSignKey =
  | "pa"
  | "fc"
  | "fr"
  | "temperature"
  | "spo2"
  | "weight"
  | "height"
  | "glucose";

export type VitalSigns = Record<VitalSignKey, string>;

