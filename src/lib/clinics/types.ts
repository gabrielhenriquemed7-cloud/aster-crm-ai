export type ClinicRole = "platform_admin" | "clinic_admin" | "doctor" | "secretary" | "receptionist";
export interface Clinic { id: string; name: string; legal_name: string | null; status: string; plan: string; }
export interface ClinicMember { id: string; clinic_id: string; user_id: string; role: ClinicRole; status: "active" | "inactive" | "invited"; created_by: string | null; created_at: string; profile?: { full_name: string | null; email: string | null; phone: string | null } | null; }
export const clinicRoleLabels: Record<ClinicRole, string> = { platform_admin: "Administrador da plataforma", clinic_admin: "Administrador da clínica", doctor: "Médico", secretary: "Secretária", receptionist: "Recepcionista" };
