import { getClinicContext } from "@/app/(dashboard)/settings/team/actions";
import { TeamManager } from "@/components/clinics/team-manager";

export default async function UsersSettingsPage() {
  const data = await getClinicContext();
  return <div className="space-y-4"><h2 className="text-xl font-semibold">Usuários e permissões</h2><p className="text-sm text-muted-foreground">Convites, funções e vínculos permanecem isolados na clínica ativa.</p><TeamManager {...data} /></div>;
}
