import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getPendingInvite } from "@/app/(auth)/auth/accept-invite/actions";

export default async function AcceptInvitePage() {
  const result = await getPendingInvite();
  return (
    <AuthShell
      title="Aceitar convite"
      description="Configure sua senha e confirme o vínculo com a clínica."
    >
      <AcceptInviteForm invite={result.invite} initialError={result.error} />
    </AuthShell>
  );
}
