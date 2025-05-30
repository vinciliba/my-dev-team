import * as React from 'react';
import { AgentTask } from '../types/Agents';
import './TaskProgress.css';

interface TaskProgressProps {
  tasks: AgentTask[];
  agents: Array<{
    id: string;
    name: string;
    avatar?: string;
    status: string;
  }>;
}

export const TaskProgress: React.FC<TaskProgressProps> = ({ tasks, agents }) => {
  const getAgent = (agentId: string) => {
    return agents.find(a => a.id === agentId);
  };

  const getTaskProgress = (task: AgentTask) => {
    // Simulate progress based on task creation time
    const elapsed = Date.now() - new Date(task.created).getTime();
    const estimatedTime = task.estimatedTime || 10000;
    return Math.min((elapsed / estimatedTime) * 100, 95);
  };

  return (
    <div className="task-progress">
      {tasks.map(task => {
        const agent = getAgent(task.agentId || '');
        const progress = getTaskProgress(task);

        return (
          <div key={task.id} className="task-progress-item">
            <div className="task-progress-header">
              <div className="task-info">
                <span className="task-icon">{agent?.avatar || '🤖'}</span>
                <div className="task-details">
                  <span className="task-name">{task.description}</span>
                  <span className="task-agent-name">{agent?.name || 'Unknown'}</span>
                </div>
              </div>
              <span className="task-priority priority-${task.priority}">
                {task.priority}
              </span>
            </div>

            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="progress-text">{Math.round(progress)}%</span>
            </div>

            <div className="task-actions">
              <button className="action-button" title="View Details">
                <span>👁️</span>
              </button>
              <button className="action-button" title="Pause Task">
                <span>⏸️</span>
              </button>
              <button className="action-button danger" title="Cancel Task">
                <span>❌</span>
              </button>
            </div>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="no-tasks">
          <span className="no-tasks-icon">💤</span>
          <p>No active tasks at the moment</p>
        </div>
      )}
    </div>
  );
};