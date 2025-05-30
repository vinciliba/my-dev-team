/**
 * File Service
 * Comprehensive file system operations for AI agent development workflows
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface FileOperationOptions {
  createDirectories?: boolean;
  overwrite?: boolean;
  backup?: boolean;
  encoding?: BufferEncoding;
  mode?: number;
  flag?: string;
  signal?: AbortSignal;
  recursive?: boolean;
}

export interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  mode: number;
  uid: number;
  gid: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;
  checksum?: string;
  encoding?: string;
}

export interface FileSearchOptions {
  pattern?: RegExp | string;
  extensions?: string[];
  excludePatterns?: (RegExp | string)[];
  maxDepth?: number;
  includeDirectories?: boolean;
  includeHidden?: boolean;
  caseSensitive?: boolean;
  followSymlinks?: boolean;
  maxResults?: number;
}

export interface FileComparisonResult {
  identical: boolean;
  differences: FileDifference[];
  similarity: number; // 0-1
  metadata: {
    file1Size: number;
    file2Size: number;
    file1Modified: Date;
    file2Modified: Date;
  };
}

export interface FileDifference {
  type: 'added' | 'removed' | 'modified';
  lineNumber?: number;
  content?: string;
  oldContent?: string;
  newContent?: string;
}

export interface FileBackup {
  originalPath: string;
  backupPath: string;
  timestamp: Date;
  size: number;
  checksum: string;
  metadata: Record<string, any>;
}

export interface DirectoryListing {
  path: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: Date;
  permissions: string;
  extension?: string;
  hidden: boolean;
}

export interface FileTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: TemplateVariable[];
  tags: string[];
  category: string;
  language?: string;
  encoding: BufferEncoding;
  executable?: boolean;
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  required: boolean;
  defaultValue?: any;
  validation?: ValidationRule;
  options?: string[]; // For enum type
}

export interface ValidationRule {
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  customValidator?: (value: any) => boolean | string;
}

export interface FileWatchConfig {
  recursive?: boolean;
  followSymlinks?: boolean;
  ignoreInitial?: boolean;
  ignored?: string[];
  persistent?: boolean;
  usePolling?: boolean;
  interval?: number;
}

export interface BatchOperation {
  id: string;
  type: 'copy' | 'move' | 'delete' | 'create' | 'modify';
  sources: string[];
  destination?: string;
  options?: FileOperationOptions;
  progress: number; // 0-100
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  results: BatchOperationResult[];
}

export interface BatchOperationResult {
  source: string;
  destination?: string;
  success: boolean;
  error?: string;
  size?: number;
  duration: number;
}

export interface FileServiceConfig {
  tempDirectory?: string;
  backupDirectory?: string;
  maxFileSize?: number; // bytes
  allowedExtensions?: string[];
  blockedExtensions?: string[];
  enableBackups?: boolean;
  compressionLevel?: number;
  checksumAlgorithm?: 'md5' | 'sha1' | 'sha256' | 'sha512';
  watchConfig?: FileWatchConfig;
}

/**
 * Comprehensive file service for AI agent operations
 */
export class FileService extends EventEmitter {
  private logger: Logger;
  private config: FileServiceConfig;
  private backups: Map<string, FileBackup[]> = new Map();
  private templates: Map<string, FileTemplate> = new Map();
  private activeBatchOperations: Map<string, BatchOperation> = new Map();
  private fileWatchers: Map<string, any> = new Map(); // chokidar watchers

  constructor(config: FileServiceConfig = {}) {
    super();
    this.config = {
      tempDirectory: '/tmp',
      backupDirectory: '.backups',
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedExtensions: [],
      blockedExtensions: ['.exe', '.bat', '.cmd', '.scr'],
      enableBackups: true,
      compressionLevel: 6,
      checksumAlgorithm: 'sha256',
      ...config
    };
    this.logger = new Logger('FileService');
    
    this.logger.info('File Service initialized');
  }

