import { AuthShell } from "@/components/auth/auth-shell";
import { ProfessionalOnboardingForm } from "@/components/auth/professional-onboarding-form";
import { getProfessionalOnboarding } from "./actions";

export default async function ProfessionalOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: invitationId = "" } = await searchParams;
  const result = await getProfessionalOnboarding(invitationId);
  return (
    <AuthShell
      title="Seu acesso está quase pronto"
      description="Revise seus dados profissionais para entrar no ASTER."
    >
      <ProfessionalOnboardingForm
        invitationId={invitationId}
        invite={result.invite}
        initialError={result.error}
      />
    </AuthShell>
  );
}
