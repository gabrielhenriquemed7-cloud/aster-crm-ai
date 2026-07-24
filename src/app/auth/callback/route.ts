import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getSafeAuthCallbackDestination } from "@/lib/auth/callback";

const INVITE_REDIRECT_TARGET = "/auth/accept-invite";
const VALID_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

type CallbackError = {
  title: string;
  message: string;
  safeErrorCode: string;
};

function diagnostic(input: {
  stage: string;
  hasTokenHash: boolean;
  type: string | null;
  verificationSucceeded: boolean;
  sessionCreated: boolean;
  redirectTarget: string | null;
  safeErrorCode: string | null;
}) {
  console.info("ASTER_AUTH_CALLBACK_DIAGNOSTIC", input);
}

function safeAuthErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "AUTH_CALLBACK_ERROR";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[a-z0-9_]+$/i.test(code)
    ? code
    : "AUTH_CALLBACK_ERROR";
}

function isExpiredError(errorCode: string) {
  return errorCode.toLowerCase().includes("expired");
}

function callbackErrorPage(error: CallbackError) {
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${error.title} | ASTER CRM AI</title>
    <style>
      :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; color: #0f172a; }
      main { width: 100%; max-width: 440px; padding: 32px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; box-shadow: 0 8px 30px rgba(15, 23, 42, .08); }
      .brand { margin: 0 0 28px; font-size: 14px; font-weight: 700; letter-spacing: .08em; }
      h1 { margin: 0; font-size: 26px; line-height: 1.2; }
      p { margin: 12px 0 28px; color: #475569; line-height: 1.6; }
      .actions { display: grid; gap: 12px; }
      a { display: block; padding: 12px 16px; border-radius: 10px; text-align: center; font-weight: 700; text-decoration: none; }
      .primary { background: #0f766e; color: #fff; }
      .secondary { border: 1px solid #cbd5e1; color: #0f172a; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">ASTER CRM AI</div>
      <h1>${error.title}</h1>
      <p>${error.message}</p>
      <div class="actions">
        <a class="primary" href="mailto:joseval.med3@gmail.com?subject=Solicitar%20novo%20convite%20ASTER">Solicitar novo convite</a>
        <a class="secondary" href="/login">Voltar para o login</a>
      </div>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 400,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function applyCookies(response: NextResponse, cookies: PendingCookie[]) {
  for (const cookie of cookies)
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const hasTokenHash = Boolean(tokenHash);
  const pendingCookies: PendingCookie[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    diagnostic({
      stage: "configuration",
      hasTokenHash,
      type,
      verificationSucceeded: false,
      sessionCreated: false,
      redirectTarget: null,
      safeErrorCode: "SUPABASE_NOT_CONFIGURED",
    });
    return callbackErrorPage({
      title: "Não foi possível validar o convite",
      message: "Tente novamente mais tarde ou solicite um novo convite.",
      safeErrorCode: "SUPABASE_NOT_CONFIGURED",
    });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  if (type === "invite") {
    if (!tokenHash) {
      const error = {
        title: "Link de convite inválido",
        message:
          "Não foi possível encontrar os dados necessários para validar este convite.",
        safeErrorCode: "MISSING_INVITE_TOKEN_HASH",
      };
      diagnostic({
        stage: "validation",
        hasTokenHash: false,
        type,
        verificationSucceeded: false,
        sessionCreated: false,
        redirectTarget: null,
        safeErrorCode: error.safeErrorCode,
      });
      return callbackErrorPage(error);
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "invite",
    });
    const errorCode = error ? safeAuthErrorCode(error) : null;
    const sessionCreated = Boolean(data.session);

    if (error || !sessionCreated) {
      const expired = errorCode ? isExpiredError(errorCode) : false;
      const callbackError = expired
        ? {
            title: "Este convite expirou",
            message:
              "Solicite ao administrador da clínica o envio de um novo convite.",
            safeErrorCode: errorCode ?? "INVITE_EXPIRED",
          }
        : {
            title: "Link de convite inválido",
            message: "Não foi possível validar este convite.",
            safeErrorCode: errorCode ?? "INVITE_SESSION_NOT_CREATED",
          };
      diagnostic({
        stage: "verification",
        hasTokenHash: true,
        type,
        verificationSucceeded: false,
        sessionCreated,
        redirectTarget: null,
        safeErrorCode: callbackError.safeErrorCode,
      });
      return callbackErrorPage(callbackError);
    }

    diagnostic({
      stage: "redirect",
      hasTokenHash: true,
      type,
      verificationSucceeded: true,
      sessionCreated: true,
      redirectTarget: INVITE_REDIRECT_TARGET,
      safeErrorCode: null,
    });
    return applyCookies(
      NextResponse.redirect(new URL(INVITE_REDIRECT_TARGET, request.url)),
      pendingCookies,
    );
  }

  if (tokenHash) {
    if (!type || !VALID_EMAIL_OTP_TYPES.has(type as EmailOtpType)) {
      diagnostic({
        stage: "validation",
        hasTokenHash: true,
        type,
        verificationSucceeded: false,
        sessionCreated: false,
        redirectTarget: null,
        safeErrorCode: "INVALID_AUTH_TYPE",
      });
      return callbackErrorPage({
        title: "Link inválido",
        message: "Não foi possível validar este link de acesso.",
        safeErrorCode: "INVALID_AUTH_TYPE",
      });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    const redirectTarget =
      type === "recovery" ? "/reset-password" : "/dashboard";
    const sessionCreated = Boolean(data.session);
    if (!error && sessionCreated) {
      diagnostic({
        stage: "redirect",
        hasTokenHash: true,
        type,
        verificationSucceeded: true,
        sessionCreated: true,
        redirectTarget,
        safeErrorCode: null,
      });
      return applyCookies(
        NextResponse.redirect(new URL(redirectTarget, request.url)),
        pendingCookies,
      );
    }

    const errorCode = error
      ? safeAuthErrorCode(error)
      : "AUTH_SESSION_NOT_CREATED";
    diagnostic({
      stage: "verification",
      hasTokenHash: true,
      type,
      verificationSucceeded: false,
      sessionCreated,
      redirectTarget: null,
      safeErrorCode: errorCode,
    });
    return callbackErrorPage({
      title: "Link inválido ou expirado",
      message: "Solicite um novo link e tente novamente.",
      safeErrorCode: errorCode,
    });
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const redirectTarget = getSafeAuthCallbackDestination(
      request.nextUrl.searchParams.get("next") ?? undefined,
    );
    const sessionCreated = Boolean(data.session);
    if (!error && sessionCreated) {
      diagnostic({
        stage: "redirect",
        hasTokenHash: false,
        type: "pkce",
        verificationSucceeded: true,
        sessionCreated: true,
        redirectTarget,
        safeErrorCode: null,
      });
      return applyCookies(
        NextResponse.redirect(new URL(redirectTarget, request.url)),
        pendingCookies,
      );
    }
  }

  diagnostic({
    stage: "validation",
    hasTokenHash: false,
    type,
    verificationSucceeded: false,
    sessionCreated: false,
    redirectTarget: null,
    safeErrorCode: "MISSING_AUTH_CALLBACK_CREDENTIALS",
  });
  return callbackErrorPage({
    title: "Link de convite inválido",
    message:
      "Não foi possível encontrar os dados necessários para validar este convite.",
    safeErrorCode: "MISSING_AUTH_CALLBACK_CREDENTIALS",
  });
}
