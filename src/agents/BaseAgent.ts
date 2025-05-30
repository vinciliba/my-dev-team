
import { AgentCapability } from '../types/Agents';

export abstract class BaseAgent {
  public name: string;
  public agentType: string;
  public description: string;
  public capabilities: AgentCapability[];
  protected isActive: boolean = false;
  
  constructor(
    name: string,
    agentType: string, 
    description: string,
    capabilities: AgentCapability[] = []
  ) {
    this.name = name;
    this.agentType = agentType;
    this.description = description;
    this.capabilities = capabilities;
    this.isActive = true;
  }

  // Abstract method that all agents must implement
  abstract executeTask(task: any): Promise<any>;

  // Common methods for all agents
  public getName(): string {
    return this.name;
  }

  public getDescription(): string {
    return this.description;
  }

  public getType(): string {
    return this.agentType;
  }

  public getCapabilities(): AgentCapability[] {
    return this.capabilities;
  }

  public isAgentActive(): boolean {
    return this.isActive;
  }

  public activate(): void {
    this.isActive = true;
  }

  public deactivate(): void {
    this.isActive = false;
  }

  protected log(message: string): void {
    console.log(`[${this.name}] ${message}`);
  }

  protected logError(error: string | Error): void {
    const errorMessage = error instanceof Error ? error.message : error;
    console.error(`[${this.name}] ERROR: ${errorMessage}`);
  }

  // Common validation method
  protected validateTask(task: any): boolean {
    return task && (task.description || task.title);
  }

  // Helper method to create success results
  protected createSuccessResult(
    task: any,
    message: string,
    files: string[] = [],
    changes: string[] = [],
    nextTasks: any[] = []
  ): any {
    return {
      success: true,
      message,
      files,
      changes,
      nextTasks,
      agent: this.name,
      timestamp: new Date(),
      task: task
    };
  }

  // Helper method to create error results
  protected createErrorResult(task: any, error: string | Error): any {
    const errorMessage = error instanceof Error ? error.message : error;
    return {
      success: false,
      error: errorMessage,
      agent: this.name,
      timestamp: new Date(),
      task: task
    };
  }

  // Estimate task execution time (override in subclasses)
  protected estimateTaskTime(task: any): number {
    return 5000; // Default 5 seconds
  }
}