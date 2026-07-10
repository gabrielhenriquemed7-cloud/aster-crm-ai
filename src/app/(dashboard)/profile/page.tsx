import { ProfileForm } from "@/components/auth/profile-form";

export default function ProfilePage() { return <section><p className="text-sm text-muted-foreground">Conta e preferências</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Meu perfil</h1><p className="mt-2 text-sm text-muted-foreground">Mantenha seus dados atualizados. O perfil de acesso é definido pela clínica.</p><div className="mt-7"><ProfileForm /></div></section>; }
