export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogContext = 'AUTH' | 'PROVIDER' | 'DATABASE' | 'WEBSOCKET' | 'ERROR' | 'SYNC' | 'GENERAL';

// Hardcoded log level - change this to control logging
const DEFAULT_LOG_LEVEL: LogLevel = 'DEBUG';

interface LogData {
  level: LogLevel;
  context: LogContext;
  message: string;
  timestamp?: string;
  [key: string]: any;
}

class Logger {
  private logLevel: LogLevel;
  private readonly logLevels: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  constructor(env?: any) {
    // Use hardcoded log level
    this.logLevel = DEFAULT_LOG_LEVEL;
  }

  private isValidLogLevel(level: string): level is LogLevel {
    return ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level);
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  private formatLog(level: LogLevel, context: LogContext, message: string, metadata: Record<string, any> = {}): LogData {
    return {
      level,
      context,
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    };
  }

  debug(context: LogContext, message: string, metadata: Record<string, any> = {}) {
    if (this.shouldLog('DEBUG')) {
      console.log(this.formatLog('DEBUG', context, message, metadata));
    }
  }

  info(context: LogContext, message: string, metadata: Record<string, any> = {}) {
    if (this.shouldLog('INFO')) {
      console.log(this.formatLog('INFO', context, message, metadata));
    }
  }

  warn(context: LogContext, message: string, metadata: Record<string, any> = {}) {
    if (this.shouldLog('WARN')) {
      console.log(this.formatLog('WARN', context, message, metadata));
    }
  }

  error(context: LogContext, message: string, metadata: Record<string, any> = {}) {
    if (this.shouldLog('ERROR')) {
      console.log(this.formatLog('ERROR', context, message, metadata));
    }
  }

  // Convenience method for errors with Error objects
  logError(context: LogContext, message: string, error: Error, metadata: Record<string, any> = {}) {
    this.error(context, message, {
      error_message: error.message,
      stack_trace: error.stack,
      ...metadata
    });
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export function getLogger(env?: any): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(env);
  }
  return loggerInstance;
}

// For cases where we need to reset the logger (testing, environment changes)
export function resetLogger(): void {
  loggerInstance = null;
}
