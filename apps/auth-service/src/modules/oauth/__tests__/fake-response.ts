import type { CookieOptions, Response } from 'express';

export interface SetCookie {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

/** Records what a handler did to an Express response: status, headers, body, cookies, redirect. */
export interface FakeResponse {
  readonly response: Response;
  readonly redirect: jest.Mock;
  readonly statusCode: () => number | undefined;
  readonly headers: Record<string, string>;
  readonly body: () => string | undefined;
  readonly cookies: SetCookie[];
  readonly cleared: string[];
  readonly redirectTarget: () => string | undefined;
}

interface RecordingResponse {
  readonly redirect: jest.Mock;
  readonly status: jest.Mock;
  readonly set: jest.Mock;
  readonly send: jest.Mock;
  readonly cookie: jest.Mock;
  readonly clearCookie: jest.Mock;
}

export function createFakeResponse(): FakeResponse {
  let status: number | undefined;
  let sent: string | undefined;
  const headers: Record<string, string> = {};
  const cookies: SetCookie[] = [];
  const cleared: string[] = [];
  const redirect = jest.fn();
  const response: RecordingResponse = {
    redirect,
    status: jest.fn((code: number) => {
      status = code;
      return response;
    }),
    set: jest.fn((values: Record<string, string>) => {
      Object.assign(headers, values);
      return response;
    }),
    send: jest.fn((html: string) => {
      sent = html;
      return response;
    }),
    cookie: jest.fn((name: string, value: string, options: CookieOptions) => {
      cookies.push({ name, value, options });
      return response;
    }),
    clearCookie: jest.fn((name: string) => {
      cleared.push(name);
      return response;
    }),
  };
  return {
    response: response as unknown as Response,
    redirect,
    statusCode: () => status,
    headers,
    body: () => sent,
    cookies,
    cleared,
    redirectTarget: () => {
      const call: unknown[] | undefined = redirect.mock.calls[0];
      const target = call?.[call.length - 1];
      return typeof target === 'string' ? target : undefined;
    },
  };
}

/** The hidden CSRF field of a rendered login page. */
export function csrfFieldOf(html: string | undefined): string {
  return /name="csrf" value="([^"]*)"/.exec(html ?? '')?.[1] ?? '';
}
