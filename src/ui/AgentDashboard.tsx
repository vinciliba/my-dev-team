import * as React from 'react';
import { useState, useEffect } from 'react';
import { AgentCard } from '../components/AgentCard';
import { ChatInterface } from '../components/ChatInterface';
import { ProjectOverview } from '../components/ProjectOverview';
import { TaskProgress } from '../components/TaskProgress';
import { AgentResult, AgentTask } from '../types/Agents';
import './AgentDashboard.css';

interface Agent {
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
}

interface DashboardState {
  agents: Agent[];
  activeTasks: AgentTask[];
  completedTasks: AgentResult[];
  selectedAgent: string | null;
  currentProject: {
    name: string;
    path: string;
    language: string[];
    framework: string;
  } | null;
}

export const AgentDashboard: React.FC = () => {
  const [state, setState] = useState<DashboardState>({
    agents: [
      {
        id: 'architect',
        name: 'Architect',
        role: 'System Design & Planning',
        status: 'idle',
        avatar: '🏗️',
        capabilities: ['System Design', 'API Planning', 'Database Schema'],
        performance: { tasksCompleted: 0, successRate: 0, avgResponseTime: 0 }
      },
      {
        id: 'coder',
        name: 'Coder',
        role: 'Implementation & Development',
        status: 'idle',
        avatar: '💻',
        capabilities: ['Code Generation', 'Refactoring', 'Feature Implementation'],
        performance: { tasksCompleted: 0, successRate: 0, avgResponseTime: 0 }
      },
      {
        id: 'tester',
        name: 'Tester',
        role: 'Quality Assurance & Testing',
        status: 'idle',
        avatar: '🧪',
        capabilities: ['Unit Testing', 'Integration Testing', 'Test Coverage'],
        performance: { tasksCompleted: 0, successRate: 0, avgResponseTime: 0 }
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        role: 'Code Review & Standards',
        status: 'idle',
        avatar: '🔍',
        capabilities: ['Code Review', 'Best Practices', 'Security Analysis'],
        performance: { tasksCompleted: 0, successRate: 0, avgResponseTime: 0 }
      },
      {
        id: 'documenter',
        name: 'Documenter',
        role: 'Documentation & Knowledge',
        status: 'idle',
        avatar: '📚',
        capabilities: ['API Documentation', 'Code Comments', 'User Guides'],
        performance: { tasksCompleted: 0, successRate: 0, avgResponseTime: 0 }
      }
    ],
    activeTasks: [],
    completedTasks: [],
    selectedAgent: null,
    currentProject: null
  });

  const [activeView, setActiveView] = useState<'dashboard' | 'chat' | 'tasks' | 'analytics'>('dashboard');
  const [taskInput, setTaskInput] = useState('');
  const [isTeamMode, setIsTeamMode] = useState(true);

  useEffect(() => {
    // Listen for VS Code API messages
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'projectInfo':
          setState(prev => ({ ...prev, currentProject: message.data }));
          break;
        case 'agentUpdate':
          updateAgentStatus(message.agentId, message.status, message.task);
          break;
        case 'taskCompleted':
          handleTaskCompletion(message.result);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const updateAgentStatus = (agentId: string, status: Agent['status'], task?: string) => {
    setState(prev => ({
      ...prev,
      agents: prev.agents.map(agent =>
        agent.id === agentId ? { ...agent, status, currentTask: task } : agent
      )
    }));
  };

  const handleTaskCompletion = (result: AgentResult) => {
    setState(prev => ({
      ...prev,
      completedTasks: [...prev.completedTasks, result],
      agents: prev.agents.map(agent =>
        agent.id === result.agentId ? {
          ...agent,
          status: 'completed',
          currentTask: undefined,
          performance: {
            tasksCompleted: agent.performance.tasksCompleted + 1,
            successRate: result.success ? 
              (agent.performance.successRate * agent.performance.tasksCompleted + 100) / (agent.performance.tasksCompleted + 1) :
              (agent.performance.successRate * agent.performance.tasksCompleted) / (agent.performance.tasksCompleted + 1),
            avgResponseTime: (agent.performance.avgResponseTime * agent.performance.tasksCompleted + result.executionTime) / (agent.performance.tasksCompleted + 1)
          }
        } : agent
      )
    }));
  };

  const submitTask = () => {
    if (!taskInput.trim()) return;

    // Send task to VS Code extension
    vscode.postMessage({
      type: 'submitTask',
      task: taskInput,
      mode: isTeamMode ? 'team' : 'individual',
      selectedAgent: state.selectedAgent
    });

    setTaskInput('');
  };

  const vscode = acquireVsCodeApi();

  return (
    <div className="agent-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🤖 AI Dev Team</h1>
          <span className="project-name">{state.currentProject?.name || 'No project loaded'}</span>
        </div>
        <div className="header-right">
          <div className="view-switcher">
            <button 
              className={activeView === 'dashboard' ? 'active' : ''} 
              onClick={() => setActiveView('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={activeView === 'chat' ? 'active' : ''} 
              onClick={() => setActiveView('chat')}
            >
              Chat
            </button>
            <button 
              className={activeView === 'tasks' ? 'active' : ''} 
              onClick={() => setActiveView('tasks')}
            >
              Tasks
            </button>
            <button 
              className={activeView === 'analytics' ? 'active' : ''} 
              onClick={() => setActiveView('analytics')}
            >
              Analytics
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        {activeView === 'dashboard' && (
          <>
            <div className="task-input-section">
              <h2>🎯 New Task</h2>
              <div className="task-input-container">
                <textarea
                  className="task-input"
                  placeholder="Describe what you want the AI team to build..."
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      submitTask();
                    }
                  }}
                />
                <div className="task-options">
                  <label className="team-mode-toggle">
                    <input
                      type="checkbox"
                      checked={isTeamMode}
                      onChange={(e) => setIsTeamMode(e.target.checked)}
                    />
                    <span>Team Collaboration Mode</span>
                  </label>
                  <button className="submit-button" onClick={submitTask}>
                    ▶ Start Task
                  </button>
                </div>
              </div>
            </div>

            <div className="agents-grid">
              <h2>👥 AI Agents</h2>
              <div className="agents-container">
                {state.agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={state.selectedAgent === agent.id}
                    onSelect={() => setState(prev => ({ 
                      ...prev, 
                      selectedAgent: prev.selectedAgent === agent.id ? null : agent.id 
                    }))}
                  />
                ))}
              </div>
            </div>

            {state.activeTasks.length > 0 && (
              <div className="active-tasks-section">
                <h2>🔄 Active Tasks</h2>
                <TaskProgress tasks={state.activeTasks} agents={state.agents} />
              </div>
            )}

            {state.currentProject && (
              <div className="project-overview-section">
                <h2>📁 Project Overview</h2>
                <ProjectOverview project={state.currentProject} />
              </div>
            )}
          </>
        )}

        {activeView === 'chat' && (
          <ChatInterface
            agents={state.agents}
            selectedAgent={state.selectedAgent}
            onAgentSelect={(agentId) => setState(prev => ({ ...prev, selectedAgent: agentId }))}
          />
        )}

        {activeView === 'tasks' && (
          <div className="tasks-view">
            <h2>📋 Task History</h2>
            <div className="tasks-list">
              {state.completedTasks.map((task, index) => (
                <div key={index} className="task-item">
                  <div className="task-header">
                    <span className={`task-status ${task.success ? 'success' : 'error'}`}>
                      {task.success ? '✅' : '❌'}
                    </span>
                    <span className="task-agent">{task.agentId}</span>
                    <span className="task-time">{new Date(task.completedAt).toLocaleString()}</span>
                  </div>
                  <div className="task-description">{task.task.description}</div>
                  <div className="task-result">{task.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'analytics' && (
          <div className="analytics-view">
            <h2>📊 Team Analytics</h2>
            <div className="analytics-grid">
              {state.agents.map(agent => (
                <div key={agent.id} className="agent-analytics">
                  <h3>{agent.avatar} {agent.name}</h3>
                  <div className="analytics-stats">
                    <div className="stat">
                      <span className="stat-label">Tasks Completed</span>
                      <span className="stat-value">{agent.performance.tasksCompleted}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Success Rate</span>
                      <span className="stat-value">{agent.performance.successRate.toFixed(1)}%</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Avg Response Time</span>
                      <span className="stat-value">{(agent.performance.avgResponseTime / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="dashboard-footer">
        <div className="footer-status">
          <span className="status-indicator"></span>
          <span>Connected to AI Models</span>
        </div>
        <div className="footer-info">
          <span>Powered by Ollama</span>
          <span className="separator">•</span>
          <span>{state.agents.filter(a => a.status === 'working').length} agents working</span>
        </div>
      </footer>
    </div>
  );
};