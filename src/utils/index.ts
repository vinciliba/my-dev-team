/**
 * Utils Index
 * Central export point for all utility functions and classes
 */

// Core utility classes
export { 
  Logger,
  createLogger,
  createFileLogger,
  createConsoleLogger,
  createCombinedLogger,
  defaultLogger
} from './logger';

// Helper functions - export everything from helpers
export * from './helpers';

// Re-export commonly used helpers with shorter names for convenience
export {
  generateId as createId,
  generateUUID as createUUID,
  generateSecureToken as createToken,
  sleep as delay,
  formatBytes as formatFileSize,
  formatDuration,
  debounce,
  throttle,
  retry,
  timeout,
  deepClone,
  deepMerge,
  isEmpty,
  isObject,
  pick,
  omit,
  groupBy,
  chunk,
  unique,
  sortBy,
  capitalize,
  camelCase,
  kebabCase,
  snakeCase,
  truncate,
  isValidEmail,
  isValidUrl,
  getEnv,
  getEnvBoolean,
  getEnvNumber,
  safeJsonParse,
  safeJsonStringify,
  memoize,
  asyncMemoize,
  createTimer,
  createRateLimiter,
  constants
} from './helpers';

// Additional utility functions specific to the project
/**
 * Sanitize filename for safe file operations
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w\s.-]/g, '') // Remove invalid characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .toLowerCase()
    .substring(0, 255); // Limit length for filesystem compatibility
}

/**
 * Validate path for security (prevents path traversal)
 */
export function isValidPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string' || filePath.length === 0) {
    return false;
  }
  
  // Check for path traversal attempts
  if (filePath.includes('..') || filePath.includes('//')) {
    return false;
  }
  
  // Check for absolute paths that might escape working directory
  if (filePath.startsWith('/') && !filePath.startsWith(process.cwd())) {
    return false;
  }
  
  // Check for invalid characters
  const invalidChars = ['<', '>', ':', '"', '|', '?', '*'];
  if (invalidChars.some(char => filePath.includes(char))) {
    return false;
  }
  
  return true;
}

/**
 * Create a safe filename from any string
 */
export function createSafeFileName(input: string, extension?: string): string {
  const sanitized = sanitizeFileName(input);
  const withExtension = extension ? `${sanitized}.${extension}` : sanitized;
  
  // Ensure filename is not empty
  return withExtension || `unnamed_${Date.now()}`;
}

/**
 * Validate email address with more comprehensive checking
 */
export function validateEmail(email: string): { valid: boolean; reason?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Email is required' };
  }
  
  if (email.length > 254) {
    return { valid: false, reason: 'Email is too long' };
  }
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }
  
  return { valid: true };
}

/**
 * Format timestamp for logging and display
 */
export function formatTimestamp(date: Date = new Date(), format: 'iso' | 'local' | 'short' = 'iso'): string {
  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'local':
      return date.toLocaleString();
    case 'short':
      return date.toLocaleTimeString();
    default:
      return date.toISOString();
  }
}

/**
 * Parse and validate JSON with error handling
 */
export function parseJson<T = any>(jsonString: string): { success: boolean; data?: T; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Invalid JSON'
    };
  }
}

/**
 * Create a human-readable error message
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (typeof error === 'object' && error !== null) {
    return JSON.stringify(error);
  }
  
  return 'Unknown error occurred';
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Get application version from package.json
 */
export function getAppVersion(): string {
  try {
    const packageJson = require('../../package.json');
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Create a correlation ID for request tracking
 */
export function createCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Mask sensitive data in logs
 */
export function maskSensitiveData(obj: any, sensitiveKeys: string[] = ['password', 'token', 'key', 'secret', 'auth']): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, sensitiveKeys));
  }
  
  const masked = { ...obj };
  
  for (const key in masked) {
    if (sensitiveKeys.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey.toLowerCase()))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key], sensitiveKeys);
    }
  }
  
  return masked;
}

/**
 * Convert object to query string
 */
export function toQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      params.append(key, String(value));
    }
  }
  
  return params.toString();
}

/**
 * Parse query string to object
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const params = new URLSearchParams(queryString);
  const result: Record<string, string> = {};
  
  for (const [key, value] of params) {
    result[key] = value;
  }
  
  return result;
}

/**
 * Ensure directory exists (create if it doesn't)
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  const fs = require('fs/promises');
  const path = require('path');
  
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : filename.substring(lastDotIndex);
}

/**
 * Remove file extension from filename
 */
export function removeFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex === -1 ? filename : filename.substring(0, lastDotIndex);
}

/**
 * Check if value is a valid port number
 */
export function isValidPort(port: any): boolean {
  const portNum = Number(port);
  return Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
}

/**
 * Generate a random string of specified length
 */
export function randomString(length: number = 8, chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Calculate percentage with specified decimal places
 */
export function calculatePercentage(value: number, total: number, decimals: number = 2): number {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
}

/**
 * Clamp a number between min and max values
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Convert camelCase to Title Case
 */
export function camelToTitle(camelCase: string): string {
  return camelCase
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Create a simple hash from string (for non-cryptographic purposes)
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Export types for TypeScript support
export type {
  LogLevel,
  LogEntry,
  LoggerConfig,
  LogOutput,
  ConsoleOutputConfig,
  FileOutputConfig,
  StreamOutputConfig,
  WebhookOutputConfig,
  DatabaseOutputConfig,
  LogMetrics,
  LogFilter
} from './logger';

// Export constants for easy access
export const APP_CONSTANTS = {
  ...constants,
  MAX_FILE_SIZE: 100 * constants.MB,
  MAX_LOG_SIZE: 50 * constants.MB,
  DEFAULT_TIMEOUT: 30 * constants.SECOND,
  RETRY_ATTEMPTS: 3,
  BATCH_SIZE: 100
} as const;