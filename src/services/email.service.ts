/**
 * Email service — centralizes all transactional email sending via Resend.
 *
 * Templates:
 *   welcome        → immediately after email verification
 *   day2_nudge     → day 2 if user has created zero secrets
 *   day7_api       → day 7 if user has no API key
 *   day14_upgrade  → day 14 if user is still on free plan
 */

import { config } from '../config'

// ── Shared logo SVG (inline — matches AppLogo.vue geometry exactly) ───────────
// Flat-top hexagon + key bow + key blade, same viewBox and paths as AppLogo.vue
const LOGO_SVG = `
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-right:6px;">
  <path d="M12 3L18.5 6.75V14.25L12 18L5.5 14.25V6.75L12 3Z"
    fill="#00d9ff" fill-opacity="0.12"
    stroke="#00d9ff" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="10.9" cy="10.4" r="2.25"
    stroke="#00d9ff" stroke-width="1.5"/>
  <path d="M13.1 10.4H16.5M15 10.4V11.9"
    stroke="#00d9ff" stroke-width="1.5" stroke-linecap="round"/>
</svg>`

// ── Shared styles ─────────────────────────────────────────────────────────────
const CSS = `
  body { font-family: system-ui, -apple-system, sans-serif; background: #06090f; color: #c8d8e8; margin: 0; padding: 40px 16px; }
  .card { max-width: 520px; margin: 0 auto; background: #0d1320; border: 1px solid #1a2840; border-radius: 16px; padding: 40px 32px; }
  .logo { display: flex; align-items: center; font-size: 18px; font-weight: 700; color: #00d9ff; margin-bottom: 32px; letter-spacing: -0.02em; line-height: 1; }
  h1 { font-size: 22px; font-weight: 700; color: #e8f4ff; margin: 0 0 12px; line-height: 1.3; }
  p { font-size: 14px; line-height: 1.75; color: #8aa0b0; margin: 0 0 20px; }
  .btn { display: inline-block; background: #00d9ff; color: #040810 !important; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 8px; text-decoration: none; margin-bottom: 24px; }
  .tip { background: #0a1624; border-left: 3px solid #00d9ff; border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 20px; }
  .tip p { margin: 0; font-size: 13px; }
  .code { font-family: 'Menlo', 'Consolas', monospace; background: #060e1a; border: 1px solid #1a2840; border-radius: 6px; padding: 12px 16px; font-size: 12px; color: #00d9ff; margin-bottom: 20px; overflow-x: auto; white-space: pre; }
  .divider { border: none; border-top: 1px solid #1a2840; margin: 24px 0; }
  .footer { font-size: 11px; color: #344050; margin-top: 8px; line-height: 1.6; }
  .footer a { color: #4a6080; }
  ul { padding-left: 20px; margin: 0 0 20px; }
  li { font-size: 14px; line-height: 1.75; color: #8aa0b0; margin-bottom: 4px; }
  strong { color: #c8d8e8; }
`

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FadeKey</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="card">
    <div class="logo">${LOGO_SVG}FadeKey</div>
    ${content}
    <hr class="divider">
    <div class="footer">
      Você está recebendo este email porque criou uma conta em fadekey.app.<br>
      <a href="${config.app.url}">fadekey.app</a>
    </div>
  </div>
