import { createHash } from 'node:crypto';

import { DEFAULT_LOGIN_LOCALE, type LoginLocale } from './login-messages';

export const LOGIN_FONT_BASE_PATH = '/oauth/assets/fonts';
export const LOGIN_FONT_FILES = { cyrillic: 'onest-cyrillic.woff2', latin: 'onest-latin.woff2' } as const;

const LOGIN_PAGE_CSS = [
  '@font-face{font-family:"Onest Variable";font-style:normal;font-display:swap;font-weight:100 900;',
  `src:url(${LOGIN_FONT_BASE_PATH}/${LOGIN_FONT_FILES.cyrillic}) format("woff2-variations");`,
  'unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}',
  '@font-face{font-family:"Onest Variable";font-style:normal;font-display:swap;font-weight:100 900;',
  `src:url(${LOGIN_FONT_BASE_PATH}/${LOGIN_FONT_FILES.latin}) format("woff2-variations");`,
  'unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}',
  ':root{color-scheme:light dark;--bg:oklch(97.5% .003 197);--card:oklch(100% 0 0);--ink:oklch(25% .026 221);',
  '--muted:oklch(47% .026 222);--primary:oklch(51% .088 186);--primary-hover:oklch(45% .078 186);--primary-strong:oklch(39% .068 186);',
  '--primary-ink:oklch(100% 0 0);--primary-soft:oklch(94.6% .016 183);--warm-soft:oklch(94.5% .032 55);',
  '--danger:oklch(50% .178 29);--danger-soft:oklch(94.8% .02 25);--border:oklch(91.3% .009 206);--field:oklch(62% .02 219);',
  '--halo:oklch(51% .088 186/.28);--shadow:0 2px 4px oklch(25% .03 221/.06),0 8px 24px oklch(25% .03 221/.1)}',
  '@media (prefers-color-scheme:dark){:root{--bg:oklch(20% .017 217);--card:oklch(24.5% .022 221);--ink:oklch(93.7% .009 206);',
  '--muted:oklch(74.4% .022 212);--primary:oklch(69.6% .11 184);--primary-hover:oklch(75% .115 184);--primary-strong:oklch(80% .11 184);',
  '--primary-ink:oklch(22.5% .035 185);--primary-soft:oklch(32.2% .046 186);--warm-soft:oklch(29% .05 45);',
  '--danger:oklch(74.5% .127 26);--danger-soft:oklch(27.5% .05 25);--border:oklch(33% .027 215);--field:oklch(60.3% .029 212);',
  '--halo:oklch(69.6% .11 184/.4);--shadow:0 2px 4px oklch(8% .02 221/.4),0 8px 24px oklch(8% .02 221/.5)}}',
  '*{box-sizing:border-box}',
  'body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;',
  'padding:1.5rem 1rem;color:var(--ink);font:400 1rem/1.5 "Onest Variable",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
  '-webkit-font-smoothing:antialiased;background-color:var(--bg);',
  'background-image:radial-gradient(42rem 28rem at 100% 0,var(--warm-soft),transparent 70%),radial-gradient(40rem 30rem at 0 100%,var(--primary-soft),transparent 70%)}',
  '.back{display:flex;align-items:center;gap:.375rem;width:100%;max-width:26rem;min-height:44px;padding:0 .25rem;border-radius:10px;color:var(--muted);font-size:.9375rem;font-weight:500;text-decoration:none}',
  '.back:hover{color:var(--ink);text-decoration:underline}',
  'main{width:100%;max-width:26rem;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:2rem;box-shadow:var(--shadow)}',
  '.brand{display:inline-flex;align-items:center;gap:.625rem;min-height:44px;margin:0 0 1.25rem;color:var(--ink);font-size:1.125rem;font-weight:700;text-decoration:none}',
  '.mark{flex:none}.mark .ring{fill:var(--primary-soft);stroke:var(--primary)}.mark .leaf{fill:var(--primary)}',
  '.mark .leaf2{fill:var(--primary-soft);stroke:var(--primary)}.mark .core{fill:var(--card);stroke:var(--primary)}.mark .stem{fill:none;stroke:var(--primary)}',
  'h1{margin:0;font-size:1.625rem;font-weight:700;line-height:1.2;letter-spacing:-.015em;text-wrap:balance}',
  '.lead{margin:.5rem 0 0;color:var(--muted);font-size:.9375rem;text-wrap:pretty}',
  'label{display:block;margin-top:1.25rem;font-weight:600;font-size:.9375rem}',
  'input{display:block;width:100%;min-height:48px;margin-top:.375rem;padding:.625rem .875rem;font:inherit;color:inherit;',
  'background:var(--card);border:1px solid var(--field);border-radius:10px;transition:border-color .12s,box-shadow .12s}',
  'input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--halo)}',
  'input[aria-invalid=true]{border-color:var(--danger)}',
  '.pw{position:relative}.pw input{padding-right:3.25rem}',
  '.toggle{position:absolute;right:.25rem;bottom:2px;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;',
  'color:var(--muted);background:none;border:0;border-radius:10px;cursor:pointer}',
  '.toggle[hidden]{display:none}.toggle:hover{color:var(--ink);background:var(--primary-soft)}',
  '.toggle .off,.toggle[aria-pressed=true] .on{display:none}.toggle[aria-pressed=true] .off{display:block}',
  '.submit{display:block;width:100%;min-height:52px;margin-top:1.75rem;padding:.75rem 1rem;font:inherit;font-weight:600;cursor:pointer;',
  'color:var(--primary-ink);background:var(--primary);border:0;border-radius:10px;transition:background-color .12s,transform .12s}',
  '.submit:hover{background:var(--primary-hover)}.submit:active{background:var(--primary-strong);transform:scale(.98)}',
  'input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--primary);outline-offset:2px}',
  'input:focus-visible{outline:none}',
  '.error{display:flex;gap:.5rem;margin:1.25rem 0 0;padding:.75rem;border-radius:10px;color:var(--danger);background:var(--danger-soft);font-size:.9375rem}',
  '.error svg{flex:none;margin-top:.125rem}',
  '.hint{margin:1.5rem 0 0;color:var(--muted);font-size:.9375rem}',
  '.hint a{display:inline-flex;align-items:center;min-height:44px;color:var(--primary);font-weight:600}',
  '@media (prefers-reduced-motion:reduce){*{transition:none!important}}',
].join('');

