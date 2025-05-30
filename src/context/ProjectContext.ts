import { ProjectStructure, DirectoryNode, GitState, FileChange, CodeAnalysis} from '../types/Projects';
import { TestResults, BuildStatus } from '../types/Task';
import { FileService } from '../services/FileService';
import { GitService } from '../services/GitService';
import { Logger } from '../utils/logger';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fs from 'fs/promises';


export class ProjectContext {
  private workspaceRoot: string;
  private structure: ProjectStructure | null = null;
  private gitState: GitState | null = null;
  private activeFiles: Set<string> = new Set();
  private recentChanges: FileChange[] = [];
  private testResults: TestResults | null = null;
  private buildStatus: BuildStatus | null = null;
  private analysis: CodeAnalysis | null = null;
  private fileWatcher: chokidar.FSWatcher | null = null;
  
  private fileService: FileService;
  private gitService: GitService;
  private logger: Logger;
  private lastAnalysis: Date | null = null;
  private changeListeners: ((change: FileChange) => void)[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.fileService = new FileService();
      // Provide a basic GitService config
    this.gitService = new GitService({
     repositoryPath: this.workspaceRoot
    });
  
    this.logger = new Logger('ProjectContext');
    
    this.logger.info(`Initializing project context for: ${workspaceRoot}`);
  }

  async initialize(): Promise<void> {
    this.logger.info('Analyzing project structure...');
    
    try {
      // Initialize all context data
      await Promise.all([
        this.analyzeProjectStructure(),
        this.updateGitState(),
        this.performCodeAnalysis(),
        this.loadTestResults(),
        this.checkBuildStatus()
      ]);
      
      // Start file watching
      await this.startFileWatching();
      
      this.logger.info('Project context initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize project context:', error);
      throw error;
    }
  }

  async refresh(): Promise<void> {
    this.logger.info('Refreshing project context...');
    
    const oldStructure = this.structure;
    await this.initialize();
    
    // Detect structural changes
    if (oldStructure && this.structure) {
      const changes = this.detectStructuralChanges(oldStructure, this.structure);
      this.addRecentChanges(changes);
    }
  }

  // Getters for context data
  getProjectStructure(): ProjectStructure | null {
    return this.structure;
  }

  getGitState(): GitState | null {
    return this.gitState;
  }

  getActiveFiles(): string[] {
    return Array.from(this.activeFiles);
  }

  getRecentChanges(limit: number = 50): FileChange[] {
    return this.recentChanges.slice(-limit);
  }

  getTestResults(): TestResults | null {
    return this.testResults;
  }

  getBuildStatus(): BuildStatus | null {
    return this.buildStatus;
  }

  getCodeAnalysis(): CodeAnalysis | null {
    return this.analysis;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  // Context queries
  getFilesByType(extension: string): string[] {
    if (!this.structure) return [];
    return this.findFilesByExtension(this.structure.structure, extension);
  }

  getFilesByPattern(pattern: RegExp): string[] {
    if (!this.structure) return [];
    return this.findFilesByPattern(this.structure.structure, pattern);
  }

  getDirectoryContents(relativePath: string): DirectoryNode[] {
    if (!this.structure) return [];
    const targetDir = this.findDirectory(this.structure.structure, relativePath);
    return targetDir?.children || [];
  }

  isFileActive(filePath: string): boolean {
    return this.activeFiles.has(filePath);
  }

  hasRecentChanges(since: Date): boolean {
    return this.recentChanges.some(change => change.timestamp > since);
  }

  getProjectType(): string {
    return this.structure?.type || 'unknown';
  }

  getPrimaryLanguages(): string[] {
    return this.structure?.language || [];
  }

  getDependencies(): Record<string, string> {
    return this.structure?.dependencies || {};
  }

  getFramework(): string | undefined {
    return this.structure?.framework;
  }

  // File operations with context tracking
  async createFile(relativePath: string, content: string, agent?: string): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, relativePath);
    await this.fileService.writeFile(fullPath, content);
    
    this.addFileChange({
      path: relativePath,
      type: 'created',
      timestamp: new Date(),
      agent: agent as any
    });
    
