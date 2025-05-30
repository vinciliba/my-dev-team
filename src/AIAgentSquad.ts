import { Config, AgentType, AgentTask } from './types';
import { AgentFactory } from './agents';
import { ServiceFactory } from './services';
import { OrchestratorFactory } from './orchestrator';
import { Logger } from './utils';

export class AIAgentSquad {
  private config: Config;
  private agents: ReturnType<typeof AgentFactory.createAllAgents>;
  private services: ReturnType<typeof ServiceFactory.createAllServices>;
  private orchestrator: ReturnType<typeof OrchestratorFactory.createProjectOrchestrator>;
  private logger: Logger;

  constructor(config: Config) {
    this.config = config;
    this.logger = new Logger('AIAgentSquad');
    
    // Initialize all components
    this.agents = AgentFactory.createAllAgents();
    this.services = ServiceFactory.createAllServices();
    this.orchestrator = OrchestratorFactory.createProjectOrchestrator();
    
    this.logger.info('AI Agent Squad initialized');
  }

  async executeTask(description: string, workspaceRoot: string): Promise<string> {
    this.logger.info(`Executing task: ${description}`);
    
    try {
      // Use orchestrator to plan and execute
      const result = await this.orchestrator.executeProjectTask({
        description,
        workspaceRoot,
        timestamp: new Date()
      });
      
      return result.summary;
    } catch (error) {
      this.logger.error('Task execution failed:', error);
      throw error;
    }
  }

  getSystemStatus() {
    return {
      agents: {
        architect: this.agents.architect.getStatus(),
        coder: this.agents.coder.getStatus(),
        tester: this.agents.tester.getStatus()
      },
      config: this.config,
      uptime: process.uptime()
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down AI Agent Squad');
    // Cleanup logic here
  }
}