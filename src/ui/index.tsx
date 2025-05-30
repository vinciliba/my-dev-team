// UI exports (da implementare)
export { default as AgentDashboard } from './AgentDashboard';

// Component exports
export { default as AgentCard } from './components/AgentCard';
export { default as TaskProgress } from './components/TaskProgress';
export { default as ProjectOverview } from './components/ProjectOverview';
export { default as ChatInterface } from './components/ChatInterface';

// UI utilities
export const themes = {
  dark: {
    background: '#1e1e1e',
    surface: '#2d2d30',
    primary: '#007acc',
    text: '#cccccc',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44747'
  },
  light: {
    background: '#ffffff',
    surface: '#f5f5f5',
    primary: '#007acc',
    text: '#333333',
    success: '#4caf50',
    warning: '#ff9800',
    error: '#d32f2f'
  }
};

export const formatAgentStatus = (status: string): { color: string; icon: string } => {
  switch (status) {
    case 'idle':
      return { color: '#4caf50', icon: '🟢' };
    case 'busy':
      return { color: '#ff9800', icon: '🟡' };
    case 'error':
      return { color: '#f44747', icon: '🔴' };
    case 'offline':
      return { color: '#999999', icon: '⚫' };
    default:
      return { color: '#999999', icon: '❓' };
  }
};