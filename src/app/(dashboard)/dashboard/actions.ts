"use server";

import type { Appointment, AppointmentStatus } from "@/lib/appointments/types";
import { createClient } from "@/lib/supabase/server";

export type DashboardRole = "doctor" | "receptionist" | "clinic_admin" | "admin" | "demo" | string;
export interface DashboardDocument { id:string; title:string; document_type:string; status:string; updated_at:string; patient:{full_name:string}|null }
export interface DashboardContinuity { id:string; title:string; item_type:string; status:string; priority:string; due_at:string|null; patient_id:string; appointment_id:string; patient:{full_name:string}|null }
export interface DashboardData {
  user: { name:string; clinicName:string; role:DashboardRole };
  today: Record<AppointmentStatus, number> & { total:number; late:number };
  upcoming: Appointment[];
  inProgress: Appointment[];
  pending: { unfinishedRecords:number; awaitingReturn:number; unconfirmed:number; documents:number; overdueContinuity:number; referrals:number; exams:number; results:number; unassigned:number };
  indicators: { newPatients:number; monthlyAppointments:number; attendanceRate:number; scheduledReturns:number; completedContinuity:number; finalizedDocuments:number };
  documents: DashboardDocument[];
  continuity: DashboardContinuity[];
  sectionErrors: Partial<Record<"agenda"|"records"|"documents"|"continuity"|"indicators",string>>;
  error: string|null;
}

const statuses: AppointmentStatus[] = ["scheduled","confirmed","waiting","in_progress","completed","cancelled","no_show"];
const emptyToday = () => Object.assign({ total:0, late:0 }, Object.fromEntries(statuses.map((status)=>[status,0]))) as DashboardData["today"];
const empty: DashboardData = { user:{name:"Usuário",clinicName:"Clínica ativa",role:"demo"}, today:emptyToday(), upcoming:[], inProgress:[], pending:{unfinishedRecords:0,awaitingReturn:0,unconfirmed:0,documents:0,overdueContinuity:0,referrals:0,exams:0,results:0,unassigned:0}, indicators:{newPatients:0,monthlyAppointments:0,attendanceRate:0,scheduledReturns:0,completedContinuity:0,finalizedDocuments:0}, documents:[], continuity:[], sectionErrors:{}, error:null };

