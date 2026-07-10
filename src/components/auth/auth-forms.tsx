"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/client";

const credentialsSchema = z.object({ email: z.string().email("Informe um e-mail válido."), password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.") });
const signupSchema = credentialsSchema.extend({ fullName: z.string().min(3, "Informe seu nome completo.") });
const emailSchema = z.object({ email: z.string().email("Informe um e-mail válido.") });
const passwordSchema = z.object({ password: z.string().min(8, "A senha deve ter ao menos 8 caracteres.") });

function Field({ label, error, ...props }: { label: string; error?: string; type?: string } & InputHTMLAttributes<HTMLInputElement>) { return <div><label className="mb-1.5 block text-sm font-medium" htmlFor={props.name}>{label}</label><Input id={props.name} {...props} /><p className="mt-1 min-h-4 text-xs text-destructive">{error}</p></div>; }
function Submit({ loading, children }: { loading: boolean; children: ReactNode }) { return <Button type="submit" className="mt-2 w-full" disabled={loading}>{loading && <Loader2 className="animate-spin" />}{children}</Button>; }

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter(); const [loading, setLoading] = useState(false); const form = useForm<z.infer<typeof credentialsSchema>>({ resolver: zodResolver(credentialsSchema), defaultValues: { email: "", password: "" } });
  async function submit(values: z.infer<typeof credentialsSchema>) { setLoading(true); const { error } = await createClient().auth.signInWithPassword(values); setLoading(false); if (error) return toast.error("E-mail ou senha inválidos."); const destination = nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard"; router.push(destination); router.refresh(); }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-3"><Field label="E-mail" type="email" {...form.register("email")} error={form.formState.errors.email?.message} /><Field label="Senha" type="password" {...form.register("password")} error={form.formState.errors.password?.message} /><div className="text-right"><Link className="text-sm font-medium text-primary hover:underline" href="/forgot-password">Esqueci minha senha</Link></div><Submit loading={loading}>Entrar</Submit><p className="pt-3 text-center text-sm text-muted-foreground">Ainda não possui conta? <Link className="font-medium text-primary hover:underline" href="/signup">Criar conta</Link></p></form>;
}

export function SignupForm() {
  const [loading, setLoading] = useState(false); const form = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema), defaultValues: { fullName: "", email: "", password: "" } });
  async function submit(values: z.infer<typeof signupSchema>) { setLoading(true); const { error } = await createClient().auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.fullName }, emailRedirectTo: `${getSiteUrl()}/auth/callback` } }); setLoading(false); if (error) return toast.error(error.message); toast.success("Conta criada. Verifique seu e-mail para confirmar o cadastro."); form.reset(); }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-3"><Field label="Nome completo" {...form.register("fullName")} error={form.formState.errors.fullName?.message} /><Field label="E-mail" type="email" {...form.register("email")} error={form.formState.errors.email?.message} /><Field label="Senha" type="password" {...form.register("password")} error={form.formState.errors.password?.message} /><p className="text-xs text-muted-foreground">Novas contas iniciam como Recepcionista. Perfis administrativos são atribuídos pela clínica.</p><Submit loading={loading}>Criar conta</Submit><p className="pt-3 text-center text-sm text-muted-foreground">Já possui conta? <Link className="font-medium text-primary hover:underline" href="/login">Entrar</Link></p></form>;
}

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false); const form = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });
  async function submit(values: z.infer<typeof emailSchema>) { setLoading(true); const { error } = await createClient().auth.resetPasswordForEmail(values.email, { redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password` }); setLoading(false); if (error) return toast.error(error.message); toast.success("Enviamos as instruções para seu e-mail."); }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-3"><Field label="E-mail" type="email" {...form.register("email")} error={form.formState.errors.email?.message} /><Submit loading={loading}>Enviar instruções</Submit><p className="pt-3 text-center text-sm"><Link className="font-medium text-primary hover:underline" href="/login">Voltar para login</Link></p></form>;
}

export function ResetPasswordForm() {
  const router = useRouter(); const [loading, setLoading] = useState(false); const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "" } });
  async function submit(values: z.infer<typeof passwordSchema>) { setLoading(true); const { error } = await createClient().auth.updateUser({ password: values.password }); setLoading(false); if (error) return toast.error(error.message); toast.success("Senha atualizada com sucesso."); router.push("/dashboard"); router.refresh(); }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-3"><Field label="Nova senha" type="password" {...form.register("password")} error={form.formState.errors.password?.message} /><Submit loading={loading}>Atualizar senha</Submit></form>;
}
