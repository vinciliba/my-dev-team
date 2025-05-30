// Orchestrator exports (da implementare)
export { ProjectOrchestrator } from './ProjectOrchestrator';
export { AgentCommunication } from './AgentCommunication';
export { TaskQueue } from './TaskQueue';

// Orchestrator factory
export class OrchestratorFactory {
  static createProjectOrchestrator() {
    return new ProjectOrchestrator();
  }

  static createAgentCommunication() {
    return new AgentCommunication();
  }

  static createTaskQueue() {
    return new TaskQueue();
  }
}