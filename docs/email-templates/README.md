# Templates de e-mail — ASTER CRM AI

HTMLs prontos para copiar no painel do Supabase Auth. Os arquivos são a fonte
versionada; o conteúdo integral de cada um corresponde ao campo **Body**.

## Onde colar no Supabase

Abra o projeto no Supabase Dashboard e acesse **Authentication → Emails →
Templates**.

### Authentication emails

| Arquivo                                    | Template no painel       | Assunto                                           |
| ------------------------------------------ | ------------------------ | ------------------------------------------------- |
| [`invite.html`](./invite.html)             | **Invite user**          | `Você foi convidado para utilizar o ASTER CRM AI` |
| [`confirmation.html`](./confirmation.html) | **Confirm sign up**      | `Confirme seu endereço de e-mail`                 |
| [`recovery.html`](./recovery.html)         | **Reset password**       | `Redefinição de senha`                            |
| [`magic-link.html`](./magic-link.html)     | **Magic link or OTP**    | `Entrar no ASTER CRM AI`                          |
| [`change-email.html`](./change-email.html) | **Change email address** | `Confirme seu novo endereço de e-mail`            |

Para cada linha:

1. Abra o template indicado.
2. Cole o assunto no campo **Subject**.
3. Copie o HTML integral do arquivo para o campo **Body**.
4. Salve o template.

### Security notification emails

Na mesma página, abra **Security notification emails → Password changed**:

| Arquivo                                            | Template no painel   | Assunto                  |
| -------------------------------------------------- | -------------------- | ------------------------ |
| [`password-changed.html`](./password-changed.html) | **Password changed** | `Sua senha foi alterada` |

Cole o assunto e o HTML integral. A notificação somente será enviada se
**Password changed** estiver habilitada no projeto. Habilitá-la é uma decisão
operacional e não é realizada por estes arquivos.

## Placeholders preservados

- `{{ .ConfirmationURL }}` permanece diretamente nos botões e links
  alternativos dos cinco e-mails de autenticação.
- `{{ .Email }}` é usado na saudação quando disponível.
- `{{ .NewEmail }}` é usado somente em **Change email address**, onde é
  suportado pelo Supabase.
- `{{ .Data.full_name }}`, `{{ .Data.clinic_name }}` e `{{ .Data.role }}` são
  preservados nos templates em que os metadados do convite podem estar
  disponíveis.

Não substitua `{{ .ConfirmationURL }}` por URL, token ou rota manual. Os
condicionais `{{ if ... }}` são Go Templates aceitos pelo Supabase Auth.

## Logomarca

Enquanto não houver arquivo oficial, o cabeçalho usa o wordmark tipográfico
**ASTER CRM AI**. Cada HTML contém o comentário `LOGO_IMAGE` com um bloco
`<img>` pronto. Quando a imagem definitiva estiver disponível:

1. substitua `ASTER_LOGO_URL` pela URL pública HTTPS;
2. use o bloco documentado no lugar do parágrafo do wordmark.

A imagem deve ter aproximadamente 360 px de largura física para exibição a
180 px, fundo transparente e URL pública estável.

## WhatsApp

O número está centralizado pelo marcador pesquisável
`ASTER_WHATSAPP_NUMBER`. Antes de colar no painel, substitua
`5500000000000`, em todos os arquivos, pelo número real em formato
internacional, apenas com dígitos. Exemplo: `5571999999999`.

Esse valor é texto/configuração do template, não uma variável do Supabase.

## Compatibilidade

- estrutura principal e botões construídos com tabelas;
- estilos críticos inline;
- largura máxima de 600 px;
- media query simples para telas menores;
- tabela condicional para Microsoft Outlook;
- fontes seguras (`Arial`, `Helvetica`, `sans-serif`);
- sem JavaScript, fontes externas, formulários ou CSS moderno obrigatório.

Após copiar, use o envio de teste do painel e confira Gmail, Outlook, Apple
Mail, Yahoo e Thunderbird em desktop e celular.

Referência oficial:
[Supabase Auth — Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).