function clinicToday() { return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bahia"}).format(new Date()); }
function related<T>(value:T|T[]|null):T|null { return Array.isArray(value) ? value[0] ?? null : value; }

export async function getDashboardData():Promise<DashboardData> {
  const supabase = await createClient(); if (!supabase) return {...empty,error:"Serviço indisponível."};
  const {data:auth}=await supabase.auth.getUser(); if(!auth.user)return {...empty,error:"Sua sessão expirou. Entre novamente."};
  const {data:profile}=await supabase.from("profiles").select("active_clinic_id,full_name").eq("id",auth.user.id).maybeSingle();
  if(!profile?.active_clinic_id)return {...empty,error:"Selecione uma clínica ativa."};
  const clinicId=profile.active_clinic_id; const today=clinicToday(); const monthStart=`${today.slice(0,7)}-01`; const nextMonth=new Date(`${monthStart}T12:00:00`); nextMonth.setMonth(nextMonth.getMonth()+1); const monthEnd=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bahia"}).format(nextMonth);
  const [{data:member},{data:clinic}]=await Promise.all([supabase.from("clinic_members").select("role").eq("clinic_id",clinicId).eq("user_id",auth.user.id).eq("status","active").maybeSingle(),supabase.from("clinics").select("name").eq("id",clinicId).maybeSingle()]);
  const role=member?.role ?? "demo"; const isDoctor=role==="doctor";
  let todayQuery=supabase.from("appointments").select("*,patient:patients(full_name,phone)").eq("clinic_id",clinicId).eq("appointment_date",today).order("start_time");
  let monthQuery=supabase.from("appointments").select("id,patient_id,appointment_date,appointment_type,status").eq("clinic_id",clinicId).gte("appointment_date",monthStart).lt("appointment_date",monthEnd);
  if(isDoctor){todayQuery=todayQuery.eq("professional_id",auth.user.id);monthQuery=monthQuery.eq("professional_id",auth.user.id);}
  const [todayResult,monthResult,patientsResult,recordsResult,documentsResult,continuityResult]=await Promise.all([
    todayQuery,monthQuery,
    supabase.from("patients").select("id",{count:"exact",head:true}).eq("clinic_id",clinicId).is("deleted_at",null).gte("created_at",`${monthStart}T00:00:00`).lt("created_at",`${monthEnd}T00:00:00`),
    supabase.from("medical_records").select("appointment_id,patient_id,status").eq("clinic_id",clinicId).is("deleted_at",null),
    supabase.from("clinical_documents").select("id,title,document_type,status,updated_at,patient:patients(full_name)").eq("clinic_id",clinicId).is("deleted_at",null).order("updated_at",{ascending:false}).limit(8),
    supabase.from("care_continuity_items").select("id,title,item_type,status,priority,due_at,patient_id,appointment_id,assigned_to,patient:patients(full_name)").eq("clinic_id",clinicId).order("due_at",{ascending:true,nullsFirst:false}).limit(100),
  ]);
  const sectionErrors:DashboardData["sectionErrors"]={}; if(todayResult.error)sectionErrors.agenda="Não foi possível carregar a agenda."; if(monthResult.error||patientsResult.error)sectionErrors.indicators="Alguns indicadores estão temporariamente indisponíveis."; if(recordsResult.error)sectionErrors.records="Não foi possível carregar os prontuários."; if(documentsResult.error)sectionErrors.documents="Não foi possível carregar os documentos."; if(continuityResult.error)sectionErrors.continuity="Não foi possível carregar a continuidade.";
  const appointments=(todayResult.data??[]) as Appointment[]; const professionalIds=[...new Set(appointments.map((item)=>item.professional_id))]; const {data:professionals}=professionalIds.length?await supabase.from("profiles").select("id,full_name").in("id",professionalIds):{data:[]}; const names=new Map((professionals??[]).map((item)=>[item.id,item.full_name])); const withNames=appointments.map((item)=>({...item,professional:{full_name:names.get(item.professional_id)??"Profissional"}}));
  const todayCounts=emptyToday(); const nowMinutes=new Date().getHours()*60+new Date().getMinutes(); for(const item of appointments){todayCounts.total++;todayCounts[item.status]++;const [hour,minute]=item.start_time.split(":").map(Number);if(["scheduled","confirmed","waiting"].includes(item.status)&&hour*60+minute<nowMinutes)todayCounts.late++;}
  const records=recordsResult.data??[]; const recordIds=new Set(records.map((item)=>item.appointment_id)); const continuity=(continuityResult.data??[]).map((item)=>({...item,patient:related(item.patient)})) as DashboardContinuity[]; const openContinuity=continuity.filter((item)=>!["completed","cancelled","dismissed"].includes(item.status)); const overdue=openContinuity.filter((item)=>item.due_at&&new Date(item.due_at)<new Date()); const month=monthResult.data??[]; const attended=month.filter((item)=>item.status==="completed").length; const attendanceBase=month.filter((item)=>["completed","no_show"].includes(item.status)).length; const documents=(documentsResult.data??[]).map((item)=>({...item,patient:related(item.patient)})) as DashboardDocument[];
  return { user:{name:profile.full_name??"Usuário",clinicName:clinic?.name??"Clínica ativa",role}, today:todayCounts, upcoming:withNames.filter((item)=>!["completed","cancelled","no_show"].includes(item.status)).slice(0,6), inProgress:withNames.filter((item)=>item.status==="in_progress"), pending:{unfinishedRecords:appointments.filter((item)=>item.status==="completed"&&!recordIds.has(item.id)).length,awaitingReturn:openContinuity.filter((item)=>item.item_type==="follow_up").length,unconfirmed:todayCounts.scheduled,documents:documents.filter((item)=>["draft","in_review"].includes(item.status)).length,overdueContinuity:overdue.length,referrals:openContinuity.filter((item)=>item.item_type==="referral").length,exams:openContinuity.filter((item)=>item.item_type==="exam").length,results:openContinuity.filter((item)=>item.item_type==="exam_result"&&item.status!=="reviewed").length,unassigned:(continuityResult.data??[]).filter((item)=>!item.assigned_to&&!["completed","cancelled","dismissed"].includes(item.status)).length}, indicators:{newPatients:patientsResult.count??0,monthlyAppointments:month.length,attendanceRate:attendanceBase?Math.round(attended/attendanceBase*100):0,scheduledReturns:month.filter((item)=>item.appointment_type==="return"&&!['cancelled','no_show'].includes(item.status)).length,completedContinuity:continuity.filter((item)=>item.status==="completed").length,finalizedDocuments:documents.filter((item)=>["finalized","signed","archived"].includes(item.status)&&item.updated_at.startsWith(today)).length},documents:documents.slice(0,5),continuity:openContinuity.slice(0,5),sectionErrors,error:null };
}
