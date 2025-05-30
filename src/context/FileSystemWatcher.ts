import { FileChange } from '../types/Projects';
import { Logger } from '../utils/logger';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fs from 'fs/promises';
import { Stats } from 'fs'; // Import Stats from 'fs' instead of 'fs/promises'

export interface WatcherConfig {
  ignoreInitial?: boolean;
  ignored?: string[];
  persistent?: boolean;
  followSymlinks?: boolean;
  cwd?: string;
  depth?: number;
  awaitWriteFinish?: boolean | {
    stabilityThreshold: number;
    pollInterval: number;
  };
  ignorePermissionErrors?: boolean;
  atomic?: boolean | number;
  usePolling?: boolean;
  interval?: number;
  binaryInterval?: number;
}

export interface WatcherStats {
  totalWatched: number;
  filesWatched: number;
  directoriesWatched: number;
  events: {
    add: number;
    change: number;
    unlink: number;
    addDir: number;
    unlinkDir: number;
    ready: number;
    error: number;
  };
  startTime: Date;
  uptime: number;
}

export interface FileSystemEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'ready' | 'error';
  path: string;
  stats?: Stats; // Now using Stats from 'fs'
  error?: Error;
  timestamp: Date;
}

export type WatcherEventCallback = (event: FileSystemEvent) => void;
export type FileChangeCallback = (change: FileChange) => void;

/**
 * Advanced file system watcher with intelligent filtering and event handling
 */
export class FileSystemWatcher {
  private workspaceRoot: string;
  private watcher: chokidar.FSWatcher | null = null;
  private logger: Logger;
  private config: WatcherConfig;
  private isWatching: boolean = false;
  private stats: WatcherStats;
  
  // Event listeners
  private eventCallbacks: WatcherEventCallback[] = [];
  private fileChangeCallbacks: FileChangeCallback[] = [];
  
  // Debouncing and throttling
  private pendingChanges = new Map<string, NodeJS.Timeout>();
  private debounceDelay: number = 100; // ms
  private recentEvents = new Map<string, Date>();
  private throttleWindow: number = 50; // ms
  
