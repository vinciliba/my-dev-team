// Import all context classes
export { ProjectContext } from './ProjectContext';
export { WorkspaceAnalyzer } from './WorkspaceAnalyzer';

// Import the classes for internal use  
import { ProjectContext } from './ProjectContext';
import { WorkspaceAnalyzer } from './WorkspaceAnalyzer';

// Type definitions
export interface ContextConfig {
  workspaceRoot: string;
  enableWatcher?: boolean;
  analysisConfig?: AnalysisConfig;
}

export interface AnalysisConfig {
  includeDependencies?: boolean;
  includeGitInfo?: boolean;
  maxDepth?: number;
  excludePatterns?: string[];
}

// Factory functions that work with actual constructors
export function createProjectContext(workspaceRoot: string): ProjectContext {
  return new ProjectContext(workspaceRoot);
}

// Fix the undefined ProjectContext error by making it required
export function createWorkspaceAnalyzer(projectContext: ProjectContext): WorkspaceAnalyzer {
  return new WorkspaceAnalyzer(projectContext);
}

// Context manager class
export class ContextManager {
  private projectContext: ProjectContext;
  private workspaceAnalyzer: WorkspaceAnalyzer;

  constructor(config: ContextConfig) {
    this.projectContext = new ProjectContext(config.workspaceRoot);
    this.workspaceAnalyzer = new WorkspaceAnalyzer(this.projectContext);
  }

  async initialize(): Promise<void> {
    await this.projectContext.initialize();
  }

  getProjectContext(): ProjectContext {
    return this.projectContext;
  }

  getWorkspaceAnalyzer(): WorkspaceAnalyzer {
    return this.workspaceAnalyzer;
  }

  async shutdown(): Promise<void> {
    await this.projectContext.dispose();
  }
}