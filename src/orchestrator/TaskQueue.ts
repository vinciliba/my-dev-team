/**
 * Task Queue System
 * Intelligent task queuing, prioritization, and distribution for AI agents
 */

import { 
  Task, 
  TaskStatus, 
  TaskPriority, 
  TaskType, 
  AgentType, 
  TaskExecutionPlan,
  TaskBatch,
  TaskExecutionContext 
} from '../types/Task';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface QueueConfig {
  maxQueueSize: number;
  prioritizationStrategy: PrioritizationStrategy;
  loadBalancingStrategy: LoadBalancingStrategy;
  retryPolicy: RetryPolicy;
  timeoutPolicy: TimeoutPolicy;
  concurrencyLimits: ConcurrencyLimits;
  deadlinePolicy: DeadlinePolicy;
}

export type PrioritizationStrategy = 
  | 'fifo'           // First In, First Out
  | 'lifo'           // Last In, First Out
  | 'priority'       // Based on task priority
  | 'deadline'       // Based on deadlines
  | 'weighted'       // Weighted scoring
  | 'smart'          // AI-driven prioritization
  | 'dependency'     // Dependency-aware ordering
  | 'resource'       // Resource availability-based
  | 'critical_path'; // Critical path optimization

export type LoadBalancingStrategy =
  | 'round_robin'    // Distribute evenly across agents
  | 'least_loaded'   // Assign to least busy agent
  | 'capability'     // Match to best capable agent
  | 'performance'    // Assign to best performing agent
  | 'hybrid'         // Combination of strategies
  | 'affinity'       // Agent-task affinity based
  | 'random'         // Random distribution
  | 'locality';      // Based on data/resource locality

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed' | 'custom';
  baseDelay: number; // milliseconds
  maxDelay: number;
  jitter: boolean;
  retryableErrors: string[];
  escalationThreshold: number;
}

export interface TimeoutPolicy {
  defaultTimeout: number; // milliseconds
  taskTypeTimeouts: Record<TaskType, number>;
  agentTypeTimeouts: Record<AgentType, number>;
  escalationTimeout: number;
  gracePeriod: number;
}

export interface ConcurrencyLimits {
  maxConcurrentTasks: number;
  maxTasksPerAgent: number;
  maxTasksPerType: Record<TaskType, number>;
  maxTasksPerPriority: Record<TaskPriority, number>;
  resourceLimits: ResourceLimits;
}

export interface ResourceLimits {
  maxMemoryUsage: number; // MB
  maxCpuUsage: number; // percentage
  maxDiskUsage: number; // MB
  maxNetworkBandwidth: number; // MB/s
}

export interface DeadlinePolicy {
  enableDeadlineTracking: boolean;
  deadlineWarningThreshold: number; // percentage of time remaining
  deadlineEscalationThreshold: number;
  missedDeadlineActions: DeadlineAction[];
}

export type DeadlineAction = 
  | 'log_warning'
  | 'escalate_priority'
  | 'reassign_agent'
  | 'increase_resources'
  | 'notify_stakeholders'
  | 'cancel_task';

export interface QueuedTask {
  task: Task;
  queuedAt: Date;
  priority: number; // Calculated priority score
  estimatedDuration: number;
  resourceRequirements: ResourceRequirements;
  eligibleAgents: AgentType[];
  retryCount: number;
  lastFailure?: TaskFailure;
  assignmentHistory: TaskAssignmentRecord[];
  metadata: Record<string, any>;
}

export interface ResourceRequirements {
  cpu: number; // cores
  memory: number; // MB
  disk: number; // MB
  network: boolean;
  gpu?: number;
  customResources?: Record<string, number>;
}

export interface TaskFailure {
  reason: string;
  agent: string;
  timestamp: Date;
  recoverable: boolean;
  details?: any;
}

export interface TaskAssignmentRecord {
  agent: string;
  assignedAt: Date;
  completedAt?: Date;
  status: TaskStatus;
  duration?: number;
  outcome: 'completed' | 'failed' | 'cancelled' | 'timeout';
}

export interface QueueMetrics {
  queueSize: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  throughput: number; // tasks per hour
  completionRate: number; // percentage
  errorRate: number; // percentage
  resourceUtilization: ResourceUtilization;
  agentUtilization: Record<string, number>;
  priorityDistribution: Record<TaskPriority, number>;
  typeDistribution: Record<TaskType, number>;
  lastUpdated: Date;
}

export interface ResourceUtilization {
  cpu: number; // percentage
  memory: number; // percentage
  disk: number; // percentage
  network: number; // percentage
  gpu?: number; // percentage
}

export interface QueueSnapshot {
  timestamp: Date;
  totalTasks: number;
  pendingTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  queuedTasks: QueuedTask[];
  metrics: QueueMetrics;
  healthScore: number; // 0-100
}

export interface TaskFilter {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  type?: TaskType[];
  agent?: string[];
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  deadline?: {
    before?: Date;
    after?: Date;
  };
  estimatedDuration?: {
    min?: number;
    max?: number;
  };
}

export interface AgentCapacity {
  agentId: string;
  maxConcurrentTasks: number;
  currentTasks: number;
  availableCapacity: number;
  resourceCapacity: ResourceRequirements;
  currentResourceUsage: ResourceRequirements;
  performanceScore: number; // 0-100
  specializations: string[];
  lastTaskCompleted?: Date;
  averageTaskDuration: number;
  successRate: number;
}

/**
 * Intelligent task queue for managing and distributing tasks to AI agents
 */
export class TaskQueue extends EventEmitter {
  private logger: Logger;
  private config: QueueConfig;
  