  // File patterns and filters
  private watchPatterns: string[] = [];
  private defaultIgnorePatterns: string[] = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/__pycache__/**',
    '**/.pytest_cache/**',
    '**/target/**',
    '**/bin/**',
    '**/obj/**',
    '**/*.tmp',
    '**/*.temp',
    '**/*.log',
    '**/.DS_Store',
    '**/Thumbs.db'
  ];

  constructor(workspaceRoot: string, config: WatcherConfig = {}) {
    this.workspaceRoot = workspaceRoot;
    this.logger = new Logger('FileSystemWatcher');
    this.config = this.mergeConfig(config);
    this.stats = this.initializeStats();
    
    this.logger.info(`FileSystemWatcher initialized for: ${workspaceRoot}`);
  }

  /**
   * Start watching the file system
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      this.logger.warn('Watcher is already running');
      return;
    }

    this.logger.info('Starting file system watcher...');
    
    try {
      await this.validateWorkspaceRoot();
      this.setupWatchPatterns();
      this.createWatcher();
      this.setupEventHandlers();
      
      this.isWatching = true;
      this.stats.startTime = new Date();
      
      this.logger.info(`File system watcher started successfully`);
    } catch (error) {
      this.logger.error('Failed to start file system watcher:', error);
      throw error;
    }
  }

  /**
   * Stop watching the file system
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      this.logger.warn('Watcher is not running');
      return;
    }

    this.logger.info('Stopping file system watcher...');
    
    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }
      
      this.clearPendingChanges();
      this.isWatching = false;
      
      this.logger.info('File system watcher stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping file system watcher:', error);
      throw error;
    }
  }

  /**
   * Restart the watcher
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Add file patterns to watch
   */
  addWatchPattern(pattern: string): void {
    if (!this.watchPatterns.includes(pattern)) {
      this.watchPatterns.push(pattern);
      this.logger.debug(`Added watch pattern: ${pattern}`);
      
      if (this.isWatching) {
        this.watcher?.add(pattern);
      }
    }
  }

  /**
   * Remove file patterns from watching
   */
  removeWatchPattern(pattern: string): void {
    const index = this.watchPatterns.indexOf(pattern);
    if (index > -1) {
      this.watchPatterns.splice(index, 1);
      this.logger.debug(`Removed watch pattern: ${pattern}`);
      
      if (this.isWatching) {
        this.watcher?.unwatch(pattern);
      }
    }
  }

  /**
   * Get current watch patterns
   */
  getWatchPatterns(): string[] {
    return [...this.watchPatterns];
  }

  /**
   * Add event listener for all file system events
   */
  onEvent(callback: WatcherEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Add event listener for file changes (compatible with ProjectContext)
   */
  onFileChange(callback: FileChangeCallback): void {
    this.fileChangeCallbacks.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: WatcherEventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  /**
   * Remove file change listener
   */
  removeFileChangeListener(callback: FileChangeCallback): void {
    const index = this.fileChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.fileChangeCallbacks.splice(index, 1);
    }
  }

  /**
   * Get watcher statistics
   */
  getStats(): WatcherStats {
    if (this.isWatching) {
      this.stats.uptime = Date.now() - this.stats.startTime.getTime();
    }
    return { ...this.stats };
  }

  /**
   * Check if watcher is currently active
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Force trigger a file change event (for testing)
   */
  triggerFileChange(filePath: string, changeType: FileChange['type']): void {
    const change: FileChange = {
      path: path.relative(this.workspaceRoot, filePath),
      type: changeType,
      timestamp: new Date()
    };
    
    this.notifyFileChangeListeners(change);
  }

  /**
   * Get list of currently watched files
   */
  getWatchedPaths(): string[] {
    return this.watcher ? Object.keys(this.watcher.getWatched()) : [];
  }

  /**
   * Update watcher configuration
   */
  updateConfig(newConfig: Partial<WatcherConfig>): void {
    this.config = this.mergeConfig({ ...this.config, ...newConfig });
    this.logger.info('Watcher configuration updated');
    
    if (this.isWatching) {
      this.logger.info('Restarting watcher to apply new configuration...');
      this.restart();
    }
  }

  /**
   * Set debounce delay for file change events
   */
  setDebounceDelay(delay: number): void {
    this.debounceDelay = Math.max(0, delay);
    this.logger.debug(`Debounce delay set to ${this.debounceDelay}ms`);
  }

  /**
   * Set throttle window for event processing
   */
  setThrottleWindow(window: number): void {
    this.throttleWindow = Math.max(0, window);
    this.logger.debug(`Throttle window set to ${this.throttleWindow}ms`);
  }

  // Private methods

  private mergeConfig(config: WatcherConfig): WatcherConfig {
    return {
      ignoreInitial: true,
      ignored: [...this.defaultIgnorePatterns, ...(config.ignored || [])],
      persistent: true,
      followSymlinks: false,
      depth: 99,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      },
      ignorePermissionErrors: true,
      atomic: true,
      usePolling: false,
      ...config
    };
  }

  private initializeStats(): WatcherStats {
    return {
      totalWatched: 0,
      filesWatched: 0,
      directoriesWatched: 0,
      events: {
        add: 0,
        change: 0,
        unlink: 0,
        addDir: 0,
        unlinkDir: 0,
        ready: 0,
        error: 0
      },
      startTime: new Date(),
      uptime: 0
    };
  }

  private async validateWorkspaceRoot(): Promise<void> {
    try {
      const stat = await fs.stat(this.workspaceRoot);
      if (!stat.isDirectory()) {
        throw new Error(`Workspace root is not a directory: ${this.workspaceRoot}`);
      }
    } catch (error) {
      throw new Error(`Invalid workspace root: ${this.workspaceRoot} - ${error}`);
    }
  }

  private setupWatchPatterns(): void {
    if (this.watchPatterns.length === 0) {
      // Default patterns for common source files
      this.watchPatterns = [
        path.join(this.workspaceRoot, '**/*.{ts,tsx,js,jsx}'),
        path.join(this.workspaceRoot, '**/*.{py,java,cpp,c,cs,go,rs}'),
        path.join(this.workspaceRoot, '**/*.{json,yaml,yml,toml,xml}'),
        path.join(this.workspaceRoot, '**/*.{md,txt,config}'),
        path.join(this.workspaceRoot, '**/package.json'),
        path.join(this.workspaceRoot, '**/requirements.txt'),
        path.join(this.workspaceRoot, '**/Cargo.toml'),
        path.join(this.workspaceRoot, '**/pom.xml')
      ];
    }
  }

  private createWatcher(): void {
    this.watcher = chokidar.watch(this.watchPatterns, {
      ...this.config,
      cwd: this.workspaceRoot
    });
  }

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher
      .on('add', (filePath, stats) => {
        this.handleFileEvent('add', filePath, stats);
      })
      .on('change', (filePath, stats) => {
        this.handleFileEvent('change', filePath, stats);
      })
      .on('unlink', (filePath) => {
        this.handleFileEvent('unlink', filePath);
      })
      .on('addDir', (dirPath, stats) => {
        this.handleFileEvent('addDir', dirPath, stats);
      })
      .on('unlinkDir', (dirPath) => {
        this.handleFileEvent('unlinkDir', dirPath);
      })
      .on('ready', () => {
        this.handleFileEvent('ready', '');
        this.updateWatchedCounts();
      })
      .on('error', (error) => {
        this.handleFileEvent('error', '', undefined, error);
      });
  }

  private handleFileEvent(
    type: FileSystemEvent['type'],
    filePath: string,
    stats?: Stats, // Now using Stats from 'fs'
    error?: Error
  ): void {
    // Update statistics
    this.stats.events[type]++;

    // Create event object
    const event: FileSystemEvent = {
      type,
      path: filePath,
      stats,
      error,
      timestamp: new Date()
    };

    // Apply throttling
    if (this.shouldThrottleEvent(filePath)) {
    this.logger.debug(`Throttling event for ${filePath}`);
    return;
  }

    // Handle the event
    this.processFileEvent(event);
  }

  private shouldThrottleEvent(filePath: string): boolean {
    const now = new Date();
    const lastEvent = this.recentEvents.get(filePath);
    
    if (lastEvent && (now.getTime() - lastEvent.getTime()) < this.throttleWindow) {
      return true;
    }
    
    this.recentEvents.set(filePath, now);
    
    // Clean old entries
    for (const [path, timestamp] of this.recentEvents.entries()) {
      if (now.getTime() - timestamp.getTime() > this.throttleWindow * 10) {
        this.recentEvents.delete(path);
      }
    }
    
    return false;
  }

  private processFileEvent(event: FileSystemEvent): void {
    // Notify event listeners
    this.notifyEventListeners(event);

    // Handle file changes with debouncing
    if (['add', 'change', 'unlink'].includes(event.type)) {
      this.debouncedFileChange(event);
    }

    // Special handling for different event types
    switch (event.type) {
      case 'ready':
        this.logger.info('File system watcher is ready');
        break;
      case 'error':
        this.logger.error('File system watcher error:', event.error);
        break;
      case 'addDir':
        this.logger.debug(`Directory added: ${event.path}`);
        break;
      case 'unlinkDir':
        this.logger.debug(`Directory removed: ${event.path}`);
        break;
    }
  }

  private debouncedFileChange(event: FileSystemEvent): void {
    const filePath = event.path;
    
    // Clear existing timeout for this file
    const existingTimeout = this.pendingChanges.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.processFileChange(event);
      this.pendingChanges.delete(filePath);
    }, this.debounceDelay);

    this.pendingChanges.set(filePath, timeout);
  }

  private processFileChange(event: FileSystemEvent): void {
    if (event.type === 'ready' || event.type === 'error') return;

    // Convert to FileChange format
    const changeType: FileChange['type'] = 
      event.type === 'add' ? 'created' :
      event.type === 'change' ? 'modified' :
      event.type === 'unlink' ? 'deleted' :
      'modified'; // fallback

    const change: FileChange = {
      path: path.relative(this.workspaceRoot, event.path),
      type: changeType,
      timestamp: event.timestamp
    };

    this.logger.debug(`File ${changeType}: ${change.path}`);
    this.notifyFileChangeListeners(change);
  }

  private notifyEventListeners(event: FileSystemEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in event listener:', error);
      }
    }
  }

  private notifyFileChangeListeners(change: FileChange): void {
    for (const callback of this.fileChangeCallbacks) {
      try {
        callback(change);
      } catch (error) {
        this.logger.error('Error in file change listener:', error);
      }
    }
  }

  private clearPendingChanges(): void {
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
  }

  private updateWatchedCounts(): void {
    if (!this.watcher) return;

    const watched = this.watcher.getWatched();
    let totalFiles = 0;
    let totalDirs = 0;

    for (const [dir, files] of Object.entries(watched)) {
      totalDirs++;
      totalFiles += files.length;
    }

    this.stats.filesWatched = totalFiles;
    this.stats.directoriesWatched = totalDirs;
    this.stats.totalWatched = totalFiles + totalDirs;

    this.logger.debug(`Watching ${totalFiles} files in ${totalDirs} directories`);
  }
}