</body>
</html>`
}

// ── Template factories ────────────────────────────────────────────────────────

export function welcomeTemplate(appUrl: string) {
  const dashUrl = `${appUrl}/app/dashboard`
  const docsUrl = `${appUrl}/docs`
  return {
    subject: 'Bem-vindo ao FadeKey — compartilhe segredos com segurança',
    text: [
      'Bem-vindo ao FadeKey!',
      '',
      'Sua conta está ativa. Acesse o painel para criar seu primeiro secret:',
      dashUrl,
      '',
      'O que você pode fazer agora:',
      '• Criar um secret com TTL e limite de visualizações',
      '• Gerar uma API key para integrar com seus projetos',
      '• Explorar a documentação: ' + docsUrl,
      '',
      'Plano Free: 10 secrets/mês, TTL máx. 24h, 1 visualização por secret.',
    ].join('\n'),
    html: baseLayout(`
      <h1>Tudo pronto. 🎉</h1>
      <p>Sua conta FadeKey está ativa. Crie seu primeiro secret em segundos — defina o TTL, limite de visualizações e compartilhe o link com quem precisar.</p>
      <a href="${dashUrl}" class="btn">Criar meu primeiro secret</a>
      <div class="tip">
        <p><strong>Plano Free:</strong> 10 secrets por mês, TTL máximo de 24h, 1 visualização por secret. Sem cartão de crédito.</p>
      </div>
      <p style="margin:0; font-size:13px;">Também vale explorar a <a href="${docsUrl}" style="color:#00d9ff;">documentação com playground interativo</a> se você quiser integrar via API.</p>
    `),
  }
}

export function day2NudgeTemplate(appUrl: string) {
  const createUrl = `${appUrl}/app/dashboard`
  return {
    subject: 'Você ainda não criou seu primeiro secret no FadeKey',
    text: [
      'Olá!',
      '',
      'Notamos que você ainda não criou seu primeiro secret no FadeKey.',
      '',
      'Um caso de uso comum: você precisa passar uma senha de banco de dados para um colega.',
      'Em vez de mandar pelo Slack (que fica salvo para sempre), crie um secret que expira',
      'em 1 hora ou assim que for lido — o que acontecer primeiro.',
      '',
      'Leva menos de 30 segundos: ' + createUrl,
    ].join('\n'),
    html: baseLayout(`
      <h1>Você não criou nenhum secret ainda.</h1>
      <p>Precisa de inspiração? Aqui está um caso de uso real:</p>
      <div class="tip">
        <p>Você precisa passar uma <strong>senha de banco de dados</strong> para um colega. Em vez de mandar pelo Slack — onde fica salvo para sempre — crie um secret que expira <strong>em 1 hora ou assim que for lido</strong>, o que acontecer primeiro.</p>
      </div>
      <p>Leva menos de 30 segundos.</p>
      <a href="${createUrl}" class="btn">Criar meu primeiro secret</a>
    `),
  }
}

export function day7ApiTemplate(appUrl: string) {
  const keysUrl = `${appUrl}/app/keys`
  const docsUrl = `${appUrl}/docs`
  return {
    subject: 'Automatize o FadeKey com a sua API key',
    text: [
      'Você tem usado o FadeKey — que tal automatizar?',
      '',
      'Com uma API key você pode criar secrets direto dos seus scripts, pipelines de CI/CD ou qualquer integração.',
      'Cada secret expira pelo TTL definido ou após atingir o limite de visualizações.',
      '',
      'Exemplo rápido (curl):',
      '',
      'curl -X POST https://api.fadekey.app/api/items \\',
      '  -H "X-API-Key: SUA_CHAVE" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"ciphertext":"...","iv":"...","ttl":3600,"maxViews":1}\'',
      '',
      'Gere sua chave aqui: ' + keysUrl,
      'Documentação completa: ' + docsUrl,
    ].join('\n'),
    html: baseLayout(`
      <h1>Sua API key está esperando.</h1>
      <p>Com uma API key você integra o FadeKey direto nos seus scripts, CI/CD ou ferramentas internas. Cada secret expira <strong>pelo TTL definido ou ao atingir o limite de visualizações</strong> — o que acontecer primeiro.</p>
      <div class="code">curl -X POST https://api.fadekey.app/api/items \\
  -H "X-API-Key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"ciphertext":"...","iv":"...","ttl":3600,"maxViews":1}'</div>
      <a href="${keysUrl}" class="btn">Gerar minha API key</a>
      <p style="margin:0; font-size:13px;">Veja exemplos completos em <a href="${docsUrl}" style="color:#00d9ff;">Node.js, Python e curl</a> na documentação.</p>
    `),
  }
}



// ── Dispatcher ────────────────────────────────────────────────────────────────

export type EmailType = 'welcome' | 'day2_nudge' | 'day7_api'

export async function sendEmail(to: string, type: EmailType): Promise<void> {
  if (!config.email.apiKey) {
    throw new Error('RESEND_API_KEY is not configured.')
  }

  const url = config.app.url

  const templateMap: Record<EmailType, () => { subject: string; text: string; html: string }> = {
    welcome:       () => welcomeTemplate(url),
    day2_nudge:    () => day2NudgeTemplate(url),
    day7_api:      () => day7ApiTemplate(url),
  }

  const { subject, text, html } = templateMap[type]()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Resend error ${res.status}: ${err}`)
  }
}
