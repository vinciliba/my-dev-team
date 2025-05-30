export interface ProjectStructure {
  root: string;
  type: 'web' | 'api' | 'desktop' | 'mobile' | 'library' | 'unknown';
  framework?: string;
  language: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  structure: DirectoryNode;
}

export interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: DirectoryNode[];
  content?: string; // For files
  language?: string; // For code files
  size?: number;
  modified?: Date;
}

export interface ProjectContext {
  workspace: string;
  structure: ProjectStructure;
  gitState: GitState;
  activeFiles: string[];
  recentChanges: FileChange[];
  testResults?: TestResults;
  buildStatus?: BuildStatus;
  analysis: CodeAnalysis;
}

export interface GitState {
  branch: string;
  status: 'clean' | 'modified' | 'staged' | 'conflict';
  uncommittedChanges: string[];
  lastCommit: {
    hash: string;
    message: string;
    date: Date;
  };
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  timestamp: Date;
  agent?: AgentType;
}

export interface CodeAnalysis {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  complexity: 'low' | 'medium' | 'high';
  dependencies: string[];
  entryPoints: string[];
  exportedFunctions: CodeSymbol[];
}

export interface CodeSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable';
  file: string;
  line: number;
  exported: boolean;
}