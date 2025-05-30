/**
 * Logger Utility
 * Comprehensive logging system for AI agent development workflows
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { formatDuration, getTimestamp, createDeferred } from './helpers';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, any>;
  error?: Error;
  stack?: string;
  pid?: number;
  hostname?: string;
  requestId?: string;
}

export interface LoggerConfig {
  name: string;
  level: LogLevel;
  outputs: LogOutput[];
  enableColors?: boolean;
  enableTimestamp?: boolean;
  enableContext?: boolean;
  enableMetadata?: boolean;
  dateFormat?: string;
  maxFileSize?: number; // bytes
  maxFiles?: number;
  rotateOnStart?: boolean;
  bufferSize?: number;
  flushInterval?: number; // ms
}

export interface LogOutput {
  type: 'console' | 'file' | 'stream' | 'webhook' | 'database';
  level?: LogLevel;
  config: ConsoleOutputConfig | FileOutputConfig | StreamOutputConfig | WebhookOutputConfig | DatabaseOutputConfig;
}

export interface ConsoleOutputConfig {
  colorize?: boolean;
  timestamp?: boolean;
  format?: 'json' | 'text' | 'pretty';
}

export interface FileOutputConfig {
  filename: string;
  format?: 'json' | 'text';
  rotate?: boolean;
  maxSize?: number;
  maxFiles?: number;
  compress?: boolean;
}

export interface StreamOutputConfig {
  stream: NodeJS.WritableStream;
  format?: 'json' | 'text';
}

export interface WebhookOutputConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  batchSize?: number;
  flushInterval?: number;
  timeout?: number;
}

export interface DatabaseOutputConfig {
  connectionString: string;
  table: string;
  batchSize?: number;
  flushInterval?: number;
}

export interface LogMetrics {
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  errorsPerMinute: number;
  averageLogsPerSecond: number;
  lastLogTime: Date | null;
  uptime: number;
}

export interface LogFilter {
  level?: LogLevel[];
  context?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
  metadata?: Record<string, any>;
}

/**
 * Comprehensive logging system with multiple outputs and advanced features
 */
export class Logger extends EventEmitter {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private metrics: LogMetrics;
  private flushTimer: NodeJS.Timeout | null = null;
  private rotationPromises = new Map<string, Promise<void>>();
  private isShuttingDown = false;
  
  // Color codes for console output
  private readonly colors = {
    debug: '\x1b[36m',    // Cyan
    info: '\x1b[32m',     // Green
    warn: '\x1b[33m',     // Yellow
    error: '\x1b[31m',    // Red
    fatal: '\x1b[35m',    // Magenta
    reset: '\x1b[0m',     // Reset
    bold: '\x1b[1m',      // Bold
    dim: '\x1b[2m'        // Dim
  };

