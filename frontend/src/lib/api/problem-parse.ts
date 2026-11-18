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

const STATUS_ERROR_CODES: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN_ROLE',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

export function statusToErrorCode(status: number): ErrorCode {
  return STATUS_ERROR_CODES[status] ?? 'INTERNAL';
}

function parseDetails(value: unknown): ReadonlyArray<FieldErrorDetail> | undefined {
  if (!Array.isArray(value)) return undefined;
  const details = value.flatMap((entry: unknown): FieldErrorDetail[] => {
    const field = isRecord(entry) ? asString(entry['field']) : undefined;
    const message = isRecord(entry) ? asString(entry['message']) : undefined;
    return field !== undefined && message !== undefined ? [{ field, message }] : [];
  });
  return details.length > 0 ? details : undefined;
}

export function parseRetryAfter(raw: string | null | undefined, now: number = Date.now()): number | undefined {
  const value = raw?.trim() ?? '';
  if (value === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return seconds >= 0 ? Math.ceil(seconds) : undefined;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

function detailOf(record: UnknownRecord): string | undefined {
  const detail = asString(record['detail']);
  if (detail !== undefined) return detail;
  const message = record['message'];
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join('; ') || undefined;
  return asString(message);
}

function readHeader(response: Pick<Response, 'headers'>, name: string): string | null {
  return (response.headers as Headers | undefined)?.get(name) ?? null;
}

export function parseProblem(response: Pick<Response, 'status' | 'headers'>, body: unknown): ProblemDetails {
  const record = isRecord(body) ? body : {};
  const errorCode = isErrorCode(record['errorCode']) ? record['errorCode'] : statusToErrorCode(response.status);
  const retryAfter = parseRetryAfter(readHeader(response, 'retry-after'));
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

export function networkProblem(): ProblemDetails {
  return { title: STATUS_TITLES[0] ?? 'Нет связи с сервером', status: 0, errorCode: 'INTERNAL' };
}

export function serviceUnavailableProblem(): ProblemDetails {
  return { title: 'Сервис временно недоступен', status: 503, errorCode: 'INTERNAL' };
}
