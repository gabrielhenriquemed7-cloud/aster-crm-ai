export const DEVELOPMENT_INVITE_SITE_URL = "http://localhost:3000";

export type InviteSiteUrlOptions = {
  nodeEnv?: string;
  appUrl?: string;
  vercelProjectProductionUrl?: string;
  nextPublicSiteUrl?: string;
};

export class InviteSiteUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteSiteUrlConfigurationError";
  }
}

function normalizeVercelProductionUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function parseInviteSiteUrl(value: string, production: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InviteSiteUrlConfigurationError(
      "A URL pública do convite deve ser uma URL HTTP(S) válida.",
    );
  }

  if (!["http:", "https:"].includes(url.protocol))
    throw new InviteSiteUrlConfigurationError(
      "A URL pública do convite deve usar HTTP(S).",
    );

  const hostname = url.hostname.toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  if (production && local)
    throw new InviteSiteUrlConfigurationError(
      "A URL pública do convite não pode apontar para localhost em produção.",
    );
  if (production && url.protocol !== "https:")
    throw new InviteSiteUrlConfigurationError(
      "A URL pública do convite deve usar HTTPS em produção.",
    );

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function resolveInviteSiteUrl({
  nodeEnv = process.env.NODE_ENV,
  appUrl = process.env.APP_URL,
  vercelProjectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL,
  nextPublicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL,
}: InviteSiteUrlOptions = {}) {
  const production = nodeEnv === "production";
  const configured =
    appUrl?.trim() ||
    (vercelProjectProductionUrl?.trim()
      ? normalizeVercelProductionUrl(vercelProjectProductionUrl.trim())
      : "") ||
    nextPublicSiteUrl?.trim();

  if (!configured) {
    if (production)
      throw new InviteSiteUrlConfigurationError(
        "APP_URL, VERCEL_PROJECT_PRODUCTION_URL ou NEXT_PUBLIC_SITE_URL deve estar configurada em produção.",
      );
    return DEVELOPMENT_INVITE_SITE_URL;
  }

  return parseInviteSiteUrl(configured, production);
}

export function buildProfessionalInviteRedirectTo(siteUrl: string) {
  return `${siteUrl}/auth/callback`;
}