  // Log level priorities for filtering
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
  };

  constructor(name: string, config?: Partial<LoggerConfig>) {
    super();
    
    this.config = {
      name,
      level: 'info',
      outputs: [
        {
          type: 'console',
          config: {
            colorize: true,
            timestamp: true,
            format: 'pretty'
          }
        }
      ],
      enableColors: true,
      enableTimestamp: true,
      enableContext: true,
      enableMetadata: true,
      dateFormat: 'iso',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      rotateOnStart: false,
      bufferSize: 100,
      flushInterval: 1000,
      ...config
    };

    this.metrics = this.initializeMetrics();
    this.startFlushTimer();
    
    // Handle process exit
    process.on('exit', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, metadata?: Record<string, any>): void {
    const logMetadata = { ...metadata };
    
    if (error) {
      if (error instanceof Error) {
        logMetadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      } else {
        logMetadata.error = error;
      }
    }
    
    this.log('error', message, logMetadata, error);
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error | any, metadata?: Record<string, any>): void {
    const logMetadata = { ...metadata };
    
    if (error) {
      if (error instanceof Error) {
        logMetadata.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
      } else {
        logMetadata.error = error;
      }
    }
    
    this.log('fatal', message, logMetadata, error);
  }

  /**
   * Create child logger with additional context
   */
  child(context: string, metadata?: Record<string, any>): Logger {
    const childConfig = {
      ...this.config,
      name: `${this.config.name}:${context}`
    };
    
    const child = new Logger(childConfig.name, childConfig);
    
    // Override log method to include additional metadata
    const originalLog = child.log.bind(child);
    child.log = (level: LogLevel, message: string, logMetadata?: Record<string, any>, error?: Error) => {
      const combinedMetadata = { ...metadata, ...logMetadata };
      originalLog(level, message, combinedMetadata, error);
    };
    
    return child;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.emit('level-changed', level);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Add log output
   */
  addOutput(output: LogOutput): void {
    this.config.outputs.push(output);
    this.emit('output-added', output);
  }

  /**
   * Remove log output
   */
  removeOutput(type: LogOutput['type']): void {
    this.config.outputs = this.config.outputs.filter(output => output.type !== type);
    this.emit('output-removed', type);
  }

  /**
   * Get log metrics
   */
  getMetrics(): LogMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Query logs with filters
   */
  async queryLogs(filter: LogFilter, limit?: number): Promise<LogEntry[]> {
    // This is a simplified implementation
    // In production, you'd query from persistent storage
    return this.buffer
      .filter(entry => this.matchesFilter(entry, filter))
      .slice(0, limit || 1000);
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.buffer.length = 0;
    this.emit('buffer-cleared');
  }

  /**
   * Force flush all pending logs
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const entries = [...this.buffer];
    this.buffer.length = 0;
    
    await Promise.all(
      this.config.outputs.map(output => this.writeToOutput(output, entries))
    );
    
    this.emit('flushed', entries.length);
  }

  /**
   * Shutdown logger gracefully
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush remaining logs
    await this.flush();
    
    // Wait for any pending rotations
    await Promise.all(this.rotationPromises.values());
    
    this.removeAllListeners();
    this.emit('shutdown');
  }

  // Private methods

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): void {
    // Check if log level should be processed
    if (this.levelPriority[level] < this.levelPriority[this.config.level]) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: this.config.name,
      metadata: this.config.enableMetadata ? metadata : undefined,
      error,
      stack: error?.stack,
      pid: process.pid,
      hostname: require('os').hostname()
    };
    
    // Add to buffer
    this.buffer.push(entry);
    this.updateMetrics();
    
    // Emit log event
    this.emit('log', entry);
    
    // Check if immediate flush is needed
    if (level === 'fatal' || level === 'error') {
      setImmediate(() => this.flush());
    } else if (this.buffer.length >= this.config.bufferSize!) {
      setImmediate(() => this.flush());
    }
  }

  /**
   * Write log entries to specific output
   */
  private async writeToOutput(output: LogOutput, entries: LogEntry[]): Promise<void> {
    try {
      // Filter entries by output level
      const filteredEntries = output.level 
        ? entries.filter(entry => this.levelPriority[entry.level] >= this.levelPriority[output.level!])
        : entries;
      
      if (filteredEntries.length === 0) return;
      
      switch (output.type) {
        case 'console':
          await this.writeToConsole(output.config as ConsoleOutputConfig, filteredEntries);
          break;
        case 'file':
          await this.writeToFile(output.config as FileOutputConfig, filteredEntries);
          break;
        case 'stream':
          await this.writeToStream(output.config as StreamOutputConfig, filteredEntries);
          break;
        case 'webhook':
          await this.writeToWebhook(output.config as WebhookOutputConfig, filteredEntries);
          break;
        case 'database':
          await this.writeToDatabase(output.config as DatabaseOutputConfig, filteredEntries);
          break;
      }
    } catch (error) {
      console.error(`Logger output error (${output.type}):`, error);
      this.emit('output-error', output.type, error);
    }
  }

  /**
   * Write to console output
   */
  private async writeToConsole(config: ConsoleOutputConfig, entries: LogEntry[]): Promise<void> {
    for (const entry of entries) {
      let output: string;
      
      switch (config.format) {
        case 'json':
          output = JSON.stringify(entry);
          break;
        case 'text':
          output = this.formatTextEntry(entry, config);
          break;
        case 'pretty':
        default:
          output = this.formatPrettyEntry(entry, config);
          break;
      }
      
      // Write to appropriate stream
      if (entry.level === 'error' || entry.level === 'fatal') {
        process.stderr.write(output + '\n');
      } else {
        process.stdout.write(output + '\n');
      }
    }
  }

  /**
   * Write to file output
   */
  private async writeToFile(config: FileOutputConfig, entries: LogEntry[]): Promise<void> {
    const filename = config.filename;
    
    // Check if rotation is needed
    if (config.rotate && config.maxSize) {
      await this.rotateFileIfNeeded(filename, config.maxSize, config.maxFiles || 5);
    }
    
    // Format entries
    const lines = entries.map(entry => {
      const formatted = config.format === 'json' 
        ? JSON.stringify(entry)
        : this.formatTextEntry(entry);
      return formatted;
    });
    
    // Write to file
    const content = lines.join('\n') + '\n';
    await fs.appendFile(filename, content, 'utf8');
  }

  /**
   * Write to stream output
   */
  private async writeToStream(config: StreamOutputConfig, entries: LogEntry[]): Promise<void> {
    for (const entry of entries) {
      const formatted = config.format === 'json' 
        ? JSON.stringify(entry)
        : this.formatTextEntry(entry);
      
      const written = config.stream.write(formatted + '\n');
      
      if (!written) {
        // Handle backpressure
        await new Promise(resolve => config.stream.once('drain', resolve));
      }
    }
  }

  /**
   * Write to webhook output
   */
  private async writeToWebhook(config: WebhookOutputConfig, entries: LogEntry[]): Promise<void> {
    const payload = {
      logs: entries,
      source: this.config.name,
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: JSON.stringify(payload),
      timeout: config.timeout || 5000
    });
    
    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Write to database output
   */
  private async writeToDatabase(config: DatabaseOutputConfig, entries: LogEntry[]): Promise<void> {
    // This is a placeholder - implement based on your database choice
    console.log(`Database logging not implemented for ${entries.length} entries`);
  }

  /**
   * Format log entry as text
   */
  private formatTextEntry(entry: LogEntry, config?: ConsoleOutputConfig): string {
    const parts: string[] = [];
    
    // Timestamp
    if (config?.timestamp !== false && this.config.enableTimestamp) {
      parts.push(`[${entry.timestamp.toISOString()}]`);
    }
    
    // Level
    parts.push(`[${entry.level.toUpperCase()}]`);
    
    // Context
    if (this.config.enableContext && entry.context) {
      parts.push(`[${entry.context}]`);
    }
    
    // Message
    parts.push(entry.message);
    
    // Metadata
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      parts.push(JSON.stringify(entry.metadata));
    }
    
    // Error stack
    if (entry.stack) {
      parts.push(`\n${entry.stack}`);
    }
    
    return parts.join(' ');
  }

  /**
   * Format log entry with colors and nice formatting
   */
  private formatPrettyEntry(entry: LogEntry, config: ConsoleOutputConfig): string {
    const useColors = config.colorize && this.config.enableColors;
    const levelColor = useColors ? this.colors[entry.level] : '';
    const resetColor = useColors ? this.colors.reset : '';
    const dimColor = useColors ? this.colors.dim : '';
    
    let output = '';
    
    // Timestamp
    if (config.timestamp !== false && this.config.enableTimestamp) {
      const timestamp = entry.timestamp.toISOString().replace('T', ' ').replace('Z', '');
      output += `${dimColor}${timestamp}${resetColor} `;
    }
    
    // Level with color
    const levelBadge = `[${entry.level.toUpperCase()}]`.padEnd(7);
    output += `${levelColor}${levelBadge}${resetColor} `;
    
    // Context
    if (this.config.enableContext && entry.context) {
      output += `${dimColor}${entry.context}${resetColor} `;
    }
    
    // Message
    output += entry.message;
    
    // Metadata
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += ` ${dimColor}${JSON.stringify(entry.metadata)}${resetColor}`;
    }
    
    // Error details
    if (entry.error) {
      output += `\n${levelColor}Error: ${entry.error.message || entry.error}${resetColor}`;
    }
    
    // Stack trace
    if (entry.stack && entry.level === 'error') {
      const stackLines = entry.stack.split('\n').slice(1); // Skip first line (already in error)
      output += `\n${dimColor}${stackLines.join('\n')}${resetColor}`;
    }
    
    return output;
  }

  /**
   * Rotate log file if needed
   */
  private async rotateFileIfNeeded(filename: string, maxSize: number, maxFiles: number): Promise<void> {
    try {
      const stats = await fs.stat(filename);
      
      if (stats.size >= maxSize) {
        // Check if rotation is already in progress
        if (this.rotationPromises.has(filename)) {
          await this.rotationPromises.get(filename);
          return;
        }
        
        const rotationPromise = this.performRotation(filename, maxFiles);
        this.rotationPromises.set(filename, rotationPromise);
        
        await rotationPromise;
        this.rotationPromises.delete(filename);
      }
    } catch (error) {
      // File doesn't exist yet, no rotation needed
    }
  }

  /**
   * Perform actual file rotation
   */
  private async performRotation(filename: string, maxFiles: number): Promise<void> {
    // Move existing rotated files
    for (let i = maxFiles - 1; i >= 1; i--) {
      const oldFile = `${filename}.${i}`;
      const newFile = `${filename}.${i + 1}`;
      
      try {
        await fs.access(oldFile);
        if (i === maxFiles - 1) {
          await fs.unlink(oldFile); // Delete oldest file
        } else {
          await fs.rename(oldFile, newFile);
        }
      } catch {
        // File doesn't exist, skip
      }
    }
    
    // Move current file to .1
    try {
      await fs.rename(filename, `${filename}.1`);
    } catch {
      // Current file doesn't exist, no need to rotate
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        if (this.buffer.length > 0) {
          this.flush().catch(error => {
            console.error('Logger flush error:', error);
            this.emit('flush-error', error);
          });
        }
      }, this.config.flushInterval);
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): LogMetrics {
    return {
      totalLogs: 0,
      logsByLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        fatal: 0
      },
      errorsPerMinute: 0,
      averageLogsPerSecond: 0,
      lastLogTime: null,
      uptime: Date.now()
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    this.metrics.totalLogs++;
    this.metrics.lastLogTime = new Date();
    
    // Calculate logs per second
    const uptimeSeconds = (Date.now() - this.metrics.uptime) / 1000;
    this.metrics.averageLogsPerSecond = this.metrics.totalLogs / uptimeSeconds;
  }

  /**
   * Check if log entry matches filter
   */
  private matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
    // Level filter
    if (filter.level && !filter.level.includes(entry.level)) {
      return false;
    }
    
    // Context filter
    if (filter.context && entry.context && !filter.context.includes(entry.context)) {
      return false;
    }
    
    // Time range filter
    if (filter.timeRange) {
      if (entry.timestamp < filter.timeRange.start || entry.timestamp > filter.timeRange.end) {
        return false;
      }
    }
    
    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      if (!entry.message.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    
    // Metadata filter
    if (filter.metadata && entry.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (entry.metadata[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  }
}

/**
 * Create a logger instance with default configuration
 */
export function createLogger(name: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger(name, config);
}

/**
 * Create a file logger
 */
export function createFileLogger(name: string, filename: string, level: LogLevel = 'info'): Logger {
  return new Logger(name, {
    level,
    outputs: [
      {
        type: 'file',
        config: {
          filename,
          format: 'json',
          rotate: true,
          maxSize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }
      }
    ]
  });
}

/**
 * Create a console logger with pretty formatting
 */
export function createConsoleLogger(name: string, level: LogLevel = 'info'): Logger {
  return new Logger(name, {
    level,
    outputs: [
      {
        type: 'console',
        config: {
          colorize: true,
          timestamp: true,
          format: 'pretty'
        }
      }
    ]
  });
}

/**
 * Create a combined logger (console + file)
 */
export function createCombinedLogger(
  name: string, 
  filename: string, 
  level: LogLevel = 'info'
): Logger {
  return new Logger(name, {
    level,
    outputs: [
      {
        type: 'console',
        level: 'info', // Only show info+ in console
        config: {
          colorize: true,
          timestamp: true,
          format: 'pretty'
        }
      },
      {
        type: 'file',
        config: {
          filename,
          format: 'json',
          rotate: true,
          maxSize: 10 * 1024 * 1024,
          maxFiles: 5
        }
      }
    ]
  });
}

// Export default logger instance
export const defaultLogger = createConsoleLogger('default');