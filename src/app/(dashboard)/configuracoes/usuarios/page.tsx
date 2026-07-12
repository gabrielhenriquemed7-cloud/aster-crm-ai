import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function UsersSettingsPage() { return <div className="space-y-4"><h2 className="text-xl font-semibold">Usuários e permissões</h2><p className="text-sm text-muted-foreground">Convites, funções e vínculos permanecem isolados na clínica ativa.</p><Button render={<Link href="/settings/team" />}>Gerenciar equipe</Button></div>; }
