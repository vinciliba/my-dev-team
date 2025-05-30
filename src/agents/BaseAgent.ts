import { v4 as uuidv4 } from 'uuid';
import { AgentTask, AgentResult, AgentStatus, AgentCapability, AgentType } from '../types/Agents';
import { Logger } from '../utils/logger';

export abstract class BaseAgent {
  protected readonly id: string;
  protected status: AgentStatus['status'] = 'idle';
  protected currentTask?: AgentTask;
  protected logger: Logger;
  
  constructor(
    public readonly name: string,
    public readonly type: AgentType,
    public readonly description: string,
    public readonly capabilities: AgentCapability[]
  ) {
    this.id = uuidv4();
    this.logger = new Logger(`Agent:${name}`);
  }

  abstract executeTask(task: AgentTask): Promise<AgentResult>;
  
  protected abstract validateTask(task: AgentTask): boolean;
  
  protected abstract estimateTaskTime(task: AgentTask): number;

  async processTask(task: AgentTask): Promise<AgentResult> {
    this.logger.info(`Starting task: ${task.description}`);
    
    if (!this.validateTask(task)) {
      return this.createErrorResult(task, 'Invalid task parameters');
    }

    this.status = 'busy';
    this.currentTask = task;
    
    const startTime = Date.now();
    
    try {
      const result = await this.executeTask(task);
      const executionTime = Date.now() - startTime;
      
      this.logger.info(`Completed task in ${executionTime}ms`);
      this.status = 'idle';
      this.currentTask = undefined;
      
      return {
        ...result,
        executionTime,
        logs: [...result.logs, `Task completed in ${executionTime}ms`]
      };
      
    } catch (error) {
      this.logger.error(`Task failed: ${error.message}`, error);
      this.status = 'error';
      
      return this.createErrorResult(task, error.message, Date.now() - startTime);
    }
  }

  getStatus(): AgentStatus {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      currentTask: this.currentTask,
      capabilities: this.capabilities,
      performance: {
        tasksCompleted: 0, // TODO: Implement performance tracking
        successRate: 0,
        averageExecutionTime: 0
      }
    };
  }

  canHandleTask(task: AgentTask): boolean {
    return this.capabilities.some(cap => 
      cap.inputTypes.includes(task.type)
    );
  }

  protected createSuccessResult(
    task: AgentTask, 
    output: string, 
    filesCreated: string[] = [],
    filesModified: string[] = [],
    nextTasks: AgentTask[] = []
  ): AgentResult {
    return {
      taskId: task.id,
      success: true,
      output,
      filesCreated,
      filesModified,
      filesDeleted: [],
      executionTime: 0, // Will be set by processTask
      nextTasks,
      logs: []
    };
  }

  protected createErrorResult(
    task: AgentTask, 
    error: string, 
    executionTime: number = 0
  ): AgentResult {
    return {
      taskId: task.id,
      success: false,
      output: '',
      filesCreated: [],
      filesModified: [],
      filesDeleted: [],
      executionTime,
      error,
      logs: [`Error: ${error}`]
    };
  }

  protected log(message: string, data?: any): void {
    this.logger.info(message, data);
  }
}