# Templates de e-mail — ASTER CRM AI

Configuração no Supabase Dashboard: **Authentication → Email Templates**.

| Arquivo             | Template Supabase         | Assunto                               |
| ------------------- | ------------------------- | ------------------------------------- |
| `invite.html`       | Invite user               | Bem-vindo ao ASTER CRM AI             |
| `recovery.html`     | Reset password / Recovery | Redefinição de senha                  |
| `confirmation.html` | Confirm signup            | Confirme seu endereço eletrônico      |
| `magic-link.html`   | Magic Link                | Entrar no ASTER CRM AI                |
| `change-email.html` | Change Email Address      | Confirme seu novo endereço eletrônico |

Cole o HTML integral do arquivo no campo **Body** e o assunto indicado no campo **Subject**. Não substitua `{{ .ConfirmationURL }}` por uma URL manual.

Variáveis utilizadas:

- `{{ .ConfirmationURL }}`: link seguro gerado pelo Supabase.
- `{{ .Email }}`: endereço do destinatário.
- `{{ .Data.full_name }}`: nome, quando enviado pelo ASTER.
- `{{ .Data.clinic_name }}`: clínica convidante, quando disponível.
- `{{ .Data.role }}`: cargo, quando disponível.

Os condicionais são Go Templates, formato suportado pelos templates do Supabase. A saudação prioriza nome, depois e-mail e, por fim, “Olá”.

Remetente no Supabase SMTP:

- Nome: `ASTER CRM AI`
- E-mail: `convites@asterclin.com.br`

Após salvar, envie testes pelo painel para Gmail, Outlook e Apple Mail e confira versões clara/escura em dispositivo real. Clientes de e-mail variam e a validação visual final depende de envio real.
