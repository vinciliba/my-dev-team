/**
 * Project Orchestrator
 * Central coordinator for managing AI agents and orchestrating development workflows
 */

import { AgentCommunication, AgentId, Message, AgentInfo, AgentType, AgentStatus } from './AgentCommunication';
import { ProjectContext } from '../context/ProjectContext';
import { WorkspaceAnalyzer } from '../context/WorkspaceAnalyzer';
import { FileSystemWatcher } from '../context/FileSystemWatcher';
import { AnalysisResult, AnalysisSummary } from '../types/Analysis';
import { FileChange, ProjectStructure } from '../types/Projects';
import { Task, TaskStatus, TaskPriority, TaskType } from '../types/Task';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface OrchestratorConfig {
  workspaceRoot: string;
  maxConcurrentTasks: number;
  taskTimeout: number;
  autoAssignTasks: boolean;
  enableFileWatching: boolean;
  enableContinuousAnalysis: boolean;
  agentHealthCheckInterval: number;
  taskPrioritizationStrategy: 'fifo' | 'priority' | 'smart';
}

export interface ProjectGoal {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  deadline?: Date;
  requirements: string[];
  constraints: string[];
  successCriteria: string[];
  status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  assignedAgents: AgentId[];
  progress: number; // 0-100
  milestones: ProjectMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  description: string;
  dueDate?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  dependencies: string[];
  deliverables: string[];
  progress: number;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  description: string;
  requiredAgentTypes: AgentType[];
  tasks: Task[];
  dependencies: string[];
  status: 'pending' | 'ready' | 'in-progress' | 'completed' | 'blocked';
  estimatedDuration: number; // hours
  actualDuration?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface OrchestratorStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
  averageTaskDuration: number;
  agentUtilization: Record<AgentId, number>;
  projectProgress: number;
  estimatedCompletion: Date | null;
  lastUpdated: Date;
}

export interface AgentCapability {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  tags: string[];
  estimatedSpeed: number; // tasks per hour
  successRate: number; // 0-1
  lastUsed?: Date;
}

export interface TaskAssignment {
  taskId: string;
  agentId: AgentId;
  assignedAt: Date;
  estimatedDuration: number;
  actualDuration?: number;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];
  metadata: Record<string, any>;
}

/**
 * Central orchestrator for coordinating AI agents in development workflows
 */
export class ProjectOrchestrator extends EventEmitter {
  private logger: Logger;
  private config: OrchestratorConfig;
  
  // Core components
  private communication: AgentCommunication;
  private projectContext: ProjectContext;
  private workspaceAnalyzer: WorkspaceAnalyzer;
  private fileWatcher: FileSystemWatcher | null = null;
  
  // Project management
  private currentGoal: ProjectGoal | null = null;
  private workflowPhases: WorkflowPhase[] = [];
  private taskQueue: Task[] = [];
  private activeTasks = new Map<string, TaskAssignment>();
  private completedTasks: Task[] = [];
  private failedTasks: Task[] = [];
  
  // Agent management
  private agentCapabilities = new Map<AgentId, AgentCapability[]>();
  private agentWorkload = new Map<AgentId, number>();
  private agentPerformance = new Map<AgentId, {
    tasksCompleted: number;
    averageTime: number;
    successRate: number;
    lastActive: Date;
  }>();
  
  // State management
  private isRunning: boolean = false;
  private stats: OrchestratorStats;
  private lastAnalysis: AnalysisResult | null = null;
  
  // Intervals and timers
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;
  private taskProcessingInterval: NodeJS.Timeout | null = null;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.logger = new Logger('ProjectOrchestrator');
    this.stats = this.initializeStats();
    
