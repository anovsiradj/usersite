/**
 * Logger for UserSite extension
 * Ring-buffer logger that surfaces errors in the dashboard.
 * Also delegates to console.* so devtools output is preserved.
 */

const MAX_ENTRIES = 50;

export class Logger {
  constructor() {
    this._buffer = [];
  }

  _append(level, message, data) {
    const entry = {
      level,
      message,
      data: data !== undefined ? data : null,
      timestamp: Date.now(),
    };
    this._buffer.push(entry);
    if (this._buffer.length > MAX_ENTRIES) {
      this._buffer.shift(); // drop oldest
    }
  }

  info(message, data) {
    console.info('[UserSite]', message, ...(data !== undefined ? [data] : []));
    this._append('info', message, data);
  }

  warn(message, data) {
    console.warn('[UserSite]', message, ...(data !== undefined ? [data] : []));
    this._append('warn', message, data);
  }

  error(message, data) {
    console.error('[UserSite]', message, ...(data !== undefined ? [data] : []));
    this._append('error', message, data);
  }

  getLogs() {
    return [...this._buffer];
  }

  clearLogs() {
    this._buffer = [];
  }
}

export const logger = new Logger();
