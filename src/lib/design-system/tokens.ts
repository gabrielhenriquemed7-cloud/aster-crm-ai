export const designTokens = {
  controlHeight: { sm: "2rem", md: "2.25rem", lg: "2.5rem" },
  radius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)", xl: "var(--radius-xl)" },
  spacing: { section: "var(--section-gap)", page: "var(--page-gap)" },
  shadow: { xs: "var(--shadow-xs)", sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" },
  status: { success: "var(--success)", warning: "var(--warning)", error: "var(--error)" },
} as const

export type DesignSystemSize = "sm" | "md" | "lg"
export type DesignSystemStatus = "default" | "success" | "warning" | "error"
