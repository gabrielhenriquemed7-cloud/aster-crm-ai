# Convites profissionais por e-mail

## Variáveis do aplicativo

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (somente servidor; nunca usar prefixo `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_SITE_URL` (`http://localhost:3000` somente em desenvolvimento e `https://app.asterclin.com.br` em produção)

Cadastre no Supabase Auth as URLs permitidas:

- `http://localhost:3000/auth/callback?next=/auth/accept-invite`
- `https://app.asterclin.com.br/auth/callback?next=/auth/accept-invite`

## Template “Invite user” do Supabase

Assunto: `Você foi convidado para acessar o ASTER`

```html
<h2>Olá, {{ .Data.full_name }}</h2>
<p>
  Você recebeu um convite para integrar a equipe da clínica {{ .Data.clinic_name
  }} no ASTER.
</p>
<p>
  No ASTER, você poderá acessar os recursos autorizados pela clínica de acordo
  com seu perfil profissional.
</p>
<p><a href="{{ .ConfirmationURL }}">Aceitar convite</a></p>
<p>Este convite é pessoal e não deve ser compartilhado.</p>
<p>Caso você não reconheça este convite, ignore esta mensagem.</p>
<p>Equipe ASTER</p>
```

Para usuários que já possuem conta, configure também o template “Magic Link” com o mesmo conteúdo e `{{ .ConfirmationURL }}`.

## SMTP

Configure exclusivamente no painel Supabase em Authentication → Email → SMTP Settings. Informe host, porta, usuário, senha, remetente e nome `ASTER`. Não coloque credenciais SMTP no código ou na Vercel. A implementação é independente do provedor SMTP.

A expiração do link é controlada pela configuração de expiração de OTP do Supabase. Mantenha esse prazo alinhado ao `expires_at` interno definido na migration.
