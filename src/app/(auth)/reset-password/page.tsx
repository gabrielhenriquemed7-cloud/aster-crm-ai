import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export default function ResetPasswordPage() { return <AuthShell title="Definir nova senha" description="Escolha uma senha segura com pelo menos 8 caracteres."><ResetPasswordForm /></AuthShell>; }
