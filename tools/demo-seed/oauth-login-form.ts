import { OAuthFlowError } from './oauth-flow-error';

export interface LoginForm {
  readonly action: string;
  readonly csrf: string;
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

export function parseLoginForm(html: string): LoginForm {
  const csrf = readInputValue(html, 'csrf');
  const authorizeQuery = readInputValue(html, 'authorize_query');
  if (csrf === undefined || csrf.length === 0 || authorizeQuery === undefined || authorizeQuery.length === 0) {
    throw new OAuthFlowError('authorize', 'the page is not the login form (hidden csrf / authorize_query fields are missing)');
  }
  return { action: readFormAction(html), csrf, authorizeQuery };
}
