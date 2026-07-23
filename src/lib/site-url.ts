import type { NextRequest } from "next/server";

export const DEVELOPMENT_SITE_URL = "http://localhost:3000";
export const PRODUCTION_SITE_URL = "https://app.asterclin.com.br";

type PublicAppUrlOptions = {
  nodeEnv?: string;
  configuredUrl?: string;
};

export class PublicAppUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicAppUrlConfigurationError";
  }
}

function parsePublicAppUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    throw new PublicAppUrlConfigurationError(
      "NEXT_PUBLIC_SITE_URL deve ser uma URL HTTP(S) válida.",
    );
  }
}

export function resolvePublicAppUrl({
  nodeEnv = process.env.NODE_ENV,
  configuredUrl = process.env.NEXT_PUBLIC_SITE_URL,
}: PublicAppUrlOptions = {}) {
  const production = nodeEnv === "production";
  const configured = configuredUrl?.trim();

  if (!configured) {
    if (production)
      throw new PublicAppUrlConfigurationError(
        "NEXT_PUBLIC_SITE_URL não está configurada para produção.",
      );
    return DEVELOPMENT_SITE_URL;
  }

  const url = parsePublicAppUrl(configured);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (production && local)
    throw new PublicAppUrlConfigurationError(
      "NEXT_PUBLIC_SITE_URL não pode apontar para localhost em produção.",
    );

  return url.toString().replace(/\/+$/, "");
}

export function getSiteUrl() {
  try {
    return resolvePublicAppUrl();
  } catch {
    return process.env.NODE_ENV === "development"
      ? DEVELOPMENT_SITE_URL
      : PRODUCTION_SITE_URL;
  }
}

export function getProfessionalInviteCallbackUrl(
  options: PublicAppUrlOptions = {},
) {
  return `${resolvePublicAppUrl(options)}/auth/callback?next=/auth/accept-invite`;
}

export function getRequestOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ||
    (host?.includes("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : getSiteUrl();
}