  // Queue storage
  private pendingQueue: QueuedTask[] = [];
  private activeQueue: Map<string, QueuedTask> = new Map();
  private completedQueue: QueuedTask[] = [];
  private failedQueue: QueuedTask[] = [];
  
  // Agent management
  private agentCapacities = new Map<string, AgentCapacity>();
  private agentWorkload = new Map<string, number>();
  
  // Metrics and monitoring
  private metrics: QueueMetrics;
  private metricsHistory: QueueMetrics[] = [];
  private maxHistorySize: number = 1000;
  
  // Processing state
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private processingFrequency: number = 1000; // 1 second
  
  // Batch processing
  private activeBatches = new Map<string, TaskBatch>();
  
  // Deadline monitoring
  private deadlineCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.logger = new Logger('TaskQueue');
    this.metrics = this.initializeMetrics();
    
    this.logger.info('Task Queue initialized with strategy:', config.prioritizationStrategy);
  }

  /**
   * Start the task queue processing
   */
  start(): void {
    if (this.isProcessing) {
      this.logger.warn('Task queue is already processing');
      return;
    }

    this.isProcessing = true;
    this.startProcessingLoop();
    this.startDeadlineMonitoring();
    
    this.logger.info('Task queue processing started');
    this.emit('queue-started');
  }

  /**
   * Stop the task queue processing
   */
  stop(): void {
    if (!this.isProcessing) {
      this.logger.warn('Task queue is not processing');
      return;
    }

    this.isProcessing = false;
    this.stopProcessingLoop();
    this.stopDeadlineMonitoring();
    
    this.logger.info('Task queue processing stopped');
    this.emit('queue-stopped');
  }

  /**
   * Add a task to the queue
   */
  enqueue(task: Task, context?: TaskExecutionContext): string {
    if (this.pendingQueue.length >= this.config.maxQueueSize) {
      throw new Error('Queue is at maximum capacity');
    }

    const queuedTask: QueuedTask = {
      task,
      queuedAt: new Date(),
      priority: this.calculateTaskPriority(task),
      estimatedDuration: this.estimateTaskDuration(task),
      resourceRequirements: this.calculateResourceRequirements(task),
      eligibleAgents: this.findEligibleAgents(task),
      retryCount: 0,
      assignmentHistory: [],
      metadata: { context }
    };

    this.pendingQueue.push(queuedTask);
    this.sortQueue();
    this.updateMetrics();

    this.logger.info(`Task enqueued: ${task.title} (priority: ${queuedTask.priority})`);
    this.emit('task-enqueued', queuedTask);

    return task.id;
  }

  /**
   * Add multiple tasks as a batch
   */
  enqueueBatch(batch: TaskBatch, tasks: Task[]): string {
    this.activeBatches.set(batch.id, batch);

    for (const task of tasks) {
      task.metadata = { ...task.metadata, batchId: batch.id };
      this.enqueue(task);
    }

    this.logger.info(`Batch enqueued: ${batch.name} with ${tasks.length} tasks`);
    this.emit('batch-enqueued', batch, tasks);

    return batch.id;
  }

  /**
   * Remove a task from the queue
   */
  dequeue(taskId: string): QueuedTask | null {
    // Check pending queue
    const pendingIndex = this.pendingQueue.findIndex(qt => qt.task.id === taskId);
    if (pendingIndex > -1) {
      const queuedTask = this.pendingQueue.splice(pendingIndex, 1)[0];
      this.updateMetrics();
      this.emit('task-dequeued', queuedTask);
      return queuedTask;
    }

    // Check active queue
    const activeTask = this.activeQueue.get(taskId);
    if (activeTask) {
      this.activeQueue.delete(taskId);
      this.updateMetrics();
      this.emit('task-dequeued', activeTask);
      return activeTask;
    }

    return null;
  }

  /**
   * Get the next task for a specific agent
   */
  getNextTask(agentId: string, agentType: AgentType): QueuedTask | null {
    if (!this.canAgentTakeTask(agentId)) {
      return null;
    }

    const eligibleTasks = this.pendingQueue.filter(queuedTask => 
      this.isTaskEligibleForAgent(queuedTask, agentId, agentType) &&
      this.areResourcesAvailable(queuedTask.resourceRequirements) &&
      this.areDependenciesMet(queuedTask.task)
    );

    if (eligibleTasks.length === 0) {
      return null;
    }

    // Apply load balancing strategy
    const selectedTask = this.selectTaskForAgent(eligibleTasks, agentId, agentType);
    if (!selectedTask) return null;

    // Remove from pending and add to active
    const index = this.pendingQueue.indexOf(selectedTask);
    this.pendingQueue.splice(index, 1);
    this.activeQueue.set(selectedTask.task.id, selectedTask);

    // Update agent workload
    this.incrementAgentWorkload(agentId);
    this.updateMetrics();

    this.logger.info(`Task assigned: ${selectedTask.task.title} -> ${agentId}`);
    this.emit('task-assigned', selectedTask, agentId);

    return selectedTask;
  }

  /**
   * Mark a task as completed
   */
  completeTask(taskId: string, agentId: string, result?: any): void {
    const queuedTask = this.activeQueue.get(taskId);
    if (!queuedTask) {
      this.logger.warn(`Attempted to complete unknown task: ${taskId}`);
      return;
    }

    queuedTask.task.status = 'completed';
    queuedTask.task.completedAt = new Date();
    queuedTask.task.result = result;

    // Update assignment history
    const lastAssignment = queuedTask.assignmentHistory[queuedTask.assignmentHistory.length - 1];
    if (lastAssignment) {
      lastAssignment.completedAt = new Date();
      lastAssignment.status = 'completed';
      lastAssignment.outcome = 'completed';
      lastAssignment.duration = Date.now() - lastAssignment.assignedAt.getTime();
    }

    // Move to completed queue
    this.activeQueue.delete(taskId);
    this.completedQueue.push(queuedTask);
    this.trimCompletedQueue();

    // Update agent workload
    this.decrementAgentWorkload(agentId);
    this.updateAgentPerformance(agentId, true, lastAssignment?.duration || 0);
    this.updateMetrics();

    this.logger.info(`Task completed: ${queuedTask.task.title} by ${agentId}`);
    this.emit('task-completed', queuedTask, agentId, result);

    // Check batch completion
    this.checkBatchCompletion(queuedTask);
  }

  /**
   * Mark a task as failed
   */
  failTask(taskId: string, agentId: string, error: string, recoverable: boolean = true): void {
    const queuedTask = this.activeQueue.get(taskId);
    if (!queuedTask) {
      this.logger.warn(`Attempted to fail unknown task: ${taskId}`);
      return;
    }

    queuedTask.lastFailure = {
      reason: error,
      agent: agentId,
      timestamp: new Date(),
      recoverable
    };

    // Update assignment history
    const lastAssignment = queuedTask.assignmentHistory[queuedTask.assignmentHistory.length - 1];
    if (lastAssignment) {
      lastAssignment.completedAt = new Date();
      lastAssignment.status = 'failed';
      lastAssignment.outcome = 'failed';
      lastAssignment.duration = Date.now() - lastAssignment.assignedAt.getTime();
    }

    this.activeQueue.delete(taskId);
    this.decrementAgentWorkload(agentId);
    this.updateAgentPerformance(agentId, false, lastAssignment?.duration || 0);

    if (recoverable && queuedTask.retryCount < this.config.retryPolicy.maxRetries) {
      // Retry the task
      this.retryTask(queuedTask);
    } else {
      // Mark as permanently failed
      queuedTask.task.status = 'failed';
      queuedTask.task.error = error;
      this.failedQueue.push(queuedTask);
      this.trimFailedQueue();

      this.logger.error(`Task failed permanently: ${queuedTask.task.title} - ${error}`);
      this.emit('task-failed', queuedTask, agentId, error);

      // Check batch failure
      this.checkBatchFailure(queuedTask);
    }

    this.updateMetrics();
  }

  /**
   * Register an agent with the queue
   */
  registerAgent(agentId: string, agentType: AgentType, capacity: Partial<AgentCapacity>): void {
    const agentCapacity: AgentCapacity = {
      agentId,
      maxConcurrentTasks: capacity.maxConcurrentTasks || this.config.concurrencyLimits.maxTasksPerAgent,
      currentTasks: 0,
      availableCapacity: capacity.maxConcurrentTasks || this.config.concurrencyLimits.maxTasksPerAgent,
      resourceCapacity: capacity.resourceCapacity || {
        cpu: 4,
        memory: 8192,
        disk: 10240,
        network: true
      },
      currentResourceUsage: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: false
      },
      performanceScore: capacity.performanceScore || 100,
      specializations: capacity.specializations || [],
      averageTaskDuration: capacity.averageTaskDuration || 3600000, // 1 hour default
      successRate: capacity.successRate || 1.0
    };

    this.agentCapacities.set(agentId, agentCapacity);
    this.agentWorkload.set(agentId, 0);

    this.logger.info(`Agent registered: ${agentId} (${agentType})`);
    this.emit('agent-registered', agentId, agentCapacity);
  }

  /**
   * Unregister an agent from the queue
   */
  unregisterAgent(agentId: string): void {
    // Reassign active tasks
    const activeTasks = Array.from(this.activeQueue.values())
      .filter(qt => qt.assignmentHistory.some(ah => ah.agent === agentId && !ah.completedAt));

    for (const queuedTask of activeTasks) {
      this.reassignTask(queuedTask, 'Agent unregistered');
    }

    this.agentCapacities.delete(agentId);
    this.agentWorkload.delete(agentId);

    this.logger.info(`Agent unregistered: ${agentId}`);
    this.emit('agent-unregistered', agentId);
  }

  /**
   * Get queue status and metrics
   */
  getStatus(): QueueSnapshot {
    return {
      timestamp: new Date(),
      totalTasks: this.pendingQueue.length + this.activeQueue.size + this.completedQueue.length + this.failedQueue.length,
      pendingTasks: this.pendingQueue.length,
      activeTasks: this.activeQueue.size,
      completedTasks: this.completedQueue.length,
      failedTasks: this.failedQueue.length,
      queuedTasks: [...this.pendingQueue],
      metrics: { ...this.metrics },
      healthScore: this.calculateHealthScore()
    };
  }

  /**
   * Get tasks by filter criteria
   */
  getTasks(filter?: TaskFilter): QueuedTask[] {
    const allTasks = [
      ...this.pendingQueue,
      ...Array.from(this.activeQueue.values()),
      ...this.completedQueue,
      ...this.failedQueue
    ];

    if (!filter) return allTasks;

    return allTasks.filter(queuedTask => this.matchesFilter(queuedTask, filter));
  }

  /**
   * Get agent capacity information
   */
  getAgentCapacities(): AgentCapacity[] {
    return Array.from(this.agentCapacities.values());
  }

  /**
   * Update queue configuration
   */
  updateConfig(newConfig: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Queue configuration updated');
    this.emit('config-updated', this.config);
  }

  /**
   * Clear completed and failed tasks
   */
  cleanup(): void {
    const completedCount = this.completedQueue.length;
    const failedCount = this.failedQueue.length;

    this.completedQueue.length = 0;
    this.failedQueue.length = 0;

    this.logger.info(`Queue cleanup: removed ${completedCount} completed and ${failedCount} failed tasks`);
    this.emit('queue-cleaned', completedCount, failedCount);
  }

  // Private methods

  private startProcessingLoop(): void {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.processingFrequency);
  }

  private stopProcessingLoop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  private startDeadlineMonitoring(): void {
    if (this.config.deadlinePolicy.enableDeadlineTracking) {
      this.deadlineCheckInterval = setInterval(() => {
        this.checkDeadlines();
      }, 60000); // Check every minute
    }
  }

  private stopDeadlineMonitoring(): void {
    if (this.deadlineCheckInterval) {
      clearInterval(this.deadlineCheckInterval);
      this.deadlineCheckInterval = null;
    }
  }

  private processQueue(): void {
    // Check for timed out tasks
    this.checkTimeouts();
    
    // Update metrics periodically
    this.updateMetrics();
    
    // Emit health status
    const healthScore = this.calculateHealthScore();
    if (healthScore < 70) { // Poor health threshold
      this.emit('queue-health-warning', healthScore);
    }
  }

  private calculateTaskPriority(task: Task): number {
    switch (this.config.prioritizationStrategy) {
      case 'priority':
        return this.getPriorityScore(task.priority);
      
      case 'deadline':
        return this.getDeadlineScore(task);
      
      case 'weighted':
        return this.getWeightedScore(task);
      
      case 'smart':
        return this.getSmartScore(task);
      
      case 'dependency':
        return this.getDependencyScore(task);
      
      case 'resource':
        return this.getResourceScore(task);
      
      case 'critical_path':
        return this.getCriticalPathScore(task);
      
      case 'fifo':
        return Date.now() - task.createdAt.getTime();
      
      case 'lifo':
        return task.createdAt.getTime() - Date.now();
      
      default:
        return this.getPriorityScore(task.priority);
    }
  }

  private getPriorityScore(priority: TaskPriority): number {
    const scores = { urgent: 1000, high: 750, normal: 500, low: 250 };
    return scores[priority];
  }

  private getDeadlineScore(task: Task): number {
    if (!task.deadline) return 500; // Default priority
    
    const timeUntilDeadline = task.deadline.getTime() - Date.now();
    const urgencyScore = Math.max(0, 1000 - (timeUntilDeadline / 3600000)); // Hours until deadline
    
    return urgencyScore + this.getPriorityScore(task.priority);
  }

  private getWeightedScore(task: Task): number {
    let score = this.getPriorityScore(task.priority) * 0.4;
    score += this.getDeadlineScore(task) * 0.3;
    score += (task.estimatedHours || 4) * 10 * 0.2; // Shorter tasks get higher priority
    score += this.getDependencyScore(task) * 0.1;
    
    return score;
  }

  private getSmartScore(task: Task): number {
    // AI-driven scoring (simplified implementation)
    let score = this.getWeightedScore(task);
    
    // Boost for tasks that unblock others
    if (task.blocks && task.blocks.length > 0) {
      score += task.blocks.length * 50;
    }
    
    // Boost for critical path tasks
    if (task.tags?.includes('critical-path')) {
      score += 200;
    }
    
    return score;
  }

  private getDependencyScore(task: Task): number {
    // Higher score for tasks with no dependencies (can be started immediately)
    const dependencyPenalty = (task.dependencies?.length || 0) * 100;
    const blockingBonus = (task.blocks?.length || 0) * 150;
    
    return this.getPriorityScore(task.priority) + blockingBonus - dependencyPenalty;
  }

  private getResourceScore(task: Task): number {
    // Priority based on current resource availability
    const resourceRequirements = this.calculateResourceRequirements(task);
    const availableResources = this.calculateAvailableResources();
    
    const resourceRatio = Math.min(
      availableResources.cpu / resourceRequirements.cpu,
      availableResources.memory / resourceRequirements.memory,
      availableResources.disk / resourceRequirements.disk
    );
    
    return this.getPriorityScore(task.priority) + (resourceRatio * 200);
  }

  private getCriticalPathScore(task: Task): number {
    // Calculate critical path priority (simplified)
    const baseScore = this.getPriorityScore(task.priority);
    const pathLength = this.calculatePathLength(task);
    
    return baseScore + (pathLength * 50);
  }

  private calculatePathLength(task: Task): number {
    // Simplified critical path calculation
    if (!task.blocks || task.blocks.length === 0) return 1;
    
    let maxPath = 0;
    for (const blockedTaskId of task.blocks) {
      const blockedTask = this.findTaskById(blockedTaskId);
      if (blockedTask) {
        maxPath = Math.max(maxPath, this.calculatePathLength(blockedTask));
      }
    }
    
    return 1 + maxPath;
  }

  private estimateTaskDuration(task: Task): number {
    if (task.estimatedHours) {
      return task.estimatedHours * 3600000; // Convert to milliseconds
    }
    
    // Default estimates by task type
    const typeEstimates: Record<TaskType, number> = {
      analysis: 2,
      design: 4,
      implementation: 8,
      testing: 3,
      review: 1,
      documentation: 2,
      deployment: 1,
      maintenance: 2,
      'bug-fix': 3,
      feature: 6,
      refactoring: 4,
      'security-fix': 4,
      'performance-optimization': 6,
      'code-improvement': 3,
      research: 4
    };
    
    return (typeEstimates[task.type] || 4) * 3600000;
  }

  private calculateResourceRequirements(task: Task): ResourceRequirements {
    // Default requirements by task type
    const typeRequirements: Record<TaskType, ResourceRequirements> = {
      analysis: { cpu: 1, memory: 1024, disk: 512, network: true },
      design: { cpu: 1, memory: 2048, disk: 1024, network: true },
      implementation: { cpu: 2, memory: 4096, disk: 2048, network: true },
      testing: { cpu: 2, memory: 3072, disk: 1024, network: true },
      review: { cpu: 1, memory: 1024, disk: 512, network: true },
      documentation: { cpu: 1, memory: 1024, disk: 1024, network: true },
      deployment: { cpu: 1, memory: 2048, disk: 1024, network: true },
      maintenance: { cpu: 1, memory: 1024, disk: 512, network: true },
      'bug-fix': { cpu: 2, memory: 2048, disk: 1024, network: true },
      feature: { cpu: 2, memory: 4096, disk: 2048, network: true },
      refactoring: { cpu: 2, memory: 3072, disk: 1024, network: true },
      'security-fix': { cpu: 1, memory: 2048, disk: 1024, network: true },
      'performance-optimization': { cpu: 3, memory: 6144, disk: 2048, network: true },
      'code-improvement': { cpu: 2, memory: 2048, disk: 1024, network: true },
      research: { cpu: 1, memory: 2048, disk: 1024, network: true }
    };
    
    return typeRequirements[task.type] || { cpu: 2, memory: 2048, disk: 1024, network: true };
  }

  private findEligibleAgents(task: Task): AgentType[] {
    // Map task types to eligible agent types
    const taskAgentMap: Record<TaskType, AgentType[]> = {
      analysis: ['architect', 'analyst'],
      design: ['architect', 'designer'],
      implementation: ['developer'],
      testing: ['tester', 'developer'],
      review: ['reviewer', 'architect'],
      documentation: ['documentation', 'developer'],
      deployment: ['deployment', 'developer'],
      maintenance: ['developer', 'deployment'],
      'bug-fix': ['developer', 'tester'],
      feature: ['developer', 'architect'],
      refactoring: ['developer', 'architect'],
      'security-fix': ['security', 'developer'],
      'performance-optimization': ['performance', 'developer'],
      'code-improvement': ['developer', 'reviewer'],
      research: ['analyst', 'architect']
    };
    
    return taskAgentMap[task.type] || ['developer'];
  }

  private sortQueue(): void {
    this.pendingQueue.sort((a, b) => {
      if (this.config.prioritizationStrategy === 'fifo') {
        return a.queuedAt.getTime() - b.queuedAt.getTime();
      } else if (this.config.prioritizationStrategy === 'lifo') {
        return b.queuedAt.getTime() - a.queuedAt.getTime();
      } else {
        return b.priority - a.priority; // Higher priority first
      }
    });
  }

  private canAgentTakeTask(agentId: string): boolean {
    const capacity = this.agentCapacities.get(agentId);
    const workload = this.agentWorkload.get(agentId) || 0;
    
    return capacity ? workload < capacity.maxConcurrentTasks : false;
  }

  private isTaskEligibleForAgent(queuedTask: QueuedTask, agentId: string, agentType: AgentType): boolean {
    return queuedTask.eligibleAgents.includes(agentType) &&
           !this.isAgentInAssignmentHistory(queuedTask, agentId) &&
           this.meetsSkillRequirements(queuedTask.task, agentId);
  }

  private isAgentInAssignmentHistory(queuedTask: QueuedTask, agentId: string): boolean {
    return queuedTask.assignmentHistory.some(ah => ah.agent === agentId);
  }

  private meetsSkillRequirements(task: Task, agentId: string): boolean {
    if (!task.requiredSkills || task.requiredSkills.length === 0) return true;
    
    const agentCapacity = this.agentCapacities.get(agentId);
    if (!agentCapacity) return false;
    
    return task.requiredSkills.some(skill => 
      agentCapacity.specializations.includes(skill)
    );
  }

  private areResourcesAvailable(requirements: ResourceRequirements): boolean {
    const available = this.calculateAvailableResources();
    
    return available.cpu >= requirements.cpu &&
           available.memory >= requirements.memory &&
           available.disk >= requirements.disk &&
           (!requirements.network || available.network);
  }

  private calculateAvailableResources(): ResourceRequirements & { network: boolean } {
    let totalAvailable = {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: false
    };

    for (const capacity of this.agentCapacities.values()) {
      const available = {
        cpu: capacity.resourceCapacity.cpu - capacity.currentResourceUsage.cpu,
        memory: capacity.resourceCapacity.memory - capacity.currentResourceUsage.memory,
        disk: capacity.resourceCapacity.disk - capacity.currentResourceUsage.disk,
        network: capacity.resourceCapacity.network && !capacity.currentResourceUsage.network
      };

      totalAvailable.cpu += Math.max(0, available.cpu);
      totalAvailable.memory += Math.max(0, available.memory);
      totalAvailable.disk += Math.max(0, available.disk);
      totalAvailable.network = totalAvailable.network || available.network;
    }

    return totalAvailable;
  }

  private areDependenciesMet(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) return true;
    
    return task.dependencies.every(depId => 
      this.completedQueue.some(qt => qt.task.id === depId)
    );
  }

  private selectTaskForAgent(eligibleTasks: QueuedTask[], agentId: string, agentType: AgentType): QueuedTask | null {
    if (eligibleTasks.length === 0) return null;

    switch (this.config.loadBalancingStrategy) {
      case 'capability':
        return this.selectBestCapabilityMatch(eligibleTasks, agentId);
      
      case 'performance':
        return this.selectForBestPerformance(eligibleTasks, agentId);
      
      case 'affinity':
        return this.selectByAffinity(eligibleTasks, agentId);
      
      case 'random':
        return eligibleTasks[Math.floor(Math.random() * eligibleTasks.length)];
      
      case 'round_robin':
      case 'least_loaded':
      case 'hybrid':
      case 'locality':
      default:
        return eligibleTasks[0]; // Highest priority task
    }
  }

  private selectBestCapabilityMatch(tasks: QueuedTask[], agentId: string): QueuedTask | null {
    const agentCapacity = this.agentCapacities.get(agentId);
    if (!agentCapacity) return tasks[0];

    let bestScore = -1;
    let bestTask = null;

    for (const task of tasks) {
      const score = this.calculateCapabilityScore(task.task, agentCapacity);
      if (score > bestScore) {
        bestScore = score;
        bestTask = task;
      }
    }

    return bestTask || tasks[0];
  }

  private calculateCapabilityScore(task: Task, agentCapacity: AgentCapacity): number {
    let score = 0;

    // Skill match bonus
    if (task.requiredSkills) {
      const matchingSkills = task.requiredSkills.filter(skill => 
        agentCapacity.specializations.includes(skill)
      );
      score += matchingSkills.length * 10;
    }

    // Performance bonus
    score += agentCapacity.performanceScore * 0.1;
    score += agentCapacity.successRate * 10;

    // Workload penalty
    score -= agentCapacity.currentTasks * 5;

    return score;
  }

  private selectForBestPerformance(tasks: QueuedTask[], agentId: string): QueuedTask | null {
    const agentCapacity = this.agentCapacities.get(agentId);
    if (!agentCapacity) return tasks[0];

    // Select task that agent can complete fastest relative to estimated time
    let bestRatio = Infinity;
    let bestTask = null;

    for (const task of tasks) {
      const estimatedAgentTime = task.estimatedDuration * (1 / (agentCapacity.performanceScore / 100));
      const ratio = estimatedAgentTime / task.estimatedDuration;
      
      if (ratio < bestRatio) {
        bestRatio = ratio;
        bestTask = task;
      }
    }

    return bestTask || tasks[0];
  }

  private selectByAffinity(tasks: QueuedTask[], agentId: string): QueuedTask | null {
    // Select task similar to recently completed tasks by this agent
    const recentTasks = this.completedQueue
      .filter(qt => qt.assignmentHistory.some(ah => ah.agent === agentId))
      .slice(-5); // Last 5 tasks

    if (recentTasks.length === 0) return tasks[0];

    const recentTypes = recentTasks.map(qt => qt.task.type);
    const recentTags = recentTasks.flatMap(qt => qt.task.tags || []);

    let bestScore = -1;
    let bestTask = null;

    for (const task of tasks) {
      let score = 0;
      
      // Type affinity
      if (recentTypes.includes(task.task.type)) {
        score += 20;
      }
      
      // Tag affinity
      const commonTags = (task.task.tags || []).filter(tag => recentTags.includes(tag));
      score += commonTags.length * 5;

      if (score > bestScore) {
        bestScore = score;
        bestTask = task;
      }
    }

    return bestTask || tasks[0];
  }

  private incrementAgentWorkload(agentId: string): void {
    const current = this.agentWorkload.get(agentId) || 0;
    this.agentWorkload.set(agentId, current + 1);

    const capacity = this.agentCapacities.get(agentId);
    if (capacity) {
      capacity.currentTasks = current + 1;
      capacity.availableCapacity = capacity.maxConcurrentTasks - capacity.currentTasks;
    }
  }

  private decrementAgentWorkload(agentId: string): void {
    const current = this.agentWorkload.get(agentId) || 0;
    this.agentWorkload.set(agentId, Math.max(0, current - 1));

    const capacity = this.agentCapacities.get(agentId);
    if (capacity) {
      capacity.currentTasks = Math.max(0, current - 1);
      capacity.availableCapacity = capacity.maxConcurrentTasks - capacity.currentTasks;
    }
  }

  private retryTask(queuedTask: QueuedTask): void {
    queuedTask.retryCount++;
    queuedTask.task.status = 'pending';

    // Apply backoff delay
    const delay = this.calculateRetryDelay(queuedTask.retryCount);
    
    setTimeout(() => {
      queuedTask.queuedAt = new Date();
      this.pendingQueue.push(queuedTask);
      this.sortQueue();
      
      this.logger.info(`Task retry ${queuedTask.retryCount}: ${queuedTask.task.title}`);
      this.emit('task-retried', queuedTask);
    }, delay);
  }

  private calculateRetryDelay(retryCount: number): number {
    const { backoffStrategy, baseDelay, maxDelay, jitter } = this.config.retryPolicy;
    
    let delay = baseDelay;
    
    switch (backoffStrategy) {
      case 'linear':
        delay = baseDelay * retryCount;
        break;
      case 'exponential':
        delay = baseDelay * Math.pow(2, retryCount - 1);
        break;
      case 'fixed':
        delay = baseDelay;
        break;
      case 'custom':
        delay = baseDelay * (1 + retryCount * 0.5);
        break;
    }
    
    delay = Math.min(delay, maxDelay);
    
    if (jitter) {
      delay += Math.random() * (delay * 0.1); // Add up to 10% jitter
    }
    
    return delay;
  }

  private reassignTask(queuedTask: QueuedTask, reason: string): void {
    this.logger.info(`Reassigning task ${queuedTask.task.id}: ${reason}`);
    
    // Remove from active queue
    this.activeQueue.delete(queuedTask.task.id);
    
    // Reset task status
    queuedTask.task.status = 'pending';
    queuedTask.queuedAt = new Date();
    
    // Add back to pending queue
    this.pendingQueue.push(queuedTask);
    this.sortQueue();
    
    this.emit('task-reassigned', queuedTask, reason);
  }

  private checkTimeouts(): void {
    const now = Date.now();
    
    for (const [taskId, queuedTask] of this.activeQueue) {
      const lastAssignment = queuedTask.assignmentHistory[queuedTask.assignmentHistory.length - 1];
      if (!lastAssignment) continue;
      
      const elapsed = now - lastAssignment.assignedAt.getTime();
      const timeout = this.getTaskTimeout(queuedTask.task);
      
      if (elapsed > timeout) {
        this.logger.warn(`Task timeout: ${queuedTask.task.title} (${elapsed}ms > ${timeout}ms)`);
        this.failTask(taskId, lastAssignment.agent, 'Task timeout', true);
      }
    }
  }

  private getTaskTimeout(task: Task): number {
    // Check task-type specific timeout
    if (this.config.timeoutPolicy.taskTypeTimeouts[task.type]) {
      return this.config.timeoutPolicy.taskTypeTimeouts[task.type];
    }
    
    return this.config.timeoutPolicy.defaultTimeout;
  }

  private checkDeadlines(): void {
    if (!this.config.deadlinePolicy.enableDeadlineTracking) return;
    
    const now = new Date();
    const warningThreshold = this.config.deadlinePolicy.deadlineWarningThreshold / 100;
    
    for (const queuedTask of this.pendingQueue.concat(Array.from(this.activeQueue.values()))) {
      if (!queuedTask.task.deadline) continue;
      
      const timeToDeadline = queuedTask.task.deadline.getTime() - now.getTime();
      const totalTime = queuedTask.task.deadline.getTime() - queuedTask.task.createdAt.getTime();
      const remainingRatio = timeToDeadline / totalTime;
      
      if (remainingRatio <= 0) {
        // Deadline missed
        this.handleMissedDeadline(queuedTask);
      } else if (remainingRatio <= warningThreshold) {
        // Approaching deadline
        this.emit('deadline-warning', queuedTask, timeToDeadline);
      }
    }
  }

  private handleMissedDeadline(queuedTask: QueuedTask): void {
    this.logger.warn(`Deadline missed: ${queuedTask.task.title}`);
    this.emit('deadline-missed', queuedTask);
    
    for (const action of this.config.deadlinePolicy.missedDeadlineActions) {
      this.executeDeadlineAction(action, queuedTask);
    }
  }

  private executeDeadlineAction(action: DeadlineAction, queuedTask: QueuedTask): void {
    switch (action) {
      case 'log_warning':
        this.logger.warn(`Deadline action: ${action} for task ${queuedTask.task.title}`);
        break;
      
      case 'escalate_priority':
        if (queuedTask.task.priority !== 'urgent') {
          queuedTask.task.priority = 'urgent';
          queuedTask.priority = this.calculateTaskPriority(queuedTask.task);
          this.sortQueue();
        }
        break;
      
      case 'reassign_agent':
        if (this.activeQueue.has(queuedTask.task.id)) {
          this.reassignTask(queuedTask, 'Deadline missed - reassigning');
        }
        break;
      
      case 'cancel_task':
        this.dequeue(queuedTask.task.id);
        queuedTask.task.status = 'cancelled';
        break;
      
      default:
        this.logger.info(`Deadline action not implemented: ${action}`);
    }
  }

  private updateAgentPerformance(agentId: string, success: boolean, duration: number): void {
    const capacity = this.agentCapacities.get(agentId);
    if (!capacity) return;

    // Update success rate (moving average)
    const alpha = 0.1; // Learning rate
    capacity.successRate = capacity.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    
    // Update average duration
    if (duration > 0) {
      capacity.averageTaskDuration = capacity.averageTaskDuration * (1 - alpha) + duration * alpha;
    }
    
    // Update performance score based on success rate and speed
    const speedScore = Math.max(0, 100 - (capacity.averageTaskDuration / 3600000) * 10); // Penalty for slow tasks
    capacity.performanceScore = (capacity.successRate * 80) + (speedScore * 0.2);
    
    capacity.lastTaskCompleted = new Date();
  }

  private checkBatchCompletion(completedTask: QueuedTask): void {
    const batchId = completedTask.task.metadata?.batchId;
    if (!batchId) return;

    const batch = this.activeBatches.get(batchId);
    if (!batch) return;

    const batchTasks = this.getTasks().filter(qt => qt.task.metadata?.batchId === batchId);
    const completedBatchTasks = batchTasks.filter(qt => qt.task.status === 'completed');
    
    if (completedBatchTasks.length === batch.tasks.length) {
      batch.status = 'completed';
      batch.completedAt = new Date();
      batch.actualDuration = Date.now() - (batch.startedAt?.getTime() || batch.createdAt.getTime());
      batch.progress = 100;
      
      this.logger.info(`Batch completed: ${batch.name}`);
      this.emit('batch-completed', batch);
      this.activeBatches.delete(batchId);
    } else {
      // Update batch progress
      batch.progress = (completedBatchTasks.length / batch.tasks.length) * 100;
    }
  }

  private checkBatchFailure(failedTask: QueuedTask): void {
    const batchId = failedTask.task.metadata?.batchId;
    if (!batchId) return;

    const batch = this.activeBatches.get(batchId);
    if (!batch) return;

    if (batch.failureStrategy === 'stop_on_first') {
      // Cancel all remaining tasks in batch
      const batchTasks = this.getTasks().filter(qt => 
        qt.task.metadata?.batchId === batchId && 
        qt.task.status === 'pending'
      );
      
      for (const task of batchTasks) {
        this.dequeue(task.task.id);
        task.task.status = 'cancelled';
      }
      
      batch.status = 'failed';
      this.logger.info(`Batch failed: ${batch.name}`);
      this.emit('batch-failed', batch);
      this.activeBatches.delete(batchId);
    }
  }

  private findTaskById(taskId: string): Task | null {
    for (const queuedTask of this.getTasks()) {
      if (queuedTask.task.id === taskId) {
        return queuedTask.task;
      }
    }
    return null;
  }

  private matchesFilter(queuedTask: QueuedTask, filter: TaskFilter): boolean {
    const task = queuedTask.task;
    
    if (filter.status && !filter.status.includes(task.status)) return false;
    if (filter.priority && !filter.priority.includes(task.priority)) return false;
    if (filter.type && !filter.type.includes(task.type)) return false;
    if (filter.tags && !filter.tags.some(tag => task.tags?.includes(tag))) return false;
    if (filter.createdAfter && task.createdAt < filter.createdAfter) return false;
    if (filter.createdBefore && task.createdAt > filter.createdBefore) return false;
    
    if (filter.deadline) {
      if (!task.deadline) return false;
      if (filter.deadline.before && task.deadline > filter.deadline.before) return false;
      if (filter.deadline.after && task.deadline < filter.deadline.after) return false;
    }
    
    if (filter.estimatedDuration) {
      const duration = queuedTask.estimatedDuration / 3600000; // Convert to hours
      if (filter.estimatedDuration.min && duration < filter.estimatedDuration.min) return false;
      if (filter.estimatedDuration.max && duration > filter.estimatedDuration.max) return false;
    }
    
    return true;
  }

  private trimCompletedQueue(): void {
    const maxSize = 1000;
    if (this.completedQueue.length > maxSize) {
      this.completedQueue = this.completedQueue.slice(-maxSize);
    }
  }

  private trimFailedQueue(): void {
    const maxSize = 500;
    if (this.failedQueue.length > maxSize) {
      this.failedQueue = this.failedQueue.slice(-maxSize);
    }
  }

  private calculateHealthScore(): number {
    let score = 100;
    
    // Queue size penalty
    const queueRatio = this.pendingQueue.length / this.config.maxQueueSize;
    if (queueRatio > 0.8) score -= (queueRatio - 0.8) * 200;
    
    // Error rate penalty
    if (this.metrics.errorRate > 0.1) {
      score -= (this.metrics.errorRate - 0.1) * 500;
    }
    
    // Throughput bonus/penalty
    const expectedThroughput = 10; // tasks per hour
    const throughputRatio = this.metrics.throughput / expectedThroughput;
    if (throughputRatio < 1) {
      score -= (1 - throughputRatio) * 30;
    }
    
    // Agent utilization
    const avgUtilization = Object.values(this.metrics.agentUtilization).reduce((a, b) => a + b, 0) / 
                          Object.keys(this.metrics.agentUtilization).length || 0;
    if (avgUtilization < 50) {
      score -= (50 - avgUtilization) * 0.5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private initializeMetrics(): QueueMetrics {
    return {
      queueSize: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      throughput: 0,
      completionRate: 0,
      errorRate: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0
      },
      agentUtilization: {},
      priorityDistribution: {
        urgent: 0,
        high: 0,
        normal: 0,
        low: 0
      },
      typeDistribution: {} as Record<TaskType, number>,
      lastUpdated: new Date()
    };
  }

  private updateMetrics(): void {
    const now = new Date();
    const oneHour = 3600000;
    const recentTasks = this.completedQueue.filter(qt => 
      qt.task.completedAt && (now.getTime() - qt.task.completedAt.getTime()) < oneHour
    );

    this.metrics.queueSize = this.pendingQueue.length;
    this.metrics.throughput = recentTasks.length; // Tasks completed in last hour
    
    // Calculate average wait time
    if (this.completedQueue.length > 0) {
      const totalWaitTime = this.completedQueue.reduce((sum, qt) => {
        const assignment = qt.assignmentHistory[0];
        return sum + (assignment ? assignment.assignedAt.getTime() - qt.queuedAt.getTime() : 0);
      }, 0);
      this.metrics.averageWaitTime = totalWaitTime / this.completedQueue.length;
    }
    
    // Calculate average processing time
    if (this.completedQueue.length > 0) {
      const totalProcessingTime = this.completedQueue.reduce((sum, qt) => 
        sum + qt.estimatedDuration, 0
      );
      this.metrics.averageProcessingTime = totalProcessingTime / this.completedQueue.length;
    }
    
    // Calculate completion and error rates
    const totalFinished = this.completedQueue.length + this.failedQueue.length;
    if (totalFinished > 0) {
      this.metrics.completionRate = (this.completedQueue.length / totalFinished) * 100;
      this.metrics.errorRate = (this.failedQueue.length / totalFinished);
    }
    
    // Update agent utilization
    for (const [agentId, capacity] of this.agentCapacities) {
      const utilization = (capacity.currentTasks / capacity.maxConcurrentTasks) * 100;
      this.metrics.agentUtilization[agentId] = utilization;
    }
    
    // Update priority distribution
    const allActiveTasks = [...this.pendingQueue, ...Array.from(this.activeQueue.values())];
    this.metrics.priorityDistribution = {
      urgent: allActiveTasks.filter(qt => qt.task.priority === 'urgent').length,
      high: allActiveTasks.filter(qt => qt.task.priority === 'high').length,
      normal: allActiveTasks.filter(qt => qt.task.priority === 'normal').length,
      low: allActiveTasks.filter(qt => qt.task.priority === 'low').length
    };
    
    // Update type distribution
    this.metrics.typeDistribution = {} as Record<TaskType, number>;
    for (const qt of allActiveTasks) {
      this.metrics.typeDistribution[qt.task.type] = (this.metrics.typeDistribution[qt.task.type] || 0) + 1;
    }
    
    this.metrics.lastUpdated = now;
    
    // Store metrics history
    this.metricsHistory.push({ ...this.metrics });
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }
}