"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type ConfirmDialogProps = React.ComponentProps<typeof Dialog> & {
  trigger?: React.ReactNode
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

function ConfirmDialog({ trigger, title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar", destructive = false, loading = false, onConfirm, ...props }: ConfirmDialogProps) {
  return <Dialog {...props}>{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}<DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader><DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={loading}>{cancelLabel}</Button></DialogClose><Button type="button" variant={destructive ? "destructive" : "default"} disabled={loading} aria-busy={loading} onClick={() => void onConfirm()}>{loading && <Loader2 className="animate-spin" />}{confirmLabel}</Button></DialogFooter></DialogContent></Dialog>
}

export { ConfirmDialog }
