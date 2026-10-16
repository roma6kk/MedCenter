/**
 * problem-parse — turns whatever an HTTP error response carried into a `ProblemDetails`.
 *
 * The edge can answer with something that is not problem+json (Traefik 502/504 HTML, a Next 404, an empty
 * body), and a service can send a code the client does not know yet. Neither may crash the UI: the status
 * is mapped to the closest catalogue code instead.
 */
import { ERROR_CODES, type ErrorCode, type FieldErrorDetail, type ProblemDetails } from './problem';

const STATUS_TITLES: Readonly<Record<number, string>> = {
  0: 'Нет связи с сервером',
  400: 'Некорректный запрос',
  401: 'Требуется вход',
  403: 'Недостаточно прав',
  404: 'Не найдено',
  405: 'Операция не поддерживается',
  409: 'Конфликт данных',
  422: 'Данные не прошли проверку',
  429: 'Слишком много запросов',
};

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as ReadonlyArray<string>).includes(value);
}

export function statusToErrorCode(status: number): ErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN_ROLE';
  if (status === 404) return 'NOT_FOUND';
  if (status === 405) return 'METHOD_NOT_ALLOWED';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL';
}

function parseDetails(value: unknown): ReadonlyArray<FieldErrorDetail> | undefined {
  if (!Array.isArray(value)) return undefined;
  const details: FieldErrorDetail[] = [];
  value.forEach((entry: unknown) => {
    if (!isRecord(entry)) return;
    const field: string | undefined = asString(entry['field']);
    const message: string | undefined = asString(entry['message']);
    if (field !== undefined && message !== undefined) details.push({ field, message });
  });
  return details.length > 0 ? details : undefined;
}

/** `Retry-After` is delta-seconds or an HTTP date (RFC 9110 §10.2.3). */
export function parseRetryAfter(raw: string | null | undefined, now: number = Date.now()): number | undefined {
  const value: string = raw?.trim() ?? '';
  if (value === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return seconds >= 0 ? Math.ceil(seconds) : undefined;
  }
  const date: number = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

function detailOf(record: UnknownRecord): string | undefined {
  const detail: string | undefined = asString(record['detail']);
  if (detail !== undefined) return detail;
  const message: unknown = record['message'];
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join('; ') || undefined;
  return asString(message);
}

/** Header access that tolerates a minimal `Response` (some test doubles carry no `Headers`). */
export function readHeader(response: Pick<Response, 'headers'>, name: string): string | null {
  const headers: Headers | undefined = response.headers;
  return headers?.get(name) ?? null;
}

export function parseProblem(response: Pick<Response, 'status' | 'headers'>, body: unknown): ProblemDetails {
  const record: UnknownRecord = isRecord(body) ? body : {};
  const errorCode: ErrorCode = isErrorCode(record['errorCode']) ? record['errorCode'] : statusToErrorCode(response.status);
  const retryAfter: number | undefined = parseRetryAfter(readHeader(response, 'retry-after'));
  return {
    type: asString(record['type']),
    title: asString(record['title']) ?? STATUS_TITLES[response.status] ?? 'Внутренняя ошибка',
    status: response.status,
    detail: detailOf(record),
    instance: asString(record['instance']),
    errorCode,
    requestId: asString(record['requestId']) ?? readHeader(response, 'x-request-id') ?? undefined,
    details: parseDetails(record['details']),
    ...(retryAfter === undefined ? {} : { retryAfter }),
  };
}

/** The problem for a request that never got a response (offline, DNS, CORS, aborted by the browser). */
export function networkProblem(): ProblemDetails {
  return { title: STATUS_TITLES[0] ?? 'Нет связи с сервером', status: 0, errorCode: 'INTERNAL' };
}
