import { OAuthFlowError } from './oauth-flow-error';

/**
 * Reading of the authorization server's login page (`GET /oauth/authorize`
 * without a session answers HTML, not a redirect). The page is server-rendered
 * with fixed markup — `<form method="post" action="/oauth/login">` carrying two
 * hidden fields (`csrf`, `authorize_query`) — and every value is HTML-escaped,
 * so the fields are read with a tolerant attribute match and unescaped.
 */

export interface LoginForm {
  /** Where the credentials are posted (`/oauth/login`). */
  readonly action: string;
  /** Signed double-submit field; the matching nonce travels in the `mc_as_csrf` cookie. */
  readonly csrf: string;
  /** The sanitised authorization request the form was rendered for. */
  readonly authorizeQuery: string;
}

export const DEFAULT_LOGIN_ACTION = '/oauth/login';

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function unescapeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function attributeOf(tag: string, attribute: string): string | undefined {
  const match = new RegExp(`\\s${attribute}="([^"]*)"`).exec(tag);
  return match?.[1] === undefined ? undefined : unescapeHtml(match[1]);
}

/** `value` of the `<input name="...">` of the page, `undefined` when there is no such input. */
export function readInputValue(html: string, name: string): string | undefined {
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    if (attributeOf(tag, 'name') === name) {
      return attributeOf(tag, 'value');
    }
  }
  return undefined;
}

export function readFormAction(html: string): string {
  const form = /<form\b[^>]*>/.exec(html)?.[0];
  return (form === undefined ? undefined : attributeOf(form, 'action')) ?? DEFAULT_LOGIN_ACTION;
}

/** The login form of the page; a page without the hidden fields is not the login form. */
export function parseLoginForm(html: string): LoginForm {
  const csrf = readInputValue(html, 'csrf');
  const authorizeQuery = readInputValue(html, 'authorize_query');
  if (csrf === undefined || csrf.length === 0 || authorizeQuery === undefined || authorizeQuery.length === 0) {
    throw new OAuthFlowError('authorize', 'the page is not the login form (hidden csrf / authorize_query fields are missing)');
  }
  return { action: readFormAction(html), csrf, authorizeQuery };
}
