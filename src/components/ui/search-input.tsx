import * as React from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SearchInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & { onClear?: () => void }
function SearchInput({ className, onClear, value, defaultValue, ...props }: SearchInputProps) {
  const hasValue = String(value ?? defaultValue ?? "").length > 0
  return <div data-slot="search-input" className="relative"><Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={value} defaultValue={defaultValue} className={cn("pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden", className)} {...props} />{onClear && hasValue && <Button type="button" variant="ghost" size="icon-xs" aria-label="Limpar busca" className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={onClear}><X /></Button>}</div>
}

export { SearchInput }
