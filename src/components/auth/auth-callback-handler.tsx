"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const supportedOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function callbackErrorMessage(error: string) {
  const normalized = error.toLowerCase();
  if (
    normalized.includes("expired") ||
    normalized.includes("otp_expired") ||
    normalized.includes("expir")
  )
    return "Este convite expirou. Solicite um novo convite ao administrador da clínica.";
  if (normalized.includes("already") || normalized.includes("used"))
    return "Este convite já foi utilizado. Entre com sua conta para continuar.";
  return "Não foi possível validar este convite.";
}

export function AuthCallbackHandler({
  code,
  tokenHash,
  type,
  next,
  providerError,
}: {
  code?: string;
  tokenHash?: string;
  type?: string;
  next: string;
  providerError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function establishSession() {
      try {
        if (providerError) throw new Error(providerError);
        const supabase = createClient();

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (
          tokenHash &&
          type &&
          supportedOtpTypes.has(type as EmailOtpType)
        ) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });
          if (verifyError) throw verifyError;
        } else {
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const hashError =
            hash.get("error_description") ||
            hash.get("error_code") ||
            hash.get("error");
          if (hashError) throw new Error(hashError);

          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
          }
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user)
          throw userError || new Error("Sessão não criada.");

        window.history.replaceState(null, "", "/auth/callback");
        router.replace(next);
        router.refresh();
      } catch (sessionError) {
        if (!active) return;
        const message =
          sessionError instanceof Error
            ? sessionError.message
            : "Convite inválido.";
        window.history.replaceState(null, "", "/auth/callback");
        setError(callbackErrorMessage(message));
      }
    }

    void establishSession();
    return () => {
      active = false;
    };
  }, [code, next, providerError, router, tokenHash, type]);

  if (!error)
    return (
      <div
        className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-5 animate-spin text-primary" />
        Criando sua sessão segura...
      </div>
    );

  return (
    <div className="space-y-4">
      <p
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive"
      >
        {error}
      </p>
      <a
        className={buttonVariants({ className: "w-full" })}
        href="mailto:joseval.med3@gmail.com?subject=Solicitar%20novo%20convite%20ASTER"
      >
        Solicitar novo convite
      </a>
      <Link
        className={buttonVariants({ variant: "outline", className: "w-full" })}
        href="/login"
      >
        Voltar ao login
      </Link>
    </div>
  );
}
