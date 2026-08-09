/**
 * MiMo Core — Centralised Logger
 * ------------------------------
 * Single logging interface for the whole Core. No `console.log` scattered
 * across modules. Later this can be swapped for file/remote transport
 * without touching call sites.
 *
 * See: MIMO_ENGINEERING_SPEC.md §9 (Logging)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  readonly module?: string;
  readonly correlationId?: string;
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  /** Create a child logger that always attaches the given module/correlationId. */
  child(meta: LogMeta): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
    ? 'info'
    : 'debug') as LogLevel;

function format(level: LogLevel, message: string, meta: LogMeta): string {
  const ts = new Date().toISOString();
  const metaStr =
    Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] ${level.toUpperCase()} ${message}${metaStr}`;
}

class ConsoleLogger implements Logger {
  constructor(private readonly baseMeta: LogMeta = {}) {}

  private log(level: LogLevel, message: string, meta?: LogMeta): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
    const merged: LogMeta = { ...this.baseMeta, ...meta };
    const formatted = format(level, message, merged);
    const sink =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(formatted);
  }

  debug(message: string, meta?: LogMeta): void {
    this.log('debug', message, meta);
  }
  info(message: string, meta?: LogMeta): void {
    this.log('info', message, meta);
  }
  warn(message: string, meta?: LogMeta): void {
    this.log('warn', message, meta);
  }
  error(message: string, meta?: LogMeta): void {
    this.log('error', message, meta);
  }

  child(meta: LogMeta): Logger {
    return new ConsoleLogger({ ...this.baseMeta, ...meta });
  }
}

/** Singleton root logger. Use `.child({ module: '...' })` per module. */
export const rootLogger: Logger = new ConsoleLogger();

/** Convenience factory for module-scoped loggers. */
export function createLogger(module: string): Logger {
  return rootLogger.child({ module });
}
