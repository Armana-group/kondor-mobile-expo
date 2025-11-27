/**
 * Logger utility with dev/prod modes
 * Only logs in development, silent in production
 */

const isDev = __DEV__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix?: string;
  enabled?: boolean;
}

class Logger {
  private prefix: string;
  private enabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.enabled = options.enabled ?? isDev;
  }

  private formatMessage(level: LogLevel, ...args: any[]): string[] {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    return [`${timestamp} ${prefix}`, ...args];
  }

  debug(...args: any[]) {
    if (this.enabled) {
      console.log(...this.formatMessage('debug', ...args));
    }
  }

  info(...args: any[]) {
    if (this.enabled) {
      console.info(...this.formatMessage('info', ...args));
    }
  }

  warn(...args: any[]) {
    if (this.enabled) {
      console.warn(...this.formatMessage('warn', ...args));
    }
  }

  error(...args: any[]) {
    // Always log errors, even in production
    console.error(...this.formatMessage('error', ...args));
  }
}

// Create pre-configured loggers for different modules
export const createLogger = (prefix: string) => new Logger({ prefix });

// Default loggers for common modules
export const logger = new Logger();
export const walletLogger = createLogger('Wallet');
export const koinosLogger = createLogger('Koinos');
export const tokenLogger = createLogger('Token');
export const txLogger = createLogger('Transaction');
export const cryptoLogger = createLogger('Crypto');

export default logger;
