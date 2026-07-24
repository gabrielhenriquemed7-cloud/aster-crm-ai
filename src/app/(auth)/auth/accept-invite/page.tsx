import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getPendingInvite } from "@/app/(auth)/auth/accept-invite/actions";

export default async function AcceptInvitePage() {
  const result = await getPendingInvite();
  return (
    <AuthShell
      title="Bem-vindo ao ASTER CRM AI"
      description="Você foi convidado para integrar uma clínica. Crie sua senha para concluir seu cadastro."
    >
      <AcceptInviteForm
        invite={result.invite}
        initialError={result.error}
        requiresPassword={result.requiresPassword}
      />
    </AuthShell>
  );
}
