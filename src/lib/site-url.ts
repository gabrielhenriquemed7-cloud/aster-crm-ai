import type { NextRequest } from "next/server";

export const PRODUCTION_SITE_URL = "https://aster-crm-ai.vercel.app";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || PRODUCTION_SITE_URL).replace(/\/$/, "");
}

export function getRequestOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : getSiteUrl();
}