    // Update structure
    await this.updateFileInStructure(relativePath, 'created');
  }

  async modifyFile(relativePath: string, content: string, agent?: string): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, relativePath);
    await this.fileService.writeFile(fullPath, content);
    
    this.addFileChange({
      path: relativePath,
      type: 'modified',
      timestamp: new Date(),
      agent: agent as any
    });
  }

  async deleteFile(relativePath: string, agent?: string): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, relativePath);
    await this.fileService.deleteFile(fullPath);
    
    this.addFileChange({
      path: relativePath,
      type: 'deleted',
      timestamp: new Date(),
      agent: agent as any
    });
    
    // Update structure
    await this.updateFileInStructure(relativePath, 'deleted');
  }

  // Active file tracking
  markFileActive(filePath: string): void {
    this.activeFiles.add(filePath);
    this.logger.debug(`File marked as active: ${filePath}`);
  }

  markFileInactive(filePath: string): void {
    this.activeFiles.delete(filePath);
    this.logger.debug(`File marked as inactive: ${filePath}`);
  }

  // Test results management
  updateTestResults(results: TestResults): void {
    this.testResults = results;
    this.logger.info(`Test results updated: ${results.passed}/${results.total} passed`);
  }

  // Build status management
  updateBuildStatus(status: BuildStatus): void {
    this.buildStatus = status;
    this.logger.info(`Build status updated: ${status.status}`);
  }

  // Event listeners
  onFileChange(listener: (change: FileChange) => void): void {
    this.changeListeners.push(listener);
  }

  removeFileChangeListener(listener: (change: FileChange) => void): void {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  // Context search
  async searchInProject(query: string, fileTypes?: string[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    if (!this.structure) return results;
    
    const searchFiles = fileTypes 
      ? fileTypes.flatMap(ext => this.getFilesByType(ext))
      : this.getAllSourceFiles();
    
    for (const file of searchFiles.slice(0, 50)) { // Limit search
      try {
        const fullPath = path.join(this.workspaceRoot, file);
        const content = await this.fileService.readFile(fullPath);
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            results.push({
              file,
              line: index + 1,
              content: line.trim(),
              context: this.getLineContext(lines, index)
            });
          }
        });
      } catch (error) {
        this.logger.debug('Error message:', error as any);
      }
    }
    
    return results.slice(0, 100); // Limit results
  }

  // Context statistics
  getProjectStats(): ProjectStats {
    if (!this.structure || !this.analysis) {
      return {
        totalFiles: 0,
        totalLines: 0,
        languages: {},
        lastAnalysis: null,
        recentChanges: this.recentChanges.length
      };
    }
    
    return {
      totalFiles: this.analysis.totalFiles,
      totalLines: this.analysis.totalLines,
      languages: this.analysis.languages,
      lastAnalysis: this.lastAnalysis,
      recentChanges: this.recentChanges.length
    };
  }

  // Cleanup
  async dispose(): Promise<void> {
    this.logger.info('Disposing project context...');
    
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    this.changeListeners.length = 0;
    this.activeFiles.clear();
    this.recentChanges.length = 0;
  }

  // Private methods
  private async analyzeProjectStructure(): Promise<void> {
    try {
      this.structure = await this.scanProjectStructure();
      this.logger.info(`Project structure analyzed: ${this.structure.type} project with ${this.structure.language.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to analyze project structure:', error as any);
      this.structure = this.createEmptyStructure();
    }
  }

  private async scanProjectStructure(): Promise<ProjectStructure> {
    const rootStructure = await this.scanDirectory(this.workspaceRoot);
    
    // Detect project type and language
    const projectType = this.detectProjectType(rootStructure);
    const languages = this.detectLanguages(rootStructure);
    const framework = this.detectFramework(rootStructure);
    const { dependencies, devDependencies } = await this.loadDependencies();
    
    return {
      root: this.workspaceRoot,
      type: projectType,
      framework,
      language: languages,
      dependencies,
      devDependencies,
      structure: rootStructure
    };
  }

  private async scanDirectory(dirPath: string, relativePath: string = ''): Promise<DirectoryNode> {
    const stats = await fs.stat(dirPath);
    const name = path.basename(dirPath);
    
    const node: DirectoryNode = {
      name,
      type: 'directory',
      path: relativePath || '.',
      modified: stats.mtime
    };
    
    try {
      const items = await this.fileService.readDirectory(dirPath);
      node.children = [];
      
      for (const item of items) {
        // Skip certain directories and files
        if (this.shouldSkipItem(item)) continue;
        
        const itemPath = path.join(dirPath, item);
        const itemRelativePath = path.join(relativePath, item);
        const itemStats = await fs.stat(itemPath);
        
      // 2. Around LINE 348 - This should be the EXACT code:
      if (itemStats.isDirectory()) {  // ← This MUST be isDirectory() with parentheses
        const childNode = await this.scanDirectory(itemPath, itemRelativePath);
        node.children.push(childNode);
      } else {
        node.children.push({
          name: item,
          type: 'file',
          path: itemRelativePath,
          size: itemStats.size,      // ← LINE 356: This should work with fs.Stats
          modified: itemStats.mtime,  // ← LINE 357: This should work with fs.Stats
          language: this.detectFileLanguage(item)
        });
      }
    }} catch (error) {
      this.logger.debug(`Error scanning directory ${dirPath}:`, error as any);
    }
    
    return node;
  }

  private shouldSkipItem(item: string): boolean {
    const skipPatterns = [
      'node_modules',
      '.git',
      '.vscode',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      '__pycache__',
      '.pytest_cache',
      'target',
      'bin',
      'obj'
    ];
    
    return skipPatterns.includes(item) || item.startsWith('.');
  }

  private detectProjectType(structure: DirectoryNode): ProjectStructure['type'] {
    const hasFile = (name: string) => this.findFile(structure, name) !== null;
    const hasPackageJson = hasFile('package.json');
    const hasPomXml = hasFile('pom.xml');
    const hasCargoToml = hasFile('Cargo.toml');
    const hasRequirementsTxt = hasFile('requirements.txt');
    const hasPyprojectToml = hasFile('pyproject.toml');
    
    // Web frameworks
    if (hasPackageJson) {
      if (this.findFile(structure, 'next.config.js') || this.findFile(structure, 'next.config.ts')) return 'web';
      if (this.findFile(structure, 'nuxt.config.js') || this.findFile(structure, 'nuxt.config.ts')) return 'web';
      if (this.findFile(structure, 'vite.config.js') || this.findFile(structure, 'vite.config.ts')) return 'web';
      if (this.findDirectory(structure, 'src/components')) return 'web';
      if (this.findFile(structure, 'express') || this.findFile(structure, 'fastify')) return 'api';
    }
    
    // Backend frameworks
    if (hasPackageJson && (this.findFile(structure, 'server.js') || this.findFile(structure, 'app.js'))) return 'api';
    if (hasPomXml) return 'api';
    if (hasRequirementsTxt || hasPyprojectToml) {
      if (this.findFile(structure, 'manage.py')) return 'web'; // Django
      if (this.findFile(structure, 'app.py') || this.findFile(structure, 'main.py')) return 'api';
    }
    
    // Desktop/Mobile
    if (this.findFile(structure, 'pubspec.yaml')) return 'mobile'; // Flutter
    if (this.findFile(structure, 'android') && this.findFile(structure, 'ios')) return 'mobile'; // React Native
    if (hasCargoToml) return 'desktop'; // Rust
    
    // Library
    if (hasPackageJson && this.findFile(structure, 'index.ts') && !this.findDirectory(structure, 'src/components')) return 'library';
    
    return 'unknown';
  }

  private detectLanguages(structure: DirectoryNode): string[] {
    const languages = new Set<string>();
    this.collectLanguages(structure, languages);
    return Array.from(languages);
  }

  private collectLanguages(node: DirectoryNode, languages: Set<string>): void {
    if (node.type === 'file' && node.language) {
      languages.add(node.language);
    }
    
    if (node.children) {
      for (const child of node.children) {
        this.collectLanguages(child, languages);
      }
    }
  }

  private detectFileLanguage(fileName: string): string | undefined {
    const ext = path.extname(fileName).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin'
    };
    
    return languageMap[ext];
  }

  private detectFramework(structure: DirectoryNode): string | undefined {
    // Check package.json dependencies
    const packageJson = this.findFile(structure, 'package.json');
    if (packageJson) {
      // This would require reading the file content
      // Simplified detection based on common files
      if (this.findFile(structure, 'next.config.js')) return 'Next.js';
      if (this.findFile(structure, 'nuxt.config.js')) return 'Nuxt.js';
      if (this.findFile(structure, 'vite.config.js')) return 'Vite';
      if (this.findFile(structure, 'angular.json')) return 'Angular';
      if (this.findDirectory(structure, 'src') && this.findFile(structure, 'public/index.html')) return 'React';
    }
    
    // Python frameworks
    if (this.findFile(structure, 'manage.py')) return 'Django';
    if (this.findFile(structure, 'app.py')) return 'Flask';
    if (this.findFile(structure, 'main.py') && this.findFile(structure, 'requirements.txt')) return 'FastAPI';
    
    return undefined;
  }

  private async loadDependencies(): Promise<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }> {
    const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
    
    try {
      if (await this.fileService.fileExists(packageJsonPath)) {
        const content = await this.fileService.readFile(packageJsonPath);
        const packageJson = JSON.parse(content);
        return {
          dependencies: packageJson.dependencies || {},
          devDependencies: packageJson.devDependencies || {}
        };
      }
    } catch (error) {
       this.logger.debug('Error message:', error as any);
    }
    
    return { dependencies: {}, devDependencies: {} };
  }

  private async updateGitState(): Promise<void> {
    try {
      this.gitState = await this.gitService.getGitState() as any;
    } catch (error) {
      this.logger.debug('No git repository or git error:', error as any);
      this.gitState = null;
    }
  }


private async performCodeAnalysis(): Promise<void> {
  if (!this.structure) return;
  
  const sourceFiles = this.getAllSourceFiles();
  let totalLines = 0;
  const languages: Record<string, number> = {};
  const exportedFunctions: any[] = [];
  
  // Analyze a sample of files
  for (const file of sourceFiles.slice(0, 20)) {
    try {
      const fullPath = path.join(this.workspaceRoot, file);
      
      // OPTIONAL: Replace this line for consistency
      // OLD:
      // const content = await this.fileService.readFile(fullPath);
      // NEW:
      const content = await fs.readFile(fullPath, 'utf8');
      
      const lines = content.split('\n').length;
      totalLines += lines;
      
      const language = this.detectFileLanguage(file);
      if (language) {
        languages[language] = (languages[language] || 0) + lines;
      }
      
      // Extract exports (simplified)
      const exports = this.extractExports(content, file);
      exportedFunctions.push(...exports);
    } catch (error) {
      this.logger.debug('Some error:', error as any);
    }
  }
  
  this.analysis = {
    totalFiles: sourceFiles.length,
    totalLines,
    languages,
    complexity: totalLines > 10000 ? 'high' : totalLines > 5000 ? 'medium' : 'low',
    dependencies: Object.keys(this.structure.dependencies),
    entryPoints: this.findEntryPoints(),
    exportedFunctions
  };
  
  this.lastAnalysis = new Date();
}

  private getAllSourceFiles(): string[] {
    if (!this.structure) return [];
    
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs'];
    return sourceExtensions.flatMap(ext => this.getFilesByType(ext));
  }

  private extractExports(content: string, file: string): any[] {
    const exports: any[] = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/);
      if (exportMatch) {
        exports.push({
          name: exportMatch[1],
          type: 'function', // Simplified
          file,
          line: index + 1,
          exported: true
        });
      }
    });
    
    return exports;
  }

  private findEntryPoints(): string[] {
    const entryPoints: string[] = [];
    
    if (this.structure) {
      // Common entry point patterns
      const commonEntries = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js'];
      
      for (const entry of commonEntries) {
        if (this.findFile(this.structure.structure, entry)) {
          entryPoints.push(entry);
        }
      }
    }
    
    return entryPoints;
  }

  private async loadTestResults(): Promise<void> {
    // Try to load from common test result locations
    const testResultPaths = [
      'coverage/lcov-report/index.html',
      'test-results.json',
      'junit.xml'
    ];
    
    // This would parse actual test results - simplified for now
    this.testResults = null;
  }

  private async checkBuildStatus(): Promise<void> {
    // Check for build artifacts and status - simplified for now
    this.buildStatus = null;
  }

  private async startFileWatching(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.close();
    }
    
    const watchPatterns = [
      path.join(this.workspaceRoot, '**/*.{ts,tsx,js,jsx,py,java,cpp,c,cs,go,rs}'),
      path.join(this.workspaceRoot, '**/package.json'),
      path.join(this.workspaceRoot, '**/requirements.txt'),
      path.join(this.workspaceRoot, '**/Cargo.toml')
    ];
    
    this.fileWatcher = chokidar.watch(watchPatterns, {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      persistent: true,
      ignoreInitial: true
    });
    
    this.fileWatcher.on('add', (filePath) => {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      this.handleFileChange(relativePath, 'created');
    });
    
    this.fileWatcher.on('change', (filePath) => {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      this.handleFileChange(relativePath, 'modified');
    });
    
    this.fileWatcher.on('unlink', (filePath) => {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      this.handleFileChange(relativePath, 'deleted');
    });
    
    this.logger.info('File watching started');
  }

  private handleFileChange(filePath: string, type: FileChange['type']): void {
    const change: FileChange = {
      path: filePath,
      type,
      timestamp: new Date()
    };
    
    this.addFileChange(change);
    
    // Trigger re-analysis if needed
    if (this.shouldTriggerReanalysis(filePath)) {
      this.scheduleReanalysis();
    }
  }

  private shouldTriggerReanalysis(filePath: string): boolean {
    const importantFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'pom.xml'];
    return importantFiles.some(file => filePath.endsWith(file));
  }

  private scheduleReanalysis(): void {
    // Debounced reanalysis
    setTimeout(() => {
      this.performCodeAnalysis();
    }, 2000);
  }

  private addFileChange(change: FileChange): void {
    this.recentChanges.push(change);
    
    // Keep only recent changes (last 100)
    if (this.recentChanges.length > 100) {
      this.recentChanges = this.recentChanges.slice(-100);
    }
    
    // Notify listeners
    this.changeListeners.forEach(listener => {
      try {
        listener(change);
      } catch (error) {
        this.logger.error('Error in file change listener:', error);
      }
    });
  }

  private addRecentChanges(changes: FileChange[]): void {
    for (const change of changes) {
      this.addFileChange(change);
    }
  }

  private detectStructuralChanges(oldStructure: ProjectStructure, newStructure: ProjectStructure): FileChange[] {
    const changes: FileChange[] = [];
    
    // Simple comparison - in production, use more sophisticated diff
    if (oldStructure.type !== newStructure.type) {
      changes.push({
        path: 'project.type',
        type: 'modified',
        timestamp: new Date()
      });
    }
    
    return changes;
  }

  private async updateFileInStructure(filePath: string, operation: 'created' | 'deleted'): Promise<void> {
    // Update the in-memory structure
    if (!this.structure) return;
    
    if (operation === 'created') {
      // Add file to structure
      const fileName = path.basename(filePath);
      const dirPath = path.dirname(filePath);
      const targetDir = this.findDirectory(this.structure.structure, dirPath);
      
      if (targetDir && targetDir.children) {
        targetDir.children.push({
          name: fileName,
          type: 'file',
          path: filePath,
          language: this.detectFileLanguage(fileName),
          modified: new Date()
        });
      }
    } else if (operation === 'deleted') {
      // Remove file from structure
      this.removeFileFromStructure(this.structure.structure, filePath);
    }
  }

  private removeFileFromStructure(node: DirectoryNode, targetPath: string): boolean {
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.path === targetPath) {
          node.children.splice(i, 1);
          return true;
        }
        if (child.type === 'directory' && this.removeFileFromStructure(child, targetPath)) {
          return true;
        }
      }
    }
    return false;
  }

  private findFile(node: DirectoryNode, fileName: string): DirectoryNode | null {
    if (node.type === 'file' && node.name === fileName) {
      return node;
    }
    
    if (node.children) {
      for (const child of node.children) {
        const found = this.findFile(child, fileName);
        if (found) return found;
      }
    }
    
    return null;
  }

  private findDirectory(node: DirectoryNode, dirPath: string): DirectoryNode | null {
    if (node.path === dirPath) {
      return node;
    }
    
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'directory') {
          const found = this.findDirectory(child, dirPath);
          if (found) return found;
        }
      }
    }
    
    return null;
  }

  private findFilesByExtension(node: DirectoryNode, extension: string): string[] {
    const files: string[] = [];
    
    if (node.type === 'file' && node.name.endsWith(extension)) {
      files.push(node.path);
    }
    
    if (node.children) {
      for (const child of node.children) {
        files.push(...this.findFilesByExtension(child, extension));
      }
    }
    
    return files;
  }

  private findFilesByPattern(node: DirectoryNode, pattern: RegExp): string[] {
    const files: string[] = [];
    
    if (node.type === 'file' && pattern.test(node.name)) {
      files.push(node.path);
    }
    
    if (node.children) {
      for (const child of node.children) {
        files.push(...this.findFilesByPattern(child, pattern));
      }
    }
    
    return files;
  }

  private getLineContext(lines: string[], lineIndex: number): string[] {
    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(lines.length, lineIndex + 3);
    return lines.slice(start, end);
  }

  private createEmptyStructure(): ProjectStructure {
    return {
      root: this.workspaceRoot,
      type: 'unknown',
      language: [],
      dependencies: {},
      devDependencies: {},
      structure: {
        name: path.basename(this.workspaceRoot),
        type: 'directory',
        path: '.',
        children: []
      }
    };
  }
}

// Supporting interfaces
interface SearchResult {
  file: string;
  line: number;
  content: string;
  context: string[];
}

interface ProjectStats {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  lastAnalysis: Date | null;
  recentChanges: number;
}