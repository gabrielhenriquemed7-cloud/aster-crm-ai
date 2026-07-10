import { getClinicContext } from "@/app/(dashboard)/settings/team/actions";
import { TeamManager } from "@/components/clinics/team-manager";
export default async function TeamPage() { const data = await getClinicContext(); return <section><p className="text-sm text-muted-foreground">Configurações da clínica</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Equipe</h1><p className="mt-2 text-sm text-muted-foreground">Gerencie usuários e permissões da clínica ativa.</p><div className="mt-7"><TeamManager {...data} /></div></section>; }
