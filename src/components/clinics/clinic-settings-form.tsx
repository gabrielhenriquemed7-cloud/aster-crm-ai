"use client";

import { Loader2, MapPin, Save, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createClinicAssetUpload, removeClinicAsset, saveClinicLogo, saveClinicSettings } from "@/app/(dashboard)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Values = Record<string, string>;
const fields: Array<[string, string, string?]> = [
  ["name", "Nome fantasia"], ["legal_name", "Razão social"], ["cnpj", "CNPJ"], ["cnes", "CNES"],
  ["phone", "Telefone"], ["whatsapp", "WhatsApp"], ["email", "E-mail", "email"], ["website", "Website", "url"], ["instagram", "Instagram"], ["favicon_url", "URL do favicon", "url"],
  ["zip_code", "CEP"], ["address", "Logradouro"], ["address_number", "Número"], ["address_complement", "Complemento"], ["neighborhood", "Bairro"], ["city", "Cidade"], ["state", "Estado"],
];
const onlyDigits = (value: string) => value.replace(/\D/g, "");
const maskCnpj = (value: string) => { const d = onlyDigits(value).slice(0, 14); return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); };
const maskCep = (value: string) => onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
const maskPhone = (value: string) => { const d = onlyDigits(value).slice(0, 11); return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3") : d.replace(/^(\d{2})(\d{4})(\d{4}).*/, "($1) $2-$3"); };

export function ClinicSettingsForm({ clinic }: { clinic: Record<string, unknown> }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map(([key]) => [key, String(clinic[key] ?? "")] )));
  const [logoPath, setLogoPath] = useState(String(clinic.logo_url ?? ""));
  const [logoPreview, setLogoPreview] = useState(String(clinic.logo_preview_url ?? clinic.logo_url ?? ""));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const update = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  async function lookupCep(value: string) {
    const cep = onlyDigits(value); if (cep.length !== 8) return;
    try { const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const data = await response.json(); if (data.erro) return toast.error("CEP não encontrado."); setValues((current) => ({ ...current, address: data.logradouro ?? current.address, neighborhood: data.bairro ?? current.neighborhood, city: data.localidade ?? current.city, state: data.uf ?? current.state })); } catch { toast.error("Não foi possível consultar o CEP."); }
  }
  async function upload(file: File) {
    setError("");
    if (file.size > 5 * 1024 * 1024) { const message = "VALIDATION_ERROR: A logomarca deve ter no máximo 5 MB."; setError(message); return toast.error(message); }
    setUploading(true); const prepared = await createClinicAssetUpload(file.name, file.type, file.size); if ("error" in prepared) { setUploading(false); setError(prepared.error); return toast.error(prepared.error); }
    const supabase = createClient(); const result = await supabase.storage.from("clinic-assets").uploadToSignedUrl(prepared.path, prepared.token, file); setUploading(false); if (result.error) { const storageError = result.error as typeof result.error & { statusCode?: string; code?: string }; console.error("ASTER_SETTINGS_ERROR", { section: "logo", message: storageError.message, details: undefined, hint: undefined, code: storageError.code ?? storageError.statusCode }); const message = `${storageError.code ?? storageError.statusCode ?? "SEM_CODIGO"}: ${storageError.message}`; setError(message); return toast.error(message); }
    const saved = await saveClinicLogo(prepared.path); if ("error" in saved) { setError(saved.error); return toast.error(saved.error); }
    setLogoPath(prepared.path); setLogoPreview(saved.signedUrl); toast.success(saved.success); router.refresh();
  }
  async function clearLogo() { setError(""); if (logoPath) { const result = await removeClinicAsset(logoPath); if ("error" in result) { setError(result.error); return toast.error(result.error); } } setLogoPath(""); setLogoPreview(""); toast.success("Logomarca removida."); router.refresh(); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); const result = await saveClinicSettings({ ...values, logo_url: logoPath }); setSaving(false); if ("error" in result) { setError(result.error); return toast.error(result.error); } toast.success(result.success); router.refresh(); }
  return <form onSubmit={submit} className="space-y-6 rounded-xl border bg-card p-5">
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label, type]) => <label key={key}><span className="text-sm font-medium">{label}{key === "name" && " *"}</span><Input className="mt-1" type={type ?? "text"} value={values[key] ?? ""} onChange={(event) => { const value = key === "cnpj" ? maskCnpj(event.target.value) : key === "zip_code" ? maskCep(event.target.value) : ["phone", "whatsapp"].includes(key) ? maskPhone(event.target.value) : event.target.value; update(key, value); }} onBlur={() => key === "zip_code" && void lookupCep(values[key] ?? "")} /></label>)}</div>
    <div className="rounded-xl border border-dashed p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Logomarca</p><p className="text-xs text-muted-foreground">PNG, JPG ou WebP, com no máximo 5 MB.</p></div><div className="flex gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Upload className="size-4" />{uploading ? "Enviando..." : "Enviar imagem"}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>{logoPath && <Button type="button" variant="outline" onClick={() => void clearLogo()}><X />Remover</Button>}</div></div>{logoPreview && <div className="mt-4 flex h-28 items-center justify-center rounded-lg bg-muted p-3"><Image src={logoPreview} alt="Prévia da logomarca" className="max-h-full max-w-full object-contain" width={360} height={112} unoptimized /></div>}</div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={saving || uploading}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Salvar configurações</Button><span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />O endereço pode ser preenchido automaticamente pelo CEP.</span></div>
  </form>;
}
