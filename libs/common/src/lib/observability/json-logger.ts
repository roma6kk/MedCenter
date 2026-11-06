import type { LoggerService } from '@nestjs/common';

import { currentRequestId } from './request-scope';

type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const SEVERITY: Readonly<Record<Level, number>> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

const SECRET_KEY = /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Error);
}

function flattenError(error: Error, depth: number): Record<string, unknown> {
  const flat: Record<string, unknown> = { name: error.name, message: error.message, stack: error.stack };
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && depth < MAX_DEPTH) {
    flat['cause'] = sanitize(cause, depth + 1);
  }
  return flat;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return flattenError(value, depth);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (depth >= MAX_DEPTH || typeof value !== 'object' || value === null) {
    return typeof value === 'object' && value !== null ? '[truncated]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    copy[key] = SECRET_KEY.test(key) ? REDACTED : sanitize(inner, depth + 1);
  }
  return copy;
}

function parseLevel(raw: string | undefined): Level {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'verbose' || value === 'trace') {
    return 'debug';
  }
  if (value === 'log') {
    return 'info';
  }
  return value in SEVERITY ? (value as Level) : 'info';
}

export interface JsonLoggerOptions {
  readonly level?: string;
  readonly pretty?: boolean;
  readonly write?: (line: string, level: Level) => void;
  readonly now?: () => Date;
}

export class JsonLogger implements LoggerService {
  private readonly threshold: number;
  private readonly pretty: boolean;
  private readonly write: (line: string, level: Level) => void;
  private readonly now: () => Date;

  constructor(
    private readonly service: string,
    options: JsonLoggerOptions = {},
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.threshold = SEVERITY[parseLevel(options.level ?? env['LOG_LEVEL'])];
    this.pretty = options.pretty ?? env['NODE_ENV'] === 'development';
    this.now = options.now ?? (() => new Date());
    this.write =
      options.write ??
      ((line, level) => {
        (SEVERITY[level] >= SEVERITY.error ? process.stderr : process.stdout).write(`${line}\n`);
      });
  }

  log(message: unknown, ...optional: unknown[]): void {
    this.emit('info', message, optional);
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.emit('error', message, optional);
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.emit('warn', message, optional);
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.emit('debug', message, optional);
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.emit('debug', message, optional);
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    this.emit('fatal', message, optional);
  }

  private emit(level: Level, message: unknown, optional: unknown[]): void {
    if (SEVERITY[level] < this.threshold) {
      return;
    }
    const rest = [...optional];
    let fields: Record<string, unknown> = {};
    let msg: string;
    let context: string | undefined;

    if (isPlainObject(message) || message instanceof Error) {
      // pino style: ({ fields }, 'message', ...args) — the string after the object is the text, not a context.
      const text = typeof rest[0] === 'string' ? (rest.shift() as string) : undefined;
      if (message instanceof Error) {
        fields = { err: sanitize(message) as Record<string, unknown> };
        msg = text ?? message.message;
      } else {
        fields = sanitize(message) as Record<string, unknown>;
        msg = text ?? '';
      }
    } else {
      // Nest style: (message, ...optional, context?) and, for errors, (message, stack, context?).
      msg = typeof message === 'string' ? message : String(sanitizeToText(message));
      if (rest.length > 0 && typeof rest[rest.length - 1] === 'string') {
        context = rest.pop() as string;
      }
      if (level === 'error' || level === 'fatal') {
        const stack = rest.find((item): item is string => typeof item === 'string');
        if (stack !== undefined) {
          fields = { stack };
          rest.splice(rest.indexOf(stack), 1);
        }
      }
    }
    for (const extra of rest) {
      if (extra instanceof Error) {
        fields = { ...fields, err: sanitize(extra) };
      } else if (isPlainObject(extra)) {
        fields = { ...fields, ...(sanitize(extra) as Record<string, unknown>) };
      }
    }
    const requestId = currentRequestId();
    const entry: Record<string, unknown> = {
      time: this.now().toISOString(),
      level,
      service: this.service,
      ...(context === undefined ? {} : { context }),
      msg,
      ...(requestId === undefined ? {} : { requestId }),
      ...fields,
    };
    this.write(this.pretty ? prettyLine(entry) : safeStringify(entry), level);
  }
}

function sanitizeToText(value: unknown): string {
  try {
    return JSON.stringify(sanitize(value)) ?? String(value);
  } catch {
    return String(value);
  }
}

function safeStringify(entry: Record<string, unknown>): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ time: entry['time'], level: entry['level'], service: entry['service'], msg: entry['msg'] });
  }
}

function prettyLine(entry: Record<string, unknown>): string {
  const { time, level, service, context, msg, requestId, ...fields } = entry;
  const head = `${String(time)} ${String(level).toUpperCase()} [${String(context ?? service)}]`;
  const id = requestId === undefined ? '' : ` (${String(requestId)})`;
  const extra = Object.keys(fields).length > 0 ? ` ${safeStringify(fields)}` : '';
  return `${head}${id} ${String(msg)}${extra}`;
}
