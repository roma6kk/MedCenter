import { createHash } from 'node:crypto';

/**
 * Server-rendered login page of the authorization server (assumption UI-1):
 * no scripts, no external assets, inline CSS pinned by its hash in the CSP.
 * Palette follows the client's «Медицинская карта» tokens; the input border is
 * darkened to reach the 3:1 non-text contrast of WCAG 1.4.11.
 */
const LOGIN_PAGE_CSS = [
  ':root{color-scheme:light;--bg:#faf9f6;--card:#fff;--ink:#1c2b33;--muted:#5b6770;--primary:#0f766e;',
  '--primary-ink:#ecfdf5;--danger:#b3261e;--border:#e5e2d9;--field:#767d82}',
  '*{box-sizing:border-box}',
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;',
  'background:var(--bg);color:var(--ink);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
  'main{width:100%;max-width:24rem;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:2rem}',
  '.brand{margin:0;color:var(--muted);font-size:.875rem;letter-spacing:.04em;text-transform:uppercase}',
  'h1{margin:.25rem 0 1.5rem;font:700 1.5rem/1.25 "PT Serif",Georgia,"Times New Roman",serif}',
  'label{display:block;margin-top:1rem;font-weight:600;font-size:.9375rem}',
  'input{display:block;width:100%;margin-top:.375rem;padding:.625rem .75rem;font:inherit;color:inherit;',
  'background:var(--card);border:1px solid var(--field);border-radius:6px}',
  'input[aria-invalid=true]{border-color:var(--danger)}',
  'button{width:100%;margin-top:1.5rem;padding:.75rem 1rem;font:inherit;font-weight:600;cursor:pointer;',
  'color:var(--primary-ink);background:var(--primary);border:0;border-radius:6px}',
  'input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--primary);outline-offset:2px}',
  '.error{margin:0 0 .5rem;padding:.75rem;border:1px solid var(--danger);border-radius:6px;color:var(--danger)}',
  '.hint{margin:1.5rem 0 0;color:var(--muted);font-size:.9375rem}',
  'a{color:var(--primary)}',
].join('');

const CSS_HASH = createHash('sha256').update(LOGIN_PAGE_CSS).digest('base64');

/**
 * `form-action` is deliberately absent: Chromium applies it to the whole
 * redirect chain of the submission (`/oauth/login` → `/oauth/authorize` → the
 * client's `redirect_uri`), so `'self'` would block the final hop to the client.
 */
export const LOGIN_PAGE_CSP = [
  "default-src 'none'",
  `style-src 'sha256-${CSS_HASH}'`,
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export interface LoginPageParams {
  /** Sanitised authorization request, posted back so the flow resumes where it started. */
  readonly authorizeQuery: string;
  readonly csrfField: string;
  readonly error?: string;
  readonly email?: string;
  /** Registration page of the client the user came from. */
  readonly registerUrl?: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function layout(title: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(title)} — Лайфлайн</title>`,
    `<style>${LOGIN_PAGE_CSS}</style></head>`,
    `<body><main aria-labelledby="page-title"><p class="brand">Лайфлайн</p>${body}</main></body>`,
    '</html>',
  ].join('\n');
}

function errorBlock(error: string | undefined): string {
  return error === undefined ? '' : `<p id="login-error" class="error" role="alert">${escapeHtml(error)}</p>`;
}

function emailField(params: LoginPageParams): string {
  const invalid = params.error === undefined ? '' : ' aria-invalid="true" aria-describedby="login-error"';
  const value = escapeHtml(params.email ?? '');
  return [
    '<label for="email">Электронная почта</label>',
    `<input id="email" name="email" type="email" value="${value}" autocomplete="username" required maxlength="255" autofocus${invalid}>`,
  ].join('\n');
}

function registerHint(registerUrl: string | undefined): string {
  if (registerUrl === undefined) {
    return '';
  }
  return `<p class="hint">Нет аккаунта? <a href="${escapeHtml(registerUrl)}">Зарегистрироваться</a></p>`;
}

export function renderLoginPage(params: LoginPageParams): string {
  const form = [
    '<h1 id="page-title">Вход в систему</h1>',
    errorBlock(params.error),
    '<form method="post" action="/oauth/login">',
    `<input type="hidden" name="csrf" value="${escapeHtml(params.csrfField)}">`,
    `<input type="hidden" name="authorize_query" value="${escapeHtml(params.authorizeQuery)}">`,
    emailField(params),
    '<label for="password">Пароль</label>',
    '<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128">',
    '<button type="submit">Войти</button>',
    '</form>',
    registerHint(params.registerUrl),
  ];
  return layout('Вход', form.join('\n'));
}

/** Dead end of a login request that cannot be resumed (e.g. the authorize parameters are gone). */
export function renderLoginErrorPage(message: string): string {
  return layout('Ошибка входа', `<h1 id="page-title">Не удалось продолжить вход</h1>\n${errorBlock(message)}`);
}