    this.logger.info(`Project Orchestrator initialized for: ${config.workspaceRoot}`);
  }

  /**
   * Initialize the orchestrator with project context
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Project Orchestrator...');
    
    try {
      // Initialize core components
      this.communication = new AgentCommunication();
      this.projectContext = new ProjectContext(this.config.workspaceRoot);
      this.workspaceAnalyzer = new WorkspaceAnalyzer(this.projectContext);
      
      // Initialize project context
      await this.projectContext.initialize();
      
      // Setup file watching if enabled
      if (this.config.enableFileWatching) {
        this.fileWatcher = new FileSystemWatcher(this.config.workspaceRoot);
        await this.fileWatcher.start();
        this.setupFileWatchingHandlers();
      }
      
      // Setup communication handlers
      this.setupCommunicationHandlers();
      
      // Perform initial analysis
      this.lastAnalysis = await this.workspaceAnalyzer.analyzeWorkspace();
      
      this.logger.info('Project Orchestrator initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize Project Orchestrator:', error);
      throw error;
    }
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Orchestrator is already running');
      return;
    }

    this.logger.info('Starting Project Orchestrator...');
    
    this.isRunning = true;
    this.startHealthChecks();
    this.startTaskProcessing();
    
    if (this.config.enableContinuousAnalysis) {
      this.startContinuousAnalysis();
    }
    
    this.logger.info('Project Orchestrator started successfully');
    this.emit('started');
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Orchestrator is not running');
      return;
    }

    this.logger.info('Stopping Project Orchestrator...');
    
    this.isRunning = false;
    this.stopIntervals();
    
    // Cancel active tasks
    for (const assignment of this.activeTasks.values()) {
      await this.cancelTask(assignment.taskId, 'Orchestrator shutdown');
    }
    
    // Shutdown components
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
    }
    
    await this.communication.shutdown();
    await this.projectContext.dispose();
    
    this.logger.info('Project Orchestrator stopped successfully');
    this.emit('stopped');
  }

  /**
   * Set the current project goal
   */
  setProjectGoal(goal: Omit<ProjectGoal, 'id' | 'createdAt' | 'updatedAt' | 'progress' | 'status'>): string {
    const projectGoal: ProjectGoal = {
      ...goal,
      id: this.generateId('goal'),
      status: 'planned',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.currentGoal = projectGoal;
    this.logger.info(`Project goal set: ${goal.title}`);
    this.emit('goal-set', projectGoal);
    
    // Generate initial workflow phases
    this.generateWorkflowPhases();
    
    return projectGoal.id;
  }

  /**
   * Register an AI agent with the orchestrator
   */
  registerAgent(
    agentInfo: Omit<AgentInfo, 'lastSeen'>,
    capabilities: AgentCapability[]
  ): void {
    this.communication.registerAgent(agentInfo);
    this.agentCapabilities.set(agentInfo.id, capabilities);
    this.agentWorkload.set(agentInfo.id, 0);
    this.initializeAgentPerformance(agentInfo.id);
    
    this.logger.info(`Agent registered: ${agentInfo.name} (${agentInfo.type}) with ${capabilities.length} capabilities`);
    this.emit('agent-registered', agentInfo, capabilities);
    
    // Try to assign pending tasks
    if (this.config.autoAssignTasks) {
      this.processPendingTasks();
    }
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: AgentId): void {
    // Reassign active tasks
    const activeTasksForAgent = Array.from(this.activeTasks.values())
      .filter(assignment => assignment.agentId === agentId);
    
    for (const assignment of activeTasksForAgent) {
      this.reassignTask(assignment.taskId, 'Agent unregistered');
    }
    
    this.communication.unregisterAgent(agentId);
    this.agentCapabilities.delete(agentId);
    this.agentWorkload.delete(agentId);
    this.agentPerformance.delete(agentId);
    
    this.logger.info(`Agent unregistered: ${agentId}`);
    this.emit('agent-unregistered', agentId);
  }

  /**
   * Create and queue a new task
   */
  createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): string {
    const task: Task = {
      ...taskData,
      id: this.generateId('task'),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.taskQueue.push(task);
    this.logger.info(`Task created: ${task.title} (${task.type}, ${task.priority})`);
    this.emit('task-created', task);
    
    // Try to assign immediately if auto-assignment is enabled
    if (this.config.autoAssignTasks && this.isRunning) {
      this.processPendingTasks();
    }
    
    this.updateStats();
    return task.id;
  }

  /**
   * Assign a task to a specific agent
   */
  async assignTask(taskId: string, agentId: AgentId): Promise<boolean> {
    const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      this.logger.warn(`Attempted to assign non-existent task: ${taskId}`);
      return false;
    }
    
    const task = this.taskQueue[taskIndex];
    const agent = this.communication.getAgent(agentId);
    
    if (!agent) {
      this.logger.warn(`Attempted to assign task to non-existent agent: ${agentId}`);
      return false;
    }
    
    if (agent.status !== 'online' && agent.status !== 'idle') {
      this.logger.warn(`Cannot assign task to agent ${agentId} with status: ${agent.status}`);
      return false;
    }
    
    // Check if agent can handle more tasks
    const currentWorkload = this.agentWorkload.get(agentId) || 0;
    if (currentWorkload >= 3) { // Max 3 concurrent tasks per agent
      this.logger.warn(`Agent ${agentId} is at maximum capacity`);
      return false;
    }
    
    // Remove from queue and create assignment
    this.taskQueue.splice(taskIndex, 1);
    
    const assignment: TaskAssignment = {
      taskId,
      agentId,
      assignedAt: new Date(),
      estimatedDuration: this.estimateTaskDuration(task, agentId),
      status: 'assigned',
      priority: task.priority,
      dependencies: task.dependencies || [],
      metadata: task.metadata || {}
    };
    
    this.activeTasks.set(taskId, assignment);
    this.agentWorkload.set(agentId, currentWorkload + 1);
    
    // Update agent status
    this.communication.updateAgentStatus(agentId, 'busy', task.title);
    
    // Send task assignment message
    await this.communication.sendMessage({
      from: 'orchestrator',
      to: agentId,
      type: 'task-assignment',
      content: {
        task,
        assignment,
        context: this.getTaskContext(task)
      },
      priority: this.mapTaskPriorityToMessagePriority(task.priority),
      correlationId: taskId,
      metadata: { taskId, assignmentId: assignment.taskId }
    });
    
    this.logger.info(`Task assigned: ${task.title} -> ${agent.name}`);
    this.emit('task-assigned', task, assignment);
    this.updateStats();
    
    return true;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason: string): Promise<boolean> {
    // Check if task is in queue
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex > -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      this.logger.info(`Task cancelled from queue: ${task.title} - ${reason}`);
      this.emit('task-cancelled', task, reason);
      return true;
    }
    
    // Check if task is active
    const assignment = this.activeTasks.get(taskId);
    if (assignment) {
      // Notify agent
      await this.communication.sendMessage({
        from: 'orchestrator',
        to: assignment.agentId,
        type: 'task-cancellation',
        content: { taskId, reason },
        priority: 'high',
        metadata: { taskId }
      });
      
      // Clean up
      this.activeTasks.delete(taskId);
      const currentWorkload = this.agentWorkload.get(assignment.agentId) || 0;
      this.agentWorkload.set(assignment.agentId, Math.max(0, currentWorkload - 1));
      
      this.logger.info(`Active task cancelled: ${taskId} - ${reason}`);
      this.emit('task-cancelled', assignment, reason);
      this.updateStats();
      
      return true;
    }
    
    return false;
  }

  /**
   * Get current project status
   */
  getProjectStatus(): {
    goal: ProjectGoal | null;
    phases: WorkflowPhase[];
    stats: OrchestratorStats;
    analysis: AnalysisSummary | null;
  } {
    return {
      goal: this.currentGoal,
      phases: this.workflowPhases,
      stats: this.getStats(),
      analysis: this.lastAnalysis ? this.workspaceAnalyzer.getAnalysisSummary() : null
    };
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentInfo[] {
    return this.communication.getAgents();
  }

  /**
   * Get task queue
   */
  getTaskQueue(): Task[] {
    return [...this.taskQueue];
  }

  /**
   * Get active tasks
   */
  getActiveTasks(): TaskAssignment[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): OrchestratorStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Trigger immediate workspace analysis
   */
  async analyzeWorkspace(force: boolean = false): Promise<AnalysisResult> {
    this.logger.info('Triggering workspace analysis...');
    this.lastAnalysis = await this.workspaceAnalyzer.analyzeWorkspace(force);
    this.emit('analysis-completed', this.lastAnalysis);
    
    // Generate recommendations and potential tasks
    this.processAnalysisResults(this.lastAnalysis);
    
    return this.lastAnalysis;
  }

  /**
   * Force task processing
   */
  processPendingTasks(): void {
    if (!this.isRunning) return;
    
    const availableTasks = this.taskQueue
      .filter(task => this.areTaskDependenciesMet(task))
      .sort((a, b) => this.compareTaskPriority(a, b));
    
    for (const task of availableTasks) {
      const bestAgent = this.findBestAgentForTask(task);
      if (bestAgent) {
        this.assignTask(task.id, bestAgent.id);
      }
    }
  }

  // Private methods

  private setupCommunicationHandlers(): void {
    // Handle task completion
    this.communication.registerMessageHandler('orchestrator', {
      messageType: 'task-completion',
      handler: async (message: Message) => {
        await this.handleTaskCompletion(message);
      },
      priority: 10
    });
    
    // Handle task updates
    this.communication.registerMessageHandler('orchestrator', {
      messageType: 'task-update',
      handler: async (message: Message) => {
        await this.handleTaskUpdate(message);
      },
      priority: 8
    });
    
    // Handle error reports
    this.communication.registerMessageHandler('orchestrator', {
      messageType: 'error-report',
      handler: async (message: Message) => {
        await this.handleTaskError(message);
      },
      priority: 10
    });
    
    // Handle assistance requests
    this.communication.registerMessageHandler('orchestrator', {
      messageType: 'request-assistance',
      handler: async (message: Message) => {
        await this.handleAssistanceRequest(message);
      },
      priority: 7
    });
  }

  private setupFileWatchingHandlers(): void {
    if (!this.fileWatcher) return;
    
    this.fileWatcher.onFileChange(async (change: FileChange) => {
      this.logger.debug(`File ${change.type}: ${change.path}`);
      
      // Trigger incremental analysis for significant changes
      if (this.isSignificantChange(change)) {
        try {
          const deltaAnalysis = await this.workspaceAnalyzer.analyzeChangedFiles([change]);
          if (deltaAnalysis.securityIssues?.length || deltaAnalysis.qualityIssues?.length) {
            this.processAnalysisResults(deltaAnalysis as AnalysisResult);
          }
        } catch (error) {
          this.logger.error('Error in incremental analysis:', error);
        }
      }
    });
  }

  private async handleTaskCompletion(message: Message): Promise<void> {
    const { taskId, result, duration } = message.content;
    const assignment = this.activeTasks.get(taskId);
    
    if (!assignment) {
      this.logger.warn(`Received completion for unknown task: ${taskId}`);
      return;
    }
    
    // Update assignment
    assignment.status = 'completed';
    assignment.actualDuration = duration;
    
    // Move to completed tasks
    this.activeTasks.delete(taskId);
    const task = this.findTaskById(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.updatedAt = new Date();
      this.completedTasks.push(task);
    }
    
    // Update agent workload and performance
    const currentWorkload = this.agentWorkload.get(assignment.agentId) || 0;
    this.agentWorkload.set(assignment.agentId, Math.max(0, currentWorkload - 1));
    this.updateAgentPerformance(assignment.agentId, duration, true);
    
    // Update agent status if no more tasks
    if (currentWorkload - 1 === 0) {
      this.communication.updateAgentStatus(assignment.agentId, 'idle');
    }
    
    this.logger.info(`Task completed: ${taskId} by ${assignment.agentId}`);
    this.emit('task-completed', task, assignment, result);
    this.updateStats();
    
    // Check if this enables other tasks
    this.processPendingTasks();
    
    // Check workflow phase completion
    this.checkPhaseCompletion();
  }

  private async handleTaskUpdate(message: Message): Promise<void> {
    const { taskId, progress, status, details } = message.content;
    const assignment = this.activeTasks.get(taskId);
    
    if (!assignment) {
      this.logger.warn(`Received update for unknown task: ${taskId}`);
      return;
    }
    
    assignment.status = status;
    assignment.metadata.progress = progress;
    assignment.metadata.lastUpdate = new Date();
    
    this.logger.debug(`Task update: ${taskId} - ${progress}% (${status})`);
    this.emit('task-updated', assignment, progress, details);
  }

  private async handleTaskError(message: Message): Promise<void> {
    const { taskId, error, recoverable } = message.content;
    const assignment = this.activeTasks.get(taskId);
    
    if (!assignment) {
      this.logger.warn(`Received error for unknown task: ${taskId}`);
      return;
    }
    
    this.logger.error(`Task error: ${taskId} - ${error}`);
    
    if (recoverable) {
      // Try to reassign
      this.reassignTask(taskId, `Error: ${error}`);
    } else {
      // Mark as failed
      assignment.status = 'failed';
      this.activeTasks.delete(taskId);
      
      const task = this.findTaskById(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error;
        task.updatedAt = new Date();
        this.failedTasks.push(task);
      }
      
      // Update agent workload
      const currentWorkload = this.agentWorkload.get(assignment.agentId) || 0;
      this.agentWorkload.set(assignment.agentId, Math.max(0, currentWorkload - 1));
      this.updateAgentPerformance(assignment.agentId, 0, false);
      
      this.emit('task-failed', task, assignment, error);
      this.updateStats();
    }
  }

  private async handleAssistanceRequest(message: Message): Promise<void> {
    const { taskId, assistanceType, details } = message.content;
    const requestingAgent = message.from;
    
    this.logger.info(`Assistance requested by ${requestingAgent} for task ${taskId}: ${assistanceType}`);
    
    // Find suitable agents to provide assistance
    const assistantAgents = this.findAssistantAgents(assistanceType, requestingAgent);
    
    if (assistantAgents.length > 0) {
      // Create assistance channel
      const channelId = `assist-${taskId}-${Date.now()}`;
      this.communication.createChannel(
        channelId,
        `Assistance for Task ${taskId}`,
        'task-specific',
        [requestingAgent, ...assistantAgents.map(a => a.id)],
        { topic: `${assistanceType} assistance` }
      );
      
      // Notify potential assistants
      for (const assistant of assistantAgents) {
        await this.communication.sendMessage({
          from: 'orchestrator',
          to: assistant.id,
          channel: channelId,
          type: 'request-assistance',
          content: {
            requestingAgent,
            taskId,
            assistanceType,
            details,
            channelId
          },
          priority: 'normal',
          metadata: { assistanceRequest: true }
        });
      }
    } else {
      // No assistance available
      await this.communication.replyToMessage(message, {
        success: false,
        message: 'No suitable agents available for assistance'
      });
    }
  }

  private generateWorkflowPhases(): void {
    if (!this.currentGoal) return;
    
    // Generate standard development workflow phases
    this.workflowPhases = [
      {
        id: 'analysis',
        name: 'Requirements Analysis',
        description: 'Analyze requirements and create technical specifications',
        requiredAgentTypes: ['architect', 'analyst'],
        tasks: [],
        dependencies: [],
        status: 'ready',
        estimatedDuration: 8
      },
      {
        id: 'design',
        name: 'System Design',
        description: 'Create system architecture and detailed design',
        requiredAgentTypes: ['architect', 'designer'],
        tasks: [],
        dependencies: ['analysis'],
        status: 'pending',
        estimatedDuration: 16
      },
      {
        id: 'implementation',
        name: 'Implementation',
        description: 'Implement the designed solution',
        requiredAgentTypes: ['developer'],
        tasks: [],
        dependencies: ['design'],
        status: 'pending',
        estimatedDuration: 40
      },
      {
        id: 'testing',
        name: 'Testing & QA',
        description: 'Test the implementation and ensure quality',
        requiredAgentTypes: ['tester', 'reviewer'],
        tasks: [],
        dependencies: ['implementation'],
        status: 'pending',
        estimatedDuration: 16
      },
      {
        id: 'deployment',
        name: 'Deployment',
        description: 'Deploy and configure the solution',
        requiredAgentTypes: ['deployment'],
        tasks: [],
        dependencies: ['testing'],
        status: 'pending',
        estimatedDuration: 8
      }
    ];
    
    this.logger.info(`Generated ${this.workflowPhases.length} workflow phases`);
    this.emit('workflow-generated', this.workflowPhases);
  }

  private findBestAgentForTask(task: Task): AgentInfo | null {
    const availableAgents = this.communication.getAgentsByStatus('online')
      .concat(this.communication.getAgentsByStatus('idle'))
      .filter(agent => {
        const workload = this.agentWorkload.get(agent.id) || 0;
        return workload < 3; // Max 3 concurrent tasks
      });
    
    if (availableAgents.length === 0) return null;
    
    // Score agents based on capabilities, workload, and performance
    const scoredAgents = availableAgents.map(agent => ({
      agent,
      score: this.calculateAgentScore(agent, task)
    }));
    
    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score);
    
    return scoredAgents[0]?.agent || null;
  }

  private calculateAgentScore(agent: AgentInfo, task: Task): number {
    let score = 0;
    
    // Base score for agent type match
    if (task.requiredSkills?.includes(agent.type)) {
      score += 50;
    }
    
    // Capability match
    const capabilities = this.agentCapabilities.get(agent.id) || [];
    const matchingCapabilities = capabilities.filter(cap => 
      task.requiredSkills?.some(skill => 
        cap.name.toLowerCase().includes(skill.toLowerCase()) ||
        cap.tags.some(tag => tag.toLowerCase().includes(skill.toLowerCase()))
      )
    );
    score += matchingCapabilities.length * 10;
    
    // Workload penalty
    const workload = this.agentWorkload.get(agent.id) || 0;
    score -= workload * 15;
    
    // Performance bonus
    const performance = this.agentPerformance.get(agent.id);
    if (performance) {
      score += performance.successRate * 20;
      score += Math.max(0, 10 - performance.averageTime / 3600) * 5; // Faster agents get bonus
    }
    
    return score;
  }

  private areTaskDependenciesMet(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) return true;
    
    return task.dependencies.every(depId => 
      this.completedTasks.some(t => t.id === depId)
    );
  }

  private compareTaskPriority(a: Task, b: Task): number {
    const priorityWeights = { urgent: 4, high: 3, normal: 2, low: 1 };
    return priorityWeights[b.priority] - priorityWeights[a.priority];
  }

  private estimateTaskDuration(task: Task, agentId: AgentId): number {
    const capabilities = this.agentCapabilities.get(agentId) || [];
    const performance = this.agentPerformance.get(agentId);
    
    let baseDuration = task.estimatedHours || 4; // Default 4 hours
    
    // Adjust based on agent capabilities
    const relevantCapabilities = capabilities.filter(cap => 
      task.requiredSkills?.some(skill => cap.name.includes(skill))
    );
    
    if (relevantCapabilities.length > 0) {
      const avgLevel = relevantCapabilities.reduce((sum, cap) => {
        const levelScore = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
        return sum + levelScore[cap.level];
      }, 0) / relevantCapabilities.length;
      
      baseDuration *= (5 - avgLevel) * 0.2 + 0.2; // Expert = 0.4x, Beginner = 1.0x
    }
    
    // Adjust based on historical performance
    if (performance && performance.averageTime > 0) {
      const speedFactor = performance.averageTime / (4 * 3600); // Normalize to 4 hours
      baseDuration *= speedFactor;
    }
    
    return Math.max(0.5, baseDuration); // Minimum 30 minutes
  }

  private getTaskContext(task: Task): any {
    return {
      projectStructure: this.projectContext.getProjectStructure(),
      recentChanges: this.projectContext.getRecentChanges(10),
      analysisResults: this.lastAnalysis ? this.workspaceAnalyzer.getAnalysisSummary() : null,
      projectGoal: this.currentGoal,
      relatedTasks: this.findRelatedTasks(task),
      workspaceRoot: this.config.workspaceRoot
    };
  }

  private findRelatedTasks(task: Task): Task[] {
    return this.completedTasks
      .concat(Array.from(this.activeTasks.values()).map(a => this.findTaskById(a.taskId)).filter(Boolean) as Task[])
      .filter(t => 
        t.id !== task.id && (
          t.type === task.type ||
          t.tags?.some(tag => task.tags?.includes(tag)) ||
          t.component === task.component
        )
      )
      .slice(0, 5); // Limit to 5 related tasks
  }

  private findTaskById(taskId: string): Task | null {
    return this.taskQueue.find(t => t.id === taskId) ||
           this.completedTasks.find(t => t.id === taskId) ||
           this.failedTasks.find(t => t.id === taskId) ||
           null;
  }

  private async reassignTask(taskId: string, reason: string): Promise<void> {
    const assignment = this.activeTasks.get(taskId);
    if (!assignment) return;

    const task = this.findTaskById(taskId);
    if (!task) return;

    this.logger.info(`Reassigning task ${taskId}: ${reason}`);

    // Remove current assignment
    this.activeTasks.delete(taskId);
    const currentWorkload = this.agentWorkload.get(assignment.agentId) || 0;
    this.agentWorkload.set(assignment.agentId, Math.max(0, currentWorkload - 1));

    // Add back to queue
    task.status = 'pending';
    task.metadata.reassignmentReason = reason;
    task.metadata.previousAgent = assignment.agentId;
    this.taskQueue.unshift(task); // High priority for reassignment

    this.emit('task-reassigned', task, assignment, reason);
    
    // Try to assign to different agent
    setTimeout(() => this.processPendingTasks(), 1000);
  }

  private findAssistantAgents(assistanceType: string, requestingAgent: AgentId): AgentInfo[] {
    return this.communication.getAgents()
      .filter(agent => 
        agent.id !== requestingAgent &&
        (agent.status === 'online' || agent.status === 'idle') &&
        this.canProvideAssistance(agent, assistanceType)
      )
      .slice(0, 3); // Limit to 3 assistants
  }

  private canProvideAssistance(agent: AgentInfo, assistanceType: string): boolean {
    const capabilities = this.agentCapabilities.get(agent.id) || [];
    
    switch (assistanceType) {
      case 'code-review':
        return agent.type === 'reviewer' || agent.type === 'architect';
      case 'debugging':
        return agent.type === 'developer' || agent.type === 'tester';
      case 'security-review':
        return agent.type === 'security';
      case 'performance-optimization':
        return agent.type === 'performance' || agent.type === 'architect';
      case 'documentation':
        return agent.type === 'documentation' || agent.capabilities.includes('documentation');
      default:
        return capabilities.some(cap => 
          cap.name.toLowerCase().includes(assistanceType.toLowerCase()) ||
          cap.tags.some(tag => tag.toLowerCase().includes(assistanceType.toLowerCase()))
        );
    }
  }

  private processAnalysisResults(analysis: AnalysisResult): void {
    // Generate tasks based on analysis findings
    const generatedTasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    // Security issues
    if (analysis.securityIssues && analysis.securityIssues.length > 0) {
      const criticalSecurityIssues = analysis.securityIssues.filter(issue => issue.severity === 'critical');
      if (criticalSecurityIssues.length > 0) {
        generatedTasks.push({
          title: 'Address Critical Security Vulnerabilities',
          description: `Fix ${criticalSecurityIssues.length} critical security issues found in analysis`,
          type: 'security-fix',
          priority: 'urgent',
          status: 'pending',
          requiredSkills: ['security', 'code-review'],
          estimatedHours: criticalSecurityIssues.length * 2,
          metadata: {
            securityIssues: criticalSecurityIssues,
            autoGenerated: true
          }
        });
      }
    }

    // Performance issues
    if (analysis.performanceIssues && analysis.performanceIssues.length > 0) {
      const significantPerformanceIssues = analysis.performanceIssues.filter(
        issue => issue.severity === 'high' || issue.severity === 'critical'
      );
      if (significantPerformanceIssues.length > 0) {
        generatedTasks.push({
          title: 'Optimize Performance Issues',
          description: `Address ${significantPerformanceIssues.length} performance bottlenecks`,
          type: 'performance-optimization',
          priority: 'high',
          status: 'pending',
          requiredSkills: ['performance', 'optimization'],
          estimatedHours: significantPerformanceIssues.length * 1.5,
          metadata: {
            performanceIssues: significantPerformanceIssues,
            autoGenerated: true
          }
        });
      }
    }

    // Quality issues
    if (analysis.qualityIssues && analysis.qualityIssues.length > 5) {
      generatedTasks.push({
        title: 'Improve Code Quality',
        description: `Address ${analysis.qualityIssues.length} code quality issues`,
        type: 'code-improvement',
        priority: 'normal',
        status: 'pending',
        requiredSkills: ['code-review', 'refactoring'],
        estimatedHours: Math.min(analysis.qualityIssues.length * 0.3, 8),
        metadata: {
          qualityIssues: analysis.qualityIssues,
          autoGenerated: true
        }
      });
    }

    // Technical debt
    if (analysis.technicalDebt && analysis.technicalDebt.length > 0) {
      const highPriorityDebt = analysis.technicalDebt.filter(debt => debt.priority === 'high' || debt.priority === 'critical');
      if (highPriorityDebt.length > 0) {
        generatedTasks.push({
          title: 'Address Technical Debt',
          description: `Resolve high-priority technical debt items`,
          type: 'refactoring',
          priority: 'normal',
          status: 'pending',
          requiredSkills: ['refactoring', 'architecture'],
          estimatedHours: highPriorityDebt.reduce((sum, debt) => sum + debt.estimatedHours, 0),
          metadata: {
            technicalDebt: highPriorityDebt,
            autoGenerated: true
          }
        });
      }
    }

    // Create the generated tasks
    for (const taskData of generatedTasks) {
      this.createTask(taskData);
    }

    if (generatedTasks.length > 0) {
      this.logger.info(`Generated ${generatedTasks.length} tasks based on analysis results`);
      this.emit('tasks-generated', generatedTasks);
    }
  }

  private isSignificantChange(change: FileChange): boolean {
    const significantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];
    const significantFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'pom.xml'];
    
    return significantExtensions.some(ext => change.path.endsWith(ext)) ||
           significantFiles.some(file => change.path.includes(file));
  }

  private checkPhaseCompletion(): void {
    for (const phase of this.workflowPhases) {
      if (phase.status === 'in-progress') {
        const phaseTasks = phase.tasks;
        const completedPhaseTasks = phaseTasks.filter(taskId => 
          this.completedTasks.some(t => t.id === taskId)
        );
        
        if (completedPhaseTasks.length === phaseTasks.length && phaseTasks.length > 0) {
          phase.status = 'completed';
          phase.endTime = new Date();
          phase.actualDuration = phase.endTime.getTime() - (phase.startTime?.getTime() || 0);
          
          this.logger.info(`Workflow phase completed: ${phase.name}`);
          this.emit('phase-completed', phase);
          
          // Check if next phase can start
          this.checkPhaseReadiness();
        }
      }
    }
  }

  private checkPhaseReadiness(): void {
    for (const phase of this.workflowPhases) {
      if (phase.status === 'pending') {
        const dependenciesMet = phase.dependencies.every(depId =>
          this.workflowPhases.find(p => p.id === depId)?.status === 'completed'
        );
        
        if (dependenciesMet) {
          phase.status = 'ready';
          this.logger.info(`Workflow phase ready: ${phase.name}`);
          this.emit('phase-ready', phase);
        }
      }
    }
  }

  private initializeAgentPerformance(agentId: AgentId): void {
    this.agentPerformance.set(agentId, {
      tasksCompleted: 0,
      averageTime: 0,
      successRate: 1.0,
      lastActive: new Date()
    });
  }

  private updateAgentPerformance(agentId: AgentId, duration: number, success: boolean): void {
    const performance = this.agentPerformance.get(agentId);
    if (!performance) return;

    performance.tasksCompleted++;
    performance.lastActive = new Date();
    
    if (success) {
      // Update average time (weighted average)
      const weight = Math.min(performance.tasksCompleted, 10); // Cap influence of early tasks
      performance.averageTime = ((performance.averageTime * (weight - 1)) + duration) / weight;
      
      // Update success rate
      performance.successRate = (performance.successRate * 0.9) + (1.0 * 0.1); // Moving average
    } else {
      performance.successRate = (performance.successRate * 0.9) + (0.0 * 0.1); // Penalty for failure
    }
  }

  private mapTaskPriorityToMessagePriority(taskPriority: TaskPriority): 'low' | 'normal' | 'high' | 'urgent' {
    return taskPriority; // Direct mapping
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.agentHealthCheckInterval);
  }

  private startTaskProcessing(): void {
    this.taskProcessingInterval = setInterval(() => {
      if (this.config.autoAssignTasks) {
        this.processPendingTasks();
      }
      this.checkTaskTimeouts();
    }, 5000); // Check every 5 seconds
  }

  private startContinuousAnalysis(): void {
    this.analysisInterval = setInterval(async () => {
      try {
        await this.analyzeWorkspace();
      } catch (error) {
        this.logger.error('Error in continuous analysis:', error);
      }
    }, 300000); // Every 5 minutes
  }

  private stopIntervals(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.taskProcessingInterval) {
      clearInterval(this.taskProcessingInterval);
      this.taskProcessingInterval = null;
    }
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  private performHealthChecks(): void {
    // Check for stuck tasks
    const now = new Date();
    for (const [taskId, assignment] of this.activeTasks) {
      const timeSinceAssigned = now.getTime() - assignment.assignedAt.getTime();
      const timeoutThreshold = (assignment.estimatedDuration * 1000 * 1.5) || this.config.taskTimeout;
      
      if (timeSinceAssigned > timeoutThreshold) {
        this.logger.warn(`Task ${taskId} appears to be stuck (${timeSinceAssigned}ms)`);
        this.reassignTask(taskId, 'Task timeout');
      }
    }
    
    // Check agent responsiveness
    const agents = this.communication.getAgents();
    for (const agent of agents) {
      const timeSinceLastSeen = now.getTime() - agent.lastSeen.getTime();
      if (timeSinceLastSeen > 300000 && agent.status !== 'offline') { // 5 minutes
        this.logger.warn(`Agent ${agent.name} appears unresponsive`);
        this.communication.updateAgentStatus(agent.id, 'offline');
      }
    }
  }

  private checkTaskTimeouts(): void {
    const now = new Date();
    
    for (const [taskId, assignment] of this.activeTasks) {
      const timeElapsed = now.getTime() - assignment.assignedAt.getTime();
      const estimatedTime = assignment.estimatedDuration * 1000;
      
      // Warn if task is taking longer than estimated
      if (timeElapsed > estimatedTime && !assignment.metadata.timeoutWarned) {
        assignment.metadata.timeoutWarned = true;
        this.logger.warn(`Task ${taskId} is taking longer than estimated`);
        this.emit('task-timeout-warning', assignment);
      }
      
      // Hard timeout
      if (timeElapsed > this.config.taskTimeout) {
        this.logger.error(`Task ${taskId} has exceeded maximum timeout`);
        this.reassignTask(taskId, 'Hard timeout exceeded');
      }
    }
  }

  private initializeStats(): OrchestratorStats {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      activeTasks: 0,
      averageTaskDuration: 0,
      agentUtilization: {},
      projectProgress: 0,
      estimatedCompletion: null,
      lastUpdated: new Date()
    };
  }

  private updateStats(): void {
    this.stats.totalTasks = this.taskQueue.length + this.activeTasks.size + this.completedTasks.length + this.failedTasks.length;
    this.stats.completedTasks = this.completedTasks.length;
    this.stats.failedTasks = this.failedTasks.length;
    this.stats.activeTasks = this.activeTasks.size;
    
    // Calculate average task duration
    if (this.completedTasks.length > 0) {
      const totalDuration = this.completedTasks.reduce((sum, task) => {
        const assignment = Array.from(this.activeTasks.values()).find(a => a.taskId === task.id);
        return sum + (assignment?.actualDuration || 0);
      }, 0);
      this.stats.averageTaskDuration = totalDuration / this.completedTasks.length;
    }
    
    // Calculate agent utilization
    for (const agent of this.communication.getAgents()) {
      const workload = this.agentWorkload.get(agent.id) || 0;
      const maxWorkload = 3; // Maximum tasks per agent
      this.stats.agentUtilization[agent.id] = (workload / maxWorkload) * 100;
    }
    
    // Calculate project progress
    if (this.currentGoal) {
      const totalTasks = this.stats.totalTasks;
      const progress = totalTasks > 0 ? (this.stats.completedTasks / totalTasks) * 100 : 0;
      this.stats.projectProgress = Math.min(100, progress);
      this.currentGoal.progress = this.stats.projectProgress;
    }
    
    // Estimate completion time
    if (this.stats.averageTaskDuration > 0 && this.taskQueue.length > 0) {
      const remainingTasks = this.taskQueue.length + this.activeTasks.size;
      const averageAgents = Math.max(1, this.communication.getAgentsByStatus('online').length);
      const estimatedRemainingTime = (remainingTasks / averageAgents) * this.stats.averageTaskDuration;
      this.stats.estimatedCompletion = new Date(Date.now() + estimatedRemainingTime);
    }
    
    this.stats.lastUpdated = new Date();
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}