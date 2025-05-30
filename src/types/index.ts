export * from './Agents';
export * from './Projects';
export * from './Task';

// Utility types
export interface Logger {
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, error?: Error): void;
  debug(message: string, data?: any): void;
}

export interface Config {
  ollama: {
    baseUrl: string;
    models: {
      architect: string;
      coder: string;
      tester: string;
    };
  };
  agents: {
    maxConcurrent: number;
    timeout: number;
    retries: number;
  };
  workspace: {
    watchFiles: boolean;
    autoSave: boolean;
    backupChanges: boolean;
  };
}

// Re-export commonly used types
export type { AgentTask, AgentResult, AgentStatus, AgentType } from './Agents';
export type { ProjectStructure, ProjectContext, DirectoryNode } from './Projects';
export type { TaskExecutionPlan, TestResults } from './Task';