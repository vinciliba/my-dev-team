// Import all agent classes
export { BaseAgent } from './BaseAgent';
export { ArchitectAgent } from './ArchitectAgent';
export { CoderAgent } from './CodeAgent';
export { TesterAgent } from './TesterAgent';

// Import the classes for internal use
import { BaseAgent } from './BaseAgent';
import { ArchitectAgent } from './ArchitectAgent';
import { CoderAgent } from './CodeAgent';
import { TesterAgent } from './TesterAgent';

// Agent type guards using instanceof
export function isArchitectAgent(agent: BaseAgent): agent is ArchitectAgent {
  return agent instanceof ArchitectAgent;
}

export function isCoderAgent(agent: BaseAgent): agent is CoderAgent {
  return agent instanceof CoderAgent;
}

export function isTesterAgent(agent: BaseAgent): agent is TesterAgent {
  return agent instanceof TesterAgent;
}

// Factory class for creating agents
export class AgentFactory {
  static createAllAgents() {
    return {
      architect: new ArchitectAgent(),
      coder: new CoderAgent(),
      tester: new TesterAgent()
    };
  }

  static createAgent(type: 'architect' | 'coder' | 'tester'): BaseAgent {
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
}