  /**
   * Read file content
   */
  async readFile(filePath: string, options: FileOperationOptions = {}): Promise<string> {
    try {
      this.validateFilePath(filePath);
      this.checkFileExtension(filePath, 'read');
      
      const encoding = options.encoding || 'utf8';
      const content = await fs.readFile(filePath, { encoding, signal: options.signal });
      
      this.logger.debug(`File read: ${filePath} (${content.length} chars)`);
      this.emit('file-read', filePath, content.length);
      
      return content;
    } catch (error) {
      this.logger.error(`Failed to read file ${filePath}:`, error);
      this.emit('file-error', 'read', filePath, error);
      throw error;
    }
  }

  /**
   * Read file as buffer
   */
  async readFileBuffer(filePath: string, options: FileOperationOptions = {}): Promise<Buffer> {
    try {
      this.validateFilePath(filePath);
      
      const buffer = await fs.readFile(filePath, { signal: options.signal });
      
      this.logger.debug(`File buffer read: ${filePath} (${buffer.length} bytes)`);
      this.emit('file-read', filePath, buffer.length);
      
      return buffer;
    } catch (error) {
      this.logger.error(`Failed to read file buffer ${filePath}:`, error);
      this.emit('file-error', 'read', filePath, error);
      throw error;
    }
  }