const LOGIN_PAGE_SCRIPT = [
  '(function(){var b=document.getElementById("pw-toggle"),i=document.getElementById("password");if(!b||!i){return}',
  'b.hidden=false;b.addEventListener("click",function(){var s=i.type==="password";i.type=s?"text":"password";',
  'b.setAttribute("aria-pressed",s?"true":"false")})})();',
].join('');

interface LoginText {
  readonly lang: string;
  readonly brand: string;
  readonly toSite: string;
  readonly title: string;
  readonly heading: string;
  readonly lead: string;
  readonly email: string;
  readonly password: string;
  readonly showPassword: string;
  readonly submit: string;
  readonly noAccount: string;
  readonly register: string;
  readonly errorTitle: string;
  readonly errorHeading: string;
}

const LOGIN_TEXT: Readonly<Record<LoginLocale, LoginText>> = {
  ru: {
    lang: 'ru',
    brand: 'Лайфлайн',
    toSite: 'На сайт',
    title: 'Вход',
    heading: 'Вход в личный кабинет',
    lead: 'Запись на приём, история приёмов и назначения врача — в одном месте.',
    email: 'Электронная почта',
    password: 'Пароль',
    showPassword: 'Показать пароль',
    submit: 'Войти',
    noAccount: 'Нет аккаунта?',
    register: 'Зарегистрироваться',
    errorTitle: 'Ошибка входа',
    errorHeading: 'Не удалось продолжить вход',
  },
  en: {
    lang: 'en',
    brand: 'Lifeline',
    toSite: 'Back to the site',
    title: 'Sign in',
    heading: 'Sign in to your account',
    lead: 'Appointments, your visit history and your doctor’s orders in one place.',
    email: 'E-mail',
    password: 'Password',
    showPassword: 'Show password',
    submit: 'Sign in',
    noAccount: 'No account yet?',
    register: 'Register',
    errorTitle: 'Sign-in error',
    errorHeading: 'Could not continue signing in',
  },
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('base64');

// No form-action: Chromium applies it to the whole redirect chain, so 'self' would block the final hop to the client.
export const LOGIN_PAGE_CSP = [
  "default-src 'none'",
  `style-src 'sha256-${sha256(LOGIN_PAGE_CSS)}'`,
  `script-src 'sha256-${sha256(LOGIN_PAGE_SCRIPT)}'`,
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

interface LoginPageParams {
  readonly authorizeQuery: string;
  readonly csrfField: string;
  readonly error?: string;
  readonly fieldError?: boolean;
  readonly email?: string;
  readonly locale?: LoginLocale;
  readonly registerUrl?: string;
  readonly siteUrl?: string;
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

const LEAF_PATH = 'M0 -34 C30 -58 34 -118 0 -176 C-34 -118 -30 -58 0 -34 Z';
const OUTER_ANGLES: ReadonlyArray<number> = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

function brandMark(size: number): string {
  const outer = OUTER_ANGLES.map((angle) => `<path class="leaf" d="${LEAF_PATH}" transform="rotate(${angle}) scale(1.45)"/>`).join('');
  const inner = OUTER_ANGLES.map(
    (angle) => `<path class="leaf2" stroke-width="6" d="${LEAF_PATH}" transform="rotate(${angle + 15}) scale(0.9)"/>`,
  ).join('');
  const sprout = 'M0 0 C13 -8 16 -26 0 -34 C-16 -26 -13 -8 0 0 Z';
  return [
    `<svg class="mark" aria-hidden="true" focusable="false" width="${size}" height="${size}" viewBox="0 0 640 640">`,
    '<circle class="ring" cx="320" cy="320" r="290" stroke-width="14"/>',
    `<g transform="translate(320 320)">${outer}${inner}`,
    '<circle class="core" r="56" stroke-width="12"/>',
    '<path class="stem" d="M0 26 V6" stroke-width="9" stroke-linecap="round"/>',
    `<path class="leaf" d="${sprout}" transform="translate(0 8) rotate(-40)"/>`,
    `<path class="leaf" d="${sprout}" transform="translate(0 8) rotate(40)"/>`,
    '</g></svg>',
  ].join('');
}

function eyeIcons(): string {
  const attrs = 'width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  return [
    `<svg class="on" ${attrs}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    `<svg class="off" ${attrs}><path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6C3.7 8.4 2 12 2 12s3.6 8 10 8c1.7 0 3.2-.5 4.5-1.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/></svg>`,
  ].join('');
}

function layout(title: string, body: string, siteUrl: string | undefined, text: LoginText): string {
  const back =
    siteUrl === undefined ? '' : `<a class="back" href="${escapeHtml(siteUrl)}"><span aria-hidden="true">←</span> ${escapeHtml(text.toSite)}</a>`;
  const home = siteUrl === undefined ? '<span class="brand">' : `<a class="brand" href="${escapeHtml(siteUrl)}">`;
  const homeEnd = siteUrl === undefined ? '</span>' : '</a>';
  return [
    '<!doctype html>',
    `<html lang="${text.lang}">`,
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="color-scheme" content="light dark">',
    `<link rel="preload" href="${LOGIN_FONT_BASE_PATH}/${LOGIN_FONT_FILES.cyrillic}" as="font" type="font/woff2" crossorigin>`,
    `<title>${escapeHtml(title)} — ${text.brand}</title>`,
    `<style>${LOGIN_PAGE_CSS}</style></head>`,
    `<body>${back}<main aria-labelledby="page-title">${home}${brandMark(40)}${text.brand}${homeEnd}${body}</main>`,
    `<script>${LOGIN_PAGE_SCRIPT}</script></body>`,
    '</html>',
  ].join('\n');
}

const ALERT_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';

function errorBlock(error: string | undefined): string {
  return error === undefined
    ? ''
    : `<p id="login-error" class="error" role="alert">${ALERT_ICON}<span>${escapeHtml(error)}</span></p>`;
}

function emailField(params: LoginPageParams, text: LoginText): string {
  const invalid = params.error !== undefined && params.fieldError === true ? ' aria-invalid="true" aria-describedby="login-error"' : '';
  const value = escapeHtml(params.email ?? '');
  return [
    `<label for="email">${text.email}</label>`,
    `<input id="email" name="email" type="email" value="${value}" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="255" autofocus${invalid}>`,
  ].join('\n');
}

function passwordField(params: LoginPageParams, text: LoginText): string {
  const invalid = params.error !== undefined && params.fieldError === true ? ' aria-invalid="true" aria-describedby="login-error"' : '';
  return [
    `<label for="password">${text.password}</label>`,
    '<div class="pw">',
    `<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128"${invalid}>`,
    `<button type="button" id="pw-toggle" class="toggle" hidden aria-pressed="false" aria-controls="password" aria-label="${text.showPassword}">${eyeIcons()}</button>`,
    '</div>',
  ].join('\n');
}

function registerHint(registerUrl: string | undefined, text: LoginText): string {
  if (registerUrl === undefined) {
    return '';
  }
  return `<p class="hint">${text.noAccount} <a href="${escapeHtml(registerUrl)}">${text.register}</a></p>`;
}

export function renderLoginPage(params: LoginPageParams): string {
  const text = LOGIN_TEXT[params.locale ?? DEFAULT_LOGIN_LOCALE];
  const form = [
    `<h1 id="page-title">${text.heading}</h1>`,
    `<p class="lead">${text.lead}</p>`,
    errorBlock(params.error),
    '<form method="post" action="/oauth/login">',
    `<input type="hidden" name="csrf" value="${escapeHtml(params.csrfField)}">`,
    `<input type="hidden" name="authorize_query" value="${escapeHtml(params.authorizeQuery)}">`,
    emailField(params, text),
    passwordField(params, text),
    `<button type="submit" class="submit">${text.submit}</button>`,
    '</form>',
    registerHint(params.registerUrl, text),
  ];
  return layout(text.title, form.join('\n'), params.siteUrl, text);
}

export function renderLoginErrorPage(message: string, locale: LoginLocale = DEFAULT_LOGIN_LOCALE): string {
  const text = LOGIN_TEXT[locale];
  return layout(text.errorTitle, `<h1 id="page-title">${text.errorHeading}</h1>\n${errorBlock(message)}`, undefined, text);
}
