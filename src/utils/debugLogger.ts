interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

class DebugLogger {
  private buffer: LogEntry[] = [];
  private maxSize = 500;
  private index = 0;
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
  };

  constructor() {
    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    this.overrideConsole();
  }

  private overrideConsole(): void {
    console.log = (...args: unknown[]) => {
      this.addLog('info', args);
      this.originalConsole.log(...args);
    };

    console.warn = (...args: unknown[]) => {
      this.addLog('warn', args);
      this.originalConsole.warn(...args);
    };

    console.error = (...args: unknown[]) => {
      this.addLog('error', args);
      this.originalConsole.error(...args);
    };
  }

  private safeStringify(obj: unknown): string {
    if (obj === null || obj === undefined) {
      return String(obj);
    }
    
    if (typeof obj !== 'object') {
      return String(obj);
    }
    
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      if (obj instanceof Element) {
        return `<${obj.tagName}${Array.from(obj.attributes).map(attr => ` ${attr.name}="${attr.value}"`).join('')}>`;
      }
      return '[Circular or unstringifiable object]';
    }
  }

  private addLog(level: 'info' | 'warn' | 'error', args: unknown[]): void {
    const timestamp = this.formatTimestamp(new Date());
    const message = args.map(arg => this.safeStringify(arg)).join(' ');

    const entry: LogEntry = { timestamp, level, message };

    if (this.buffer.length < this.maxSize) {
      this.buffer.push(entry);
    } else {
      this.buffer[this.index] = entry;
      this.index = (this.index + 1) % this.maxSize;
    }
  }

  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  public getLogs(): string[] {
    return this.buffer.map(entry => 
      `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`
    );
  }

  public clearLogs(): void {
    this.buffer = [];
    this.index = 0;
  }

  public getFormattedLogs(): string {
    return this.getLogs().join('\n');
  }

  public restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
  }
}

export const debugLogger = new DebugLogger();
export default debugLogger;
