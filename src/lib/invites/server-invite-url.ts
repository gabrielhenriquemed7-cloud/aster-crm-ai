import "server-only";

import {
  buildProfessionalInviteRedirectTo,
  resolveInviteSiteUrl,
} from "@/lib/invites/invite-url";

export function resolveServerInviteUrl() {
  const siteUrl = resolveInviteSiteUrl();
  const redirectTo = buildProfessionalInviteRedirectTo(siteUrl);
  return { siteUrl, redirectTo };
}
