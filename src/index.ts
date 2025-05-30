// Main exports for the entire AI Agent Squad system
export * from './agents';
export * from './services';
export * from './context';
export * from './orchestrator';
export * from './types';
export * from './utils';

// Main system class
export { AIAgentSquad } from './AIAgentSquad';

// Version info
export const VERSION = '1.0.0';
export const AGENT_SQUAD_INFO = {
  name: 'AI Agent Squad',
  version: VERSION,
  description: 'Multi-agent system for autonomous coding',
  agents: ['architect', 'coder', 'tester'],
  capabilities: [
    'Project Analysis',
    'Code Generation',
    'Test Creation',
    'Quality Assurance',
    'Multi-language Support'
  ]
};

// Configuration defaults
export const DEFAULT_CONFIG: Config = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    models: {
      architect: 'gemma3:12b',
      coder: 'codellama:13b',
      tester: 'codellama:13b'
    }
  },
  agents: {
    maxConcurrent: 3,
    timeout: 60000,
    retries: 3
  },
  workspace: {
    watchFiles: true,
    autoSave: true,
    backupChanges: true
  }
};

// Quick setup function
export const createAgentSquad = (config?: Partial<Config>) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  return new AIAgentSquad(finalConfig);
};

// Health check function
export const checkSystemHealth = async (): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, boolean>;
  agents: Record<string, boolean>;
}> => {
  const services = ServiceFactory.createAllServices();
  const agents = AgentFactory.createAllAgents();

  // Check services
  const serviceHealth: Record<string, boolean> = {};
  try {
    await services.ollama.testConnection();
    serviceHealth.ollama = true;
  } catch {
    serviceHealth.ollama = false;
  }

  serviceHealth.file = true; // File service is always available
  serviceHealth.git = true;  // Git service check would go here

  // Check agents
  const agentHealth: Record<string, boolean> = {};
  agentHealth.architect = agents.architect.getStatus().status !== 'offline';
  agentHealth.coder = agents.coder.getStatus().status !== 'offline';
  agentHealth.tester = agents.tester.getStatus().status !== 'offline';

  const allServicesHealthy = Object.values(serviceHealth).every(h => h);
  const allAgentsHealthy = Object.values(agentHealth).every(h => h);

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (allServicesHealthy && allAgentsHealthy) {
    status = 'healthy';
  } else if (serviceHealth.ollama && serviceHealth.file) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    status,
    services: serviceHealth,
    agents: agentHealth
  };
};