  /**
   * Write file content
   */
  async writeFile(filePath: string, content: string | Buffer, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(filePath);
      this.checkFileExtension(filePath, 'write');
      this.checkFileSize(content);
      
      // Create backup if enabled
      if (this.config.enableBackups && options.backup !== false && await this.fileExists(filePath)) {
        await this.createBackup(filePath);
      }
      
      // Create directories if needed
      if (options.createDirectories !== false) {
        await this.ensureDirectory(path.dirname(filePath));
      }
      
      // Check overwrite policy
      if (!options.overwrite && await this.fileExists(filePath)) {
        throw new Error(`File already exists and overwrite is disabled: ${filePath}`);
      }
      
      const writeOptions: any = {
        encoding: options.encoding || 'utf8',
        mode: options.mode,
        flag: options.flag || 'w',
        signal: options.signal
      };
      
      await fs.writeFile(filePath, content, writeOptions);
      
      const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, writeOptions.encoding);
      this.logger.debug(`File written: ${filePath} (${size} bytes)`);
      this.emit('file-written', filePath, size);
      
    } catch (error) {
      this.logger.error(`Failed to write file ${filePath}:`, error);
      this.emit('file-error', 'write', filePath, error);
      throw error;
    }
  }

  /**
   * Append to file
   */
  async appendFile(filePath: string, content: string | Buffer, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(filePath);
      this.checkFileExtension(filePath, 'write');
      
      if (options.createDirectories !== false) {
        await this.ensureDirectory(path.dirname(filePath));
      }
      
      const appendOptions: any = {
        encoding: options.encoding || 'utf8',
        mode: options.mode,
        flag: options.flag || 'a',
        signal: options.signal
      };
      
      await fs.appendFile(filePath, content, appendOptions);
      
      const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, appendOptions.encoding);
      this.logger.debug(`File appended: ${filePath} (${size} bytes)`);
      this.emit('file-appended', filePath, size);
      
    } catch (error) {
      this.logger.error(`Failed to append to file ${filePath}:`, error);
      this.emit('file-error', 'append', filePath, error);
      throw error;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(filePath);
      
      // Create backup if enabled
      if (this.config.enableBackups && options.backup !== false) {
        await this.createBackup(filePath);
      }
      
      await fs.unlink(filePath);
      
      this.logger.debug(`File deleted: ${filePath}`);
      this.emit('file-deleted', filePath);
      
    } catch (error) {
      this.logger.error(`Failed to delete file ${filePath}:`, error);
      this.emit('file-error', 'delete', filePath, error);
      throw error;
    }
  }

  /**
   * Copy file
   */
  async copyFile(sourcePath: string, destinationPath: string, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(sourcePath);
      this.validateFilePath(destinationPath);
      
      if (options.createDirectories !== false) {
        await this.ensureDirectory(path.dirname(destinationPath));
      }
      
      if (!options.overwrite && await this.fileExists(destinationPath)) {
        throw new Error(`Destination file already exists: ${destinationPath}`);
      }
      
      await fs.copyFile(sourcePath, destinationPath);
      
      const stats = await this.getStats(destinationPath);
      this.logger.debug(`File copied: ${sourcePath} -> ${destinationPath} (${stats.size} bytes)`);
      this.emit('file-copied', sourcePath, destinationPath, stats.size);
      
    } catch (error) {
      this.logger.error(`Failed to copy file ${sourcePath} to ${destinationPath}:`, error);
      this.emit('file-error', 'copy', sourcePath, error);
      throw error;
    }
  }

  /**
   * Move file
   */
  async moveFile(sourcePath: string, destinationPath: string, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(sourcePath);
      this.validateFilePath(destinationPath);
      
      if (options.createDirectories !== false) {
        await this.ensureDirectory(path.dirname(destinationPath));
      }
      
      if (!options.overwrite && await this.fileExists(destinationPath)) {
        throw new Error(`Destination file already exists: ${destinationPath}`);
      }
      
      await fs.rename(sourcePath, destinationPath);
      
      this.logger.debug(`File moved: ${sourcePath} -> ${destinationPath}`);
      this.emit('file-moved', sourcePath, destinationPath);
      
    } catch (error) {
      this.logger.error(`Failed to move file ${sourcePath} to ${destinationPath}:`, error);
      this.emit('file-error', 'move', sourcePath, error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file statistics
   */
  async getStats(filePath: string): Promise<FileStats> {
    try {
      const stats = await fs.stat(filePath);
      
      const fileStats: FileStats = {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        atime: stats.atime,
        mtime: stats.mtime,
        ctime: stats.ctime,
        birthtime: stats.birthtime
      };
      
      // Calculate checksum for files
      if (fileStats.isFile && fileStats.size > 0) {
        fileStats.checksum = await this.calculateChecksum(filePath);
      }
      
      return fileStats;
    } catch (error) {
      this.logger.error(`Failed to get stats for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath: string, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(dirPath);
      
      await fs.mkdir(dirPath, {
        recursive: options.recursive !== false,
        mode: options.mode
      });
      
      this.logger.debug(`Directory created: ${dirPath}`);
      this.emit('directory-created', dirPath);
      
    } catch (error) {
      this.logger.error(`Failed to create directory ${dirPath}:`, error);
      this.emit('file-error', 'mkdir', dirPath, error);
      throw error;
    }
  }

  /**
   * Delete directory
   */
  async deleteDirectory(dirPath: string, options: FileOperationOptions = {}): Promise<void> {
    try {
      this.validateFilePath(dirPath);
      
      await fs.rmdir(dirPath, {
        recursive: options.recursive
      });
      
      this.logger.debug(`Directory deleted: ${dirPath}`);
      this.emit('directory-deleted', dirPath);
      
    } catch (error) {
      this.logger.error(`Failed to delete directory ${dirPath}:`, error);
      this.emit('file-error', 'rmdir', dirPath, error);
      throw error;
    }
  }

  /**
   * Read directory contents
   */
  async readDirectory(dirPath: string, options: FileOperationOptions = {}): Promise<string[]> {
    try {
      this.validateFilePath(dirPath);
      
      const entries = await fs.readdir(dirPath, { withFileTypes: false });
      
      this.logger.debug(`Directory read: ${dirPath} (${entries.length} entries)`);
      this.emit('directory-read', dirPath, entries.length);
      
      return entries as string[];
    } catch (error) {
      this.logger.error(`Failed to read directory ${dirPath}:`, error);
      this.emit('file-error', 'readdir', dirPath, error);
      throw error;
    }
  }

  /**
   * List directory with detailed information
   */
  async listDirectory(dirPath: string, options: FileOperationOptions = {}): Promise<DirectoryListing[]> {
    try {
      this.validateFilePath(dirPath);
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const listings: DirectoryListing[] = [];
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        
        const listing: DirectoryListing = {
          path: fullPath,
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
          size: stats.size,
          modified: stats.mtime,
          permissions: stats.mode.toString(8),
          hidden: entry.name.startsWith('.'),
          extension: entry.isFile() ? path.extname(entry.name) : undefined
        };
        
        listings.push(listing);
      }
      
      return listings;
    } catch (error) {
      this.logger.error(`Failed to list directory ${dirPath}:`, error);
      throw error;
    }
  }

  /**
   * Search for files
   */
  async searchFiles(rootPath: string, options: FileSearchOptions = {}): Promise<string[]> {
    try {
      this.validateFilePath(rootPath);
      
      const results: string[] = [];
      await this.searchFilesRecursive(rootPath, options, results, 0);
      
      // Limit results if specified
      if (options.maxResults && results.length > options.maxResults) {
        return results.slice(0, options.maxResults);
      }
      
      this.logger.debug(`File search completed: ${results.length} files found`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to search files in ${rootPath}:`, error);
      throw error;
    }
  }

  /**
   * Compare two files
   */
  async compareFiles(file1Path: string, file2Path: string): Promise<FileComparisonResult> {
    try {
      const [stats1, stats2] = await Promise.all([
        this.getStats(file1Path),
        this.getStats(file2Path)
      ]);
      
      const result: FileComparisonResult = {
        identical: false,
        differences: [],
        similarity: 0,
        metadata: {
          file1Size: stats1.size,
          file2Size: stats2.size,
          file1Modified: stats1.mtime,
          file2Modified: stats2.mtime
        }
      };
      
      // Quick comparison by size and checksum
      if (stats1.size !== stats2.size) {
        result.differences.push({
          type: 'modified',
          content: `File sizes differ: ${stats1.size} vs ${stats2.size}`
        });
      } else if (stats1.checksum === stats2.checksum) {
        result.identical = true;
        result.similarity = 1.0;
        return result;
      }
      
      // Detailed content comparison for text files
      if (this.isTextFile(file1Path) && this.isTextFile(file2Path)) {
        const [content1, content2] = await Promise.all([
          this.readFile(file1Path),
          this.readFile(file2Path)
        ]);
        
        result.differences = this.calculateTextDifferences(content1, content2);
        result.similarity = this.calculateSimilarity(content1, content2);
        result.identical = result.differences.length === 0;
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to compare files ${file1Path} and ${file2Path}:`, error);
      throw error;
    }
  }

  /**
   * Create file from template
   */
  async createFromTemplate(templateId: string, outputPath: string, variables: Record<string, any> = {}): Promise<void> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      // Validate variables
      this.validateTemplateVariables(template, variables);
      
      // Replace template variables
      let content = template.content;
      for (const variable of template.variables) {
        const value = variables[variable.name] ?? variable.defaultValue;
        if (value !== undefined) {
          const placeholder = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
          content = content.replace(placeholder, String(value));
        }
      }
      
      // Write file
      await this.writeFile(outputPath, content, {
        encoding: template.encoding,
        mode: template.executable ? 0o755 : 0o644
      });
      
      this.logger.info(`File created from template ${templateId}: ${outputPath}`);
      this.emit('template-used', templateId, outputPath);
      
    } catch (error) {
      this.logger.error(`Failed to create file from template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * Register file template
   */
  registerTemplate(template: FileTemplate): void {
    this.templates.set(template.id, template);
    this.logger.debug(`Template registered: ${template.id}`);
    this.emit('template-registered', template);
  }

  /**
   * Start batch operation
   */
  async startBatchOperation(operation: Omit<BatchOperation, 'id' | 'progress' | 'status' | 'results'>): Promise<string> {
    const batchOp: BatchOperation = {
      ...operation,
      id: this.generateId(),
      progress: 0,
      status: 'pending',
      results: []
    };
    
    this.activeBatchOperations.set(batchOp.id, batchOp);
    this.logger.info(`Batch operation started: ${batchOp.id} (${batchOp.type})`);
    
    // Start processing asynchronously
    this.processBatchOperation(batchOp).catch(error => {
      this.logger.error(`Batch operation failed: ${batchOp.id}`, error);
      batchOp.status = 'failed';
      batchOp.error = error.message;
      this.emit('batch-failed', batchOp);
    });
    
    return batchOp.id;
  }

  /**
   * Get batch operation status
   */
  getBatchOperation(operationId: string): BatchOperation | null {
    return this.activeBatchOperations.get(operationId) || null;
  }

  /**
   * Cancel batch operation
   */
  cancelBatchOperation(operationId: string): boolean {
    const operation = this.activeBatchOperations.get(operationId);
    if (!operation || operation.status === 'completed') {
      return false;
    }
    
    operation.status = 'cancelled';
    this.logger.info(`Batch operation cancelled: ${operationId}`);
    this.emit('batch-cancelled', operation);
    
    return true;
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath: string, algorithm?: string): Promise<string> {
    try {
      const hash = crypto.createHash(algorithm || this.config.checksumAlgorithm || 'sha256');
      const buffer = await this.readFileBuffer(filePath);
      hash.update(buffer);
      return hash.digest('hex');
    } catch (error) {
      this.logger.error(`Failed to calculate checksum for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Create backup of file
   */
  async createBackup(filePath: string): Promise<FileBackup> {
    try {
      if (!await this.fileExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const stats = await this.getStats(filePath);
      const timestamp = new Date();
      const backupName = `${path.basename(filePath)}.backup.${timestamp.getTime()}`;
      const backupPath = path.join(this.config.backupDirectory || '.backups', backupName);
      
      await this.ensureDirectory(path.dirname(backupPath));
      await this.copyFile(filePath, backupPath);
      
      const backup: FileBackup = {
        originalPath: filePath,
        backupPath,
        timestamp,
        size: stats.size,
        checksum: stats.checksum || '',
        metadata: {}
      };
      
      // Store backup record
      if (!this.backups.has(filePath)) {
        this.backups.set(filePath, []);
      }
      this.backups.get(filePath)!.push(backup);
      
      this.logger.debug(`Backup created: ${filePath} -> ${backupPath}`);
      this.emit('backup-created', backup);
      
      return backup;
    } catch (error) {
      this.logger.error(`Failed to create backup for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(filePath: string, backupIndex: number = 0): Promise<void> {
    try {
      const backupList = this.backups.get(filePath);
      if (!backupList || backupList.length === 0) {
        throw new Error(`No backups found for: ${filePath}`);
      }
      
      const backup = backupList[backupIndex];
      if (!backup) {
        throw new Error(`Backup index out of range: ${backupIndex}`);
      }
      
      await this.copyFile(backup.backupPath, filePath, { overwrite: true });
      
      this.logger.info(`File restored from backup: ${filePath}`);
      this.emit('backup-restored', backup);
      
    } catch (error) {
      this.logger.error(`Failed to restore backup for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get file backups
   */
  getBackups(filePath: string): FileBackup[] {
    return this.backups.get(filePath) || [];
  }

  /**
   * Clean up old backups
   */
  async cleanupBackups(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoffDate = new Date(Date.now() - maxAge);
    let cleanedCount = 0;
    
    for (const [filePath, backupList] of this.backups) {
      const toKeep = backupList.filter(backup => backup.timestamp > cutoffDate);
      const toDelete = backupList.filter(backup => backup.timestamp <= cutoffDate);
      
      for (const backup of toDelete) {
        try {
          await this.deleteFile(backup.backupPath);
          cleanedCount++;
        } catch (error) {
          this.logger.warn(`Failed to delete old backup: ${backup.backupPath}`, error);
        }
      }
      
      this.backups.set(filePath, toKeep);
    }
    
    this.logger.info(`Backup cleanup completed: ${cleanedCount} old backups removed`);
    this.emit('backups-cleaned', cleanedCount);
  }

  // Private helper methods

  private validateFilePath(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    
    if (filePath.includes('..')) {
      throw new Error('Path traversal not allowed');
    }
    
    if (path.isAbsolute(filePath) && !filePath.startsWith(process.cwd())) {
      // Allow access only within current working directory for security
      // In production, you might want to configure allowed root directories
    }
  }

  private checkFileExtension(filePath: string, operation: 'read' | 'write'): void {
    const ext = path.extname(filePath).toLowerCase();
    
    if (this.config.blockedExtensions && this.config.blockedExtensions.includes(ext)) {
      throw new Error(`File extension not allowed: ${ext}`);
    }
    
    if (this.config.allowedExtensions && this.config.allowedExtensions.length > 0) {
      if (!this.config.allowedExtensions.includes(ext)) {
        throw new Error(`File extension not in allowed list: ${ext}`);
      }
    }
  }

  private checkFileSize(content: string | Buffer): void {
    const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);
    
    if (this.config.maxFileSize && size > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed: ${size} > ${this.config.maxFileSize}`);
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await this.createDirectory(dirPath, { recursive: true });
    }
  }

  private async searchFilesRecursive(
    currentPath: string,
    options: FileSearchOptions,
    results: string[],
    depth: number
  ): Promise<void> {
    if (options.maxDepth && depth >= options.maxDepth) {
      return;
    }
    
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        // Skip hidden files if not included
        if (!options.includeHidden && entry.name.startsWith('.')) {
          continue;
        }
        
        // Check exclude patterns
        if (options.excludePatterns && this.matchesPatterns(entry.name, options.excludePatterns)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          if (options.includeDirectories && this.matchesSearchCriteria(entry.name, options)) {
            results.push(fullPath);
          }
          
          // Recurse into subdirectory
          await this.searchFilesRecursive(fullPath, options, results, depth + 1);
        } else if (entry.isFile()) {
          if (this.matchesSearchCriteria(entry.name, options)) {
            results.push(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Error reading directory ${currentPath}:`, error);
    }
  }

  private matchesSearchCriteria(fileName: string, options: FileSearchOptions): boolean {
    // Check pattern
    if (options.pattern) {
      const pattern = typeof options.pattern === 'string' 
        ? new RegExp(options.pattern, options.caseSensitive ? 'g' : 'gi')
        : options.pattern;
      
      if (!pattern.test(fileName)) {
        return false;
      }
    }
    
    // Check extensions
    if (options.extensions && options.extensions.length > 0) {
      const ext = path.extname(fileName).toLowerCase();
      if (!options.extensions.includes(ext)) {
        return false;
      }
    }
    
    return true;
  }

  private matchesPatterns(fileName: string, patterns: (RegExp | string)[]): boolean {
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return fileName.includes(pattern);
      } else {
        return pattern.test(fileName);
      }
    });
  }

  private isTextFile(filePath: string): boolean {
    const textExtensions = [
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.css',
      '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs', '.php', '.rb',
      '.yml', '.yaml', '.toml', '.ini', '.conf', '.cfg', '.log'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext);
  }

  private calculateTextDifferences(content1: string, content2: string): FileDifference[] {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    const differences: FileDifference[] = [];
    
    // Simple line-by-line comparison (in production, use a proper diff algorithm)
    const maxLines = Math.max(lines1.length, lines2.length);
    
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];
      
      if (line1 === undefined) {
        differences.push({
          type: 'added',
          lineNumber: i + 1,
          content: line2,
          newContent: line2
        });
      } else if (line2 === undefined) {
        differences.push({
          type: 'removed',
          lineNumber: i + 1,
          content: line1,
          oldContent: line1
        });
      } else if (line1 !== line2) {
        differences.push({
          type: 'modified',
          lineNumber: i + 1,
          oldContent: line1,
          newContent: line2
        });
      }
    }
    
    return differences;
  }

  private calculateSimilarity(content1: string, content2: string): number {
    // Simple similarity calculation (Jaccard similarity on words)
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private validateTemplateVariables(template: FileTemplate, variables: Record<string, any>): void {
    for (const variable of template.variables) {
      const value = variables[variable.name];
      
      // Check required variables
      if (variable.required && (value === undefined || value === null)) {
        throw new Error(`Required template variable missing: ${variable.name}`);
      }
      
      // Skip validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      switch (variable.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`Template variable ${variable.name} must be a string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number') {
            throw new Error(`Template variable ${variable.name} must be a number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`Template variable ${variable.name} must be a boolean`);
          }
          break;
        case 'date':
          if (!(value instanceof Date)) {
            throw new Error(`Template variable ${variable.name} must be a Date`);
          }
          break;
        case 'enum':
          if (variable.options && !variable.options.includes(value)) {
            throw new Error(`Template variable ${variable.name} must be one of: ${variable.options.join(', ')}`);
          }
          break;
      }
      
      // Custom validation
      if (variable.validation) {
        this.validateTemplateValue(variable.name, value, variable.validation);
      }
    }
  }

  private validateTemplateValue(name: string, value: any, validation: ValidationRule): void {
    if (validation.pattern && typeof value === 'string') {
      if (!validation.pattern.test(value)) {
        throw new Error(`Template variable ${name} does not match required pattern`);
      }
    }
    
    if (validation.minLength !== undefined && typeof value === 'string') {
      if (value.length < validation.minLength) {
        throw new Error(`Template variable ${name} must be at least ${validation.minLength} characters`);
      }
    }
    
    if (validation.maxLength !== undefined && typeof value === 'string') {
      if (value.length > validation.maxLength) {
        throw new Error(`Template variable ${name} must be at most ${validation.maxLength} characters`);
      }
    }
    
    if (validation.min !== undefined && typeof value === 'number') {
      if (value < validation.min) {
        throw new Error(`Template variable ${name} must be at least ${validation.min}`);
      }
    }
    
    if (validation.max !== undefined && typeof value === 'number') {
      if (value > validation.max) {
        throw new Error(`Template variable ${name} must be at most ${validation.max}`);
      }
    }
    
    if (validation.customValidator) {
      const result = validation.customValidator(value);
      if (result !== true) {
        const message = typeof result === 'string' ? result : `Template variable ${name} failed custom validation`;
        throw new Error(message);
      }
    }
  }

  private async processBatchOperation(operation: BatchOperation): Promise<void> {
    operation.status = 'running';
    operation.startTime = new Date();
    this.emit('batch-started', operation);
    
    const totalSources = operation.sources.length;
    let completedCount = 0;
    
    for (const source of operation.sources) {
      if (operation.status === 'cancelled') {
        break;
      }
      
      const startTime = Date.now();
      let result: BatchOperationResult;
      
      try {
        switch (operation.type) {
          case 'copy':
            if (!operation.destination) {
              throw new Error('Destination required for copy operation');
            }
            const copyDest = path.join(operation.destination, path.basename(source));
            await this.copyFile(source, copyDest, operation.options);
            const copyStats = await this.getStats(copyDest);
            result = {
              source,
              destination: copyDest,
              success: true,
              size: copyStats.size,
              duration: Date.now() - startTime
            };
            break;
            
          case 'move':
            if (!operation.destination) {
              throw new Error('Destination required for move operation');
            }
            const moveDest = path.join(operation.destination, path.basename(source));
            await this.moveFile(source, moveDest, operation.options);
            result = {
              source,
              destination: moveDest,
              success: true,
              duration: Date.now() - startTime
            };
            break;
            
          case 'delete':
            await this.deleteFile(source, operation.options);
            result = {
              source,
              success: true,
              duration: Date.now() - startTime
            };
            break;
            
          case 'create':
            await this.createDirectory(source, operation.options);
            result = {
              source,
              success: true,
              duration: Date.now() - startTime
            };
            break;
            
          default:
            throw new Error(`Unsupported batch operation type: ${operation.type}`);
        }
      } catch (error) {
        result = {
          source,
          destination: operation.destination,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime
        };
      }
      
      operation.results.push(result);
      completedCount++;
      operation.progress = (completedCount / totalSources) * 100;
      
      this.emit('batch-progress', operation, result);
    }
    
    operation.status = operation.status === 'cancelled' ? 'cancelled' : 'completed';
    operation.endTime = new Date();
    
    if (operation.status === 'completed') {
      this.emit('batch-completed', operation);
    }
    
    // Clean up after some time
    setTimeout(() => {
      this.activeBatchOperations.delete(operation.id);
    }, 300000); // 5 minutes
  }

  private generateId(): string {
    return `fs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get temporary file path
   */
  getTempPath(extension?: string): string {
    const fileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension || ''}`;
    return path.join(this.config.tempDirectory || '/tmp', fileName);
  }

  /**
   * Create temporary file
   */
  async createTempFile(content: string | Buffer, extension?: string): Promise<string> {
    const tempPath = this.getTempPath(extension);
    await this.writeFile(tempPath, content);
    this.logger.debug(`Temporary file created: ${tempPath}`);
    return tempPath;
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const tempDir = this.config.tempDirectory || '/tmp';
      const entries = await this.listDirectory(tempDir);
      const cutoffDate = new Date(Date.now() - maxAge);
      let cleanedCount = 0;
      
      for (const entry of entries) {
        if (entry.name.startsWith('temp_') && entry.modified < cutoffDate) {
          try {
            if (entry.type === 'file') {
              await this.deleteFile(entry.path);
            } else if (entry.type === 'directory') {
              await this.deleteDirectory(entry.path, { recursive: true });
            }
            cleanedCount++;
          } catch (error) {
            this.logger.debug(`Failed to clean temp file: ${entry.path}`, error);
          }
        }
      }
      
      this.logger.info(`Temporary files cleanup: ${cleanedCount} files removed`);
      this.emit('temp-files-cleaned', cleanedCount);
      
    } catch (error) {
      this.logger.error('Failed to cleanup temporary files:', error);
    }
  }

  /**
   * Get file MIME type
   */
  getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Watch file or directory for changes
   */
  watchPath(targetPath: string, callback: (event: string, filename: string) => void): string {
    const watchId = this.generateId();
    
    try {
      // Note: In a real implementation, you'd use chokidar or fs.watch
      // This is a simplified example
      const watcher = {
        close: () => {
          this.logger.debug(`File watcher stopped: ${targetPath}`);
        }
      };
      
      this.fileWatchers.set(watchId, watcher);
      this.logger.debug(`File watcher started: ${targetPath}`);
      
      return watchId;
    } catch (error) {
      this.logger.error(`Failed to watch path ${targetPath}:`, error);
      throw error;
    }
  }

  /**
   * Stop watching a path
   */
  unwatchPath(watchId: string): void {
    const watcher = this.fileWatchers.get(watchId);
    if (watcher) {
      watcher.close();
      this.fileWatchers.delete(watchId);
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalOperations: number;
    activeOperations: number;
    backupCount: number;
    templateCount: number;
    watcherCount: number;
    tempDirectory: string;
    backupDirectory: string;
  } {
    return {
      totalOperations: this.activeBatchOperations.size,
      activeOperations: Array.from(this.activeBatchOperations.values())
        .filter(op => op.status === 'running').length,
      backupCount: Array.from(this.backups.values()).reduce((sum, backups) => sum + backups.length, 0),
      templateCount: this.templates.size,
      watcherCount: this.fileWatchers.size,
      tempDirectory: this.config.tempDirectory || '/tmp',
      backupDirectory: this.config.backupDirectory || '.backups'
    };
  }

  /**
   * Shutdown service and cleanup resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down File Service...');
    
    // Stop all file watchers
    for (const [watchId] of this.fileWatchers) {
      this.unwatchPath(watchId);
    }
    
    // Cancel active batch operations
    for (const operation of this.activeBatchOperations.values()) {
      if (operation.status === 'running') {
        this.cancelBatchOperation(operation.id);
      }
    }
    
    // Cleanup temporary files
    await this.cleanupTempFiles();
    
    this.removeAllListeners();
    this.logger.info('File Service shutdown complete');
  }
}