const allowedAuthCallbackDestinations = new Set([
  "/dashboard",
  "/reset-password",
  "/auth/accept-invite",
]);

export function getSafeAuthCallbackDestination(requested?: string | null) {
  return requested && allowedAuthCallbackDestinations.has(requested)
    ? requested
    : "/dashboard";
}
