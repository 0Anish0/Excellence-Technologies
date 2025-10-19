export interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export const createLogger = (isDebug: boolean = false): Logger => {
  return {
    debug: (...args: any[]) => {
      if (isDebug) {
        console.log('[Chat Debug]', ...args);
      }
    },
    info: (...args: any[]) => {
      console.log('[Chat Info]', ...args);
    },
    warn: (...args: any[]) => {
      console.warn('[Chat Warn]', ...args);
    },
    error: (...args: any[]) => {
      console.error('[Chat Error]', ...args);
    }
  };
}; 