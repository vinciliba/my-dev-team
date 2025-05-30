export { BaseAgent } from './BaseAgent';
export { ArchitectAgent } from './ArchictAgent';
export { CoderAgent } from './CodeAgent';
export { TesterAgent } from './TesterAgent';

// Agent factory for easy instantiation
export class AgentFactory {
  static createAgent(type: 'architect' | 'coder' | 'tester') {
    switch (type) {
      case 'architect':
        return new ArchitectAgent();
      case 'coder':
        return new CoderAgent();
      case 'tester':
        return new TesterAgent();
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  static createAllAgents() {
    return {
      architect: new ArchitectAgent(),
      coder: new CoderAgent(),
      tester: new TesterAgent()
    };
  }
}

// Agent type guards
export const isArchitectAgent = (agent: BaseAgent): agent is ArchitectAgent => {
  return agent.type === 'architect';
};

export const isCoderAgent = (agent: BaseAgent): agent is CoderAgent => {
  return agent.type === 'coder';
};

export const isTesterAgent = (agent: BaseAgent): agent is TesterAgent => {
  return agent.type === 'tester';
};