export interface AgentTask {
  id: string;
  type: 'analyze' | 'create' | 'modify' | 'test' | 'refactor' | 'deploy';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  parameters: Record<string, any>;
  dependencies?: string[]; // Task IDs this depends on
  estimatedTime?: number; // milliseconds
  created: Date;
}

export interface AgentResult {
  taskId: string;
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  filesDeleted: string[];
  executionTime: number;
  nextTasks?: AgentTask[];
  error?: string;
  logs: string[];
}

export interface AgentCapability {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
}

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentTask?: AgentTask;
  capabilities: AgentCapability[];
  performance: {
    tasksCompleted: number;
    successRate: number;
    averageExecutionTime: number;
  };
}

export type AgentType = 'architect' | 'coder' | 'tester' | 'reviewer' | 'refactor' | 'deploy';

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType | 'orchestrator';
  type: 'task_request' | 'task_complete' | 'task_failed' | 'status_update' | 'help_request';
  payload: any;
  timestamp: Date;
}