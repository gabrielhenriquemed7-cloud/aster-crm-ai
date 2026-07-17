"use client"

import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { usePathname } from "next/navigation"

const labels: Record<string, string> = {
  dashboard: "Dashboard",
  appointments: "Agenda",
  consultas: "Consultas",
  patients: "Pacientes",
  prontuario: "Prontuário",
  documentos: "Documentos",
  configuracoes: "Configurações",
  profile: "Perfil",
  settings: "Configurações",
  new: "Novo",
  edit: "Editar",
  manutencao: "Manutenção",
}

function segmentLabel(segment: string) {
  if (labels[segment]) return labels[segment]
  if (/^[0-9a-f-]{20,}$/i.test(segment)) return "Detalhes"
  return decodeURIComponent(segment).replaceAll("-", " ")
}

function segmentHref(segments: string[], index: number) {
  const href = `/${segments.slice(0, index + 1).join("/")}`
  if (index === 0 && segments[0] === "consultas") return "/appointments"
  if (index === 0 && segments[0] === "documentos") return "/appointments"
  if (index === 0 && segments[0] === "configuracoes") return "/configuracoes/clinica"
  return href
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  if (!segments.length || pathname === "/dashboard") return null

  return (
    <nav aria-label="Breadcrumb" className="border-t border-border/60">
      <ol className="mx-auto flex h-9 max-w-[1600px] items-center gap-1 overflow-x-auto px-4 text-xs whitespace-nowrap text-muted-foreground sm:px-6 lg:px-8">
        <li>
          <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
            <Home className="size-3" aria-hidden />
            <span className="sr-only">Dashboard</span>
          </Link>
        </li>
        {segments.map((segment, index) => {
          const href = segmentHref(segments, index)
          const current = index === segments.length - 1
          return (
            <li key={href} className="flex items-center gap-1">
              <ChevronRight className="size-3 opacity-60" aria-hidden />
              {current ? (
                <span aria-current="page" className="font-medium text-foreground">{segmentLabel(segment)}</span>
              ) : (
                <Link href={href} className="capitalize hover:text-foreground">{segmentLabel(segment)}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
