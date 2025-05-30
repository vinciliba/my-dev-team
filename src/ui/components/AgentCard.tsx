import * as React from 'react';
import './AgentCard.css';

interface AgentProps {
  agent: {
    id: string;
    name: string;
    role: string;
    status: 'idle' | 'working' | 'completed' | 'error';
    currentTask?: string;
    avatar?: string;
    capabilities: string[];
    performance: {
      tasksCompleted: number;
      successRate: number;
      avgResponseTime: number;
    };
  };
  isSelected: boolean;
  onSelect: () => void;
}

export const AgentCard: React.FC<AgentProps> = ({ agent, isSelected, onSelect }) => {
  const getStatusColor = () => {
    switch (agent.status) {
      case 'idle': return '#6b7280';
      case 'working': return '#3b82f6';
      case 'completed': return '#10b981';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (agent.status) {
      case 'idle': return 'Ready';
      case 'working': return 'Working...';
      case 'completed': return 'Completed';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  return (
    <div 
      className={`agent-card ${isSelected ? 'selected' : ''} ${agent.status}`}
      onClick={onSelect}
    >
      <div className="agent-header">
        <div className="agent-avatar">{agent.avatar || '🤖'}</div>
        <div className="agent-info">
          <h3 className="agent-name">{agent.name}</h3>
          <p className="agent-role">{agent.role}</p>
        </div>
        <div className="agent-status" style={{ backgroundColor: getStatusColor() }}>
          <span className="status-dot"></span>
          <span className="status-text">{getStatusText()}</span>
        </div>
      </div>

      {agent.currentTask && (
        <div className="agent-current-task">
          <span className="task-label">Current Task:</span>
          <span className="task-description">{agent.currentTask}</span>
        </div>
      )}

      <div className="agent-capabilities">
        <h4>Capabilities:</h4>
        <div className="capabilities-list">
          {agent.capabilities.map((capability, index) => (
            <span key={index} className="capability-tag">{capability}</span>
          ))}
        </div>
      </div>

      <div className="agent-stats">
        <div className="stat-item">
          <span className="stat-value">{agent.performance.tasksCompleted}</span>
          <span className="stat-label">Tasks</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{agent.performance.successRate.toFixed(0)}%</span>
          <span className="stat-label">Success</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{(agent.performance.avgResponseTime / 1000).toFixed(1)}s</span>
          <span className="stat-label">Avg Time</span>
        </div>
      </div>

      {agent.status === 'working' && (
        <div className="working-indicator">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
};