/**
 * Context Module Index
 * Central export point for all context-related classes and utilities
 */

// Core Context Classes
export { ProjectContext } from './ProjectContext';
export { WorkspaceAnalyzer } from './WorkspaceAnalyzer';
export { FileSystemWatcher } from './FileSystemWatcher'; 

// Types
export type {
  ProjectStructure,
  DirectoryNode,
  GitState,
  FileChange,
  CodeAnalysis
} from '../types/Projects';

export type {
  AnalysisResult,
  AnalysisSummary,
  CodeMetrics,
  SecurityIssue,
  PerformanceIssue,
  QualityIssue,
  DependencyIssue,
  ArchitectureInsight,
  TechnicalDebt,
  AnalysisConfig,
  AnalysisProgress,
  SeverityLevel,
  ProjectHealth,
  IssueType
} from '../types/Analysis';

/**
 * Context Factory for creating context instances
 */
export class ContextFactory {
  /**
   * Create a ProjectContext instance
   */
  static createProjectContext(workspaceRoot: string): ProjectContext {
    return new ProjectContext(workspaceRoot);
  }

  /**
   * Create a WorkspaceAnalyzer instance
   */
  static createWorkspaceAnalyzer(projectContext: ProjectContext): WorkspaceAnalyzer {
    return new WorkspaceAnalyzer(projectContext);
  }

  /**
   * Create FileSystemWatcher when implemented
   */
  static createFileSystemWatcher(workspaceRoot: string): any {
    // TODO: Implement FileSystemWatcher
    throw new Error('FileSystemWatcher not yet implemented');
  }
}