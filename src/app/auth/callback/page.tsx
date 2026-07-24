import { AuthCallbackHandler } from "@/components/auth/auth-callback-handler";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSafeAuthCallbackDestination } from "@/lib/auth/callback";

type CallbackSearchParams = {
  code?: string;
  token_hash?: string;
  type?: string;
  next?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
};

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<CallbackSearchParams>;
}) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Validando seu acesso"
      description="Aguarde enquanto o ASTER confirma seu link de acesso."
    >
      <AuthCallbackHandler
        code={params.code}
        tokenHash={params.token_hash}
        type={params.type}
        next={getSafeAuthCallbackDestination(params.next)}
        providerError={
          params.error_description || params.error_code || params.error
        }
      />
    </AuthShell>
  );
}
