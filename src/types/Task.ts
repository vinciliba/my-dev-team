/**
 * Task Types and Interfaces
 * Comprehensive type definitions for task management, execution, and monitoring
 */

// Base task types
export type TaskStatus = 
  | 'pending' 
  | 'assigned' 
  | 'in-progress' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'blocked' 
  | 'review' 
  | 'testing';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskType = 
  | 'analysis'
  | 'design'
  | 'implementation'
  | 'testing'
  | 'review'
  | 'documentation'
  | 'deployment'
  | 'maintenance'
  | 'bug-fix'
  | 'feature'
  | 'refactoring'
  | 'security-fix'
  | 'performance-optimization'
  | 'code-improvement'
  | 'research';

export type AgentType = 
  | 'architect'
  | 'developer'
  | 'tester'
  | 'reviewer'
  | 'security'
  | 'performance'
  | 'documentation'
  | 'deployment'
  | 'monitor'
  | 'coordinator'
  | 'analyst'
  | 'designer';

/**
 * Core task interface
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  
  // Assignment and ownership
  assignedTo?: string;
  createdBy?: string;
  reviewedBy?: string;
  
  // Timing
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  deadline?: Date;
  
  // Requirements and constraints
  requiredSkills?: string[];
  estimatedHours?: number;
  actualHours?: number;
  complexity?: 'low' | 'medium' | 'high' | 'very-high';
  
  // Dependencies and relationships
  dependencies?: string[];
  blockedBy?: string[];
  blocks?: string[];
  parentTask?: string;
  subtasks?: string[];
  
  // Context and metadata
  component?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  
  // Results and outputs
  result?: TaskResult;
  error?: string;
  notes?: string[];
  
  // Collaboration
  watchers?: string[];
  comments?: TaskComment[];
  
  // Quality and validation
  acceptanceCriteria?: string[];
  definition_of_done?: string[];
  testCases?: string[];
}

/**
 * Task execution plan for complex multi-step tasks
 */
export interface TaskExecutionPlan {
  id: string;
  userRequest: string;
  breakdown: TaskStep[];
  estimatedTime: number;
  agents: AgentType[];
  dependencies: TaskDependency[];
  created: Date;
  status: TaskStatus;
  progress: number; // 0-100
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  metadata: Record<string, any>;
}

/**
 * Individual step within a task execution plan
 */
export interface TaskStep {
  id: string;
  agent: AgentType;
  action: string;
  description: string;
  inputs: TaskInput[];
  expectedOutputs: TaskOutput[];
  order: number;
  parallel?: boolean; // Can run in parallel with other steps
  status: TaskStatus;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration: number; // minutes
  actualDuration?: number;
  retryCount?: number;
  maxRetries?: number;
  requirements?: string[];
  validationRules?: TaskValidationRule[];
  metadata: Record<string, any>;
}

/**
 * Input for task steps
 */
export interface TaskInput {
  type: 'file' | 'directory' | 'context' | 'user_input' | 'analysis_result' | 'config' | 'dependency';
  source: string;
  required: boolean;
  description?: string;
  format?: string;
  validation?: TaskInputValidation;
  defaultValue?: any;
  examples?: any[];
}

/**
 * Output from task steps
 */
export interface TaskOutput {
  type: 'file' | 'directory' | 'report' | 'status' | 'analysis' | 'config' | 'artifact';
  target: string;
  description: string;
  format?: string;
  schema?: any;
  required: boolean;
  validation?: TaskOutputValidation;
  generatedAt?: Date;
  size?: number;
  checksum?: string;
}

/**
 * Task dependencies
 */
export interface TaskDependency {
  stepId: string;
  dependsOn: string[];
  type: 'sequential' | 'data' | 'resource' | 'approval' | 'external';
  description?: string;
  condition?: TaskDependencyCondition;
  timeout?: number; // milliseconds
  fallback?: TaskDependencyFallback;
}

/**
 * Task dependency conditions
 */
export interface TaskDependencyCondition {
  type: 'status' | 'output_exists' | 'validation_passed' | 'custom';
  criteria: any;
  operator?: 'equals' | 'not_equals' | 'contains' | 'exists' | 'custom';
}

/**
 * Fallback strategy for dependencies
 */
export interface TaskDependencyFallback {
  strategy: 'skip' | 'retry' | 'alternative_step' | 'manual_intervention';
  params?: Record<string, any>;
  maxAttempts?: number;
}

/**
 * Task validation rules
 */
export interface TaskValidationRule {
  id: string;
  type: 'input' | 'output' | 'process' | 'quality';
  description: string;
  rule: any; // Validation logic (could be JSON schema, regex, function, etc.)
  severity: 'error' | 'warning' | 'info';
  autoFix?: boolean;
  customMessage?: string;
}

/**
 * Input validation
 */
export interface TaskInputValidation {
  schema?: any;
  rules?: TaskValidationRule[];
  fileSize?: { min?: number; max?: number };
  fileType?: string[];
  encoding?: string;
  required_fields?: string[];
}

/**
 * Output validation
 */
export interface TaskOutputValidation {
  schema?: any;
  rules?: TaskValidationRule[];
  fileSize?: { min?: number; max?: number };
  fileType?: string[];
  quality_checks?: QualityCheck[];
  performance_thresholds?: PerformanceThreshold[];
}

/**
 * Quality checks for outputs
 */
export interface QualityCheck {
  type: 'syntax' | 'lint' | 'test' | 'security' | 'performance' | 'accessibility' | 'custom';
  tool?: string;
  config?: any;
  threshold?: number;
  blocking?: boolean;
  autoFix?: boolean;
}

/**
 * Performance thresholds
 */
export interface PerformanceThreshold {
  metric: 'build_time' | 'test_time' | 'bundle_size' | 'memory_usage' | 'cpu_usage' | 'response_time';
  threshold: number;
  unit: string;
  comparison: 'less_than' | 'greater_than' | 'equals' | 'within_range';
  blocking?: boolean;
}

/**
 * Task result interface
 */
export interface TaskResult {
  success: boolean;
  outputs: TaskResultOutput[];
  metrics: TaskMetrics;
  quality: TaskQuality;
  artifacts: TaskArtifact[];
  summary: string;
  recommendations?: string[];
  nextSteps?: string[];
  issues?: TaskIssue[];
  timestamp: Date;
}

/**
 * Task result output
 */
export interface TaskResultOutput {
  type: TaskOutput['type'];
  path: string;
  description: string;
  size: number;
  checksum: string;
  metadata: Record<string, any>;
}

/**
 * Task execution metrics
 */
export interface TaskMetrics {
  executionTime: number; // milliseconds
  resourceUsage: ResourceUsage;
  qualityScore: number; // 0-100
  complexity: number; // 0-100
  linesOfCode?: number;
  testCoverage?: number;
  performanceScore?: number;
  securityScore?: number;
}

/**
 * Resource usage during task execution
 */
export interface ResourceUsage {
  cpu: number; // percentage
  memory: number; // MB
  disk: number; // MB
  network?: number; // MB
  duration: number; // milliseconds
  peakMemory?: number;
  averageCpu?: number;
}

/**
 * Task quality assessment
 */
export interface TaskQuality {
  overall: number; // 0-100
  criteria: QualityCriteria;
  checks: QualityCheckResult[];
  issues: QualityIssue[];
  improvements: QualityImprovement[];
}

/**
 * Quality criteria scoring
 */
export interface QualityCriteria {
  functionality: number; // 0-100
  reliability: number; // 0-100
  usability: number; // 0-100
  efficiency: number; // 0-100
  maintainability: number; // 0-100
  portability: number; // 0-100
  security: number; // 0-100
}

/**
 * Quality check result
 */
export interface QualityCheckResult {
  check: QualityCheck;
  passed: boolean;
  score?: number;
  details?: string;
  issues?: string[];
  suggestions?: string[];
  executionTime: number;
}

/**
 * Quality issue
 */
export interface QualityIssue {
  type: 'error' | 'warning' | 'info' | 'suggestion';
  category: string;
  description: string;
  location?: FileLocation;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fixable: boolean;
  suggestedFix?: string;
  rule?: string;
}

/**
 * Quality improvement suggestion
 */
export interface QualityImprovement {
  category: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  priority: number; // 1-10
  estimatedTime?: number; // hours
  dependencies?: string[];
}

/**
 * File location for issues
 */
export interface FileLocation {
  file: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  function?: string;
  class?: string;
}

/**
 * Task artifact (generated files, reports, etc.)
 */
export interface TaskArtifact {
  id: string;
  type: 'code' | 'documentation' | 'test' | 'report' | 'config' | 'binary' | 'other';
  name: string;
  path: string;
  description: string;
  size: number;
  mimeType?: string;
  checksum: string;
  createdAt: Date;
  metadata: Record<string, any>;
  tags: string[];
  version?: string;
  dependencies?: string[];
}

/**
 * Task issue (problems encountered during execution)
 */
export interface TaskIssue {
  id: string;
  type: 'error' | 'warning' | 'blocker' | 'dependency' | 'resource' | 'timeout';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location?: FileLocation;
  stackTrace?: string;
  resolution?: TaskIssueResolution;
  reportedAt: Date;
  resolvedAt?: Date;
  reportedBy?: string;
  assignedTo?: string;
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Task issue resolution
 */
export interface TaskIssueResolution {
  strategy: 'fixed' | 'workaround' | 'ignored' | 'deferred' | 'duplicate' | 'wont_fix';
  description: string;
  changes?: string[];
  timeSpent?: number; // minutes
  resolvedBy?: string;
  verifiedBy?: string;
  relatedTasks?: string[];
}

/**
 * Task comment for collaboration
 */
export interface TaskComment {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
  type: 'comment' | 'question' | 'suggestion' | 'concern' | 'approval';
  attachments?: TaskAttachment[];
  mentions?: string[];
  reactions?: TaskReaction[];
  parentComment?: string;
  resolved?: boolean;
}

/**
 * Task attachment
 */
export interface TaskAttachment {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  description?: string;
}

/**
 * Task reaction (emoji responses)
 */
export interface TaskReaction {
  emoji: string;
  users: string[];
  count: number;
}

/**
 * Test results interface
 */
export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  coverage: number;
  files: TestFileResult[];
  timestamp: Date;
  duration: number; // milliseconds
  framework?: string;
  environment?: string;
  configuration?: any;
  summary: TestSummary;
  failures?: TestFailure[];
  warnings?: string[];
}

/**
 * Test results for individual files
 */
export interface TestFileResult {
  file: string;
  tests: number;
  passed: number;
  failed: number;
  skipped?: number;
  coverage: number;
  duration: number;
  suites: TestSuite[];
}

/**
 * Test suite results
 */
export interface TestSuite {
  name: string;
  tests: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration: number;
  testCases: TestCase[];
}

/**
 * Individual test case result
 */
export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: string;
  stackTrace?: string;
  assertions?: number;
  metadata?: Record<string, any>;
}

/**
 * Test summary
 */
export interface TestSummary {
  status: 'passed' | 'failed' | 'partial';
  coverageThreshold?: number;
  passRate: number; // percentage
  trends?: TestTrends;
  recommendations?: string[];
  healthScore: number; // 0-100
}

/**
 * Test trends over time
 */
export interface TestTrends {
  passRateTrend: 'improving' | 'declining' | 'stable';
  coverageTrend: 'improving' | 'declining' | 'stable';
  durationTrend: 'improving' | 'declining' | 'stable';
  flakyTests?: string[];
  slowTests?: string[];
}

/**
 * Test failure details
 */
export interface TestFailure {
  test: string;
  suite: string;
  file: string;
  error: string;
  stackTrace?: string;
  expected?: any;
  actual?: any;
  diff?: string;
  duration: number;
  retries?: number;
}

/**
 * Build status interface
 */
export interface BuildStatus {
  status: 'success' | 'failed' | 'building' | 'not_built' | 'cancelled' | 'skipped';
  output: string;
  errors: BuildError[];
  warnings: BuildWarning[];
  timestamp: Date;
  duration: number; // milliseconds
  buildId?: string;
  version?: string;
  environment?: string;
  configuration?: any;
  artifacts?: BuildArtifact[];
  metrics?: BuildMetrics;
  dependencies?: BuildDependency[];
}

/**
 * Build error details
 */
export interface BuildError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity: 'error' | 'fatal';
  category: string;
  suggestion?: string;
}

/**
 * Build warning details
 */
export interface BuildWarning {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  category: string;
  suggestion?: string;
  suppressible?: boolean;
}

/**
 * Build artifacts
 */
export interface BuildArtifact {
  name: string;
  path: string;
  type: 'executable' | 'library' | 'documentation' | 'package' | 'config' | 'other';
  size: number;
  checksum?: string;
  metadata?: Record<string, any>;
}

/**
 * Build metrics
 */
export interface BuildMetrics {
  compilationTime: number;
  linkingTime?: number;
  testTime?: number;
  packageTime?: number;
  totalTime: number;
  memoryUsage: number;
  cacheHitRate?: number;
  parallelization?: number;
  artifactSize: number;
}

/**
 * Build dependencies
 */
export interface BuildDependency {
  name: string;
  version: string;
  type: 'compile' | 'runtime' | 'test' | 'dev';
  source: string;
  resolved: boolean;
  size?: number;
  license?: string;
}

/**
 * Task template for reusable task patterns
 */
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  type: TaskType;
  priority: TaskPriority;
  estimatedHours: number;
  complexity: Task['complexity'];
  requiredSkills: string[];
  steps: TaskStepTemplate[];
  acceptanceCriteria: string[];
  definition_of_done: string[];
  tags: string[];
  metadata: Record<string, any>;
  version: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  successRate: number;
}

/**
 * Task step template
 */
export interface TaskStepTemplate {
  agent: AgentType;
  action: string;
  description: string;
  inputTemplates: TaskInputTemplate[];
  outputTemplates: TaskOutputTemplate[];
  estimatedDuration: number;
  validationRules: TaskValidationRule[];
  parallel?: boolean;
  optional?: boolean;
}

/**
 * Task input template
 */
export interface TaskInputTemplate {
  type: TaskInput['type'];
  name: string;
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: TaskInputValidation;
  examples?: any[];
}

/**
 * Task output template
 */
export interface TaskOutputTemplate {
  type: TaskOutput['type'];
  name: string;
  description: string;
  required: boolean;
  format?: string;
  validation?: TaskOutputValidation;
  examples?: any[];
}

/**
 * Task batch for processing multiple related tasks
 */
export interface TaskBatch {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration: number;
  actualDuration?: number;
  parallelExecution: boolean;
  failureStrategy: 'stop_on_first' | 'continue_on_failure' | 'retry_failed';
  maxRetries: number;
  progress: number; // 0-100
  metadata: Record<string, any>;
}

/**
 * Task execution context
 */
export interface TaskExecutionContext {
  workspaceRoot: string;
  projectStructure: any;
  currentBranch?: string;
  environment: 'development' | 'staging' | 'production' | 'test';
  resources: AvailableResources;
  constraints: ExecutionConstraints;
  permissions: TaskPermissions;
  variables: Record<string, any>;
  secrets: Record<string, string>;
  configuration: any;
}

/**
 * Available resources for task execution
 */
export interface AvailableResources {
  cpu: number; // cores
  memory: number; // MB
  disk: number; // MB
  network: boolean;
  gpu?: number; // count
  customResources?: Record<string, any>;
}

/**
 * Execution constraints
 */
export interface ExecutionConstraints {
  maxDuration: number; // milliseconds
  maxMemory: number; // MB
  maxDisk: number; // MB
  allowNetworkAccess: boolean;
  allowFileSystemWrite: boolean;
  allowExternalCommands: boolean;
  restrictedPaths?: string[];
  allowedCommands?: string[];
  environmentVariables?: Record<string, string>;
}

/**
 * Task permissions
 */
export interface TaskPermissions {
  readFiles: string[];
  writeFiles: string[];
  executeCommands: string[];
  accessNetworks: string[];
  modifyConfiguration: boolean;
  accessSecrets: string[];
  impersonateUsers?: string[];
}

// Export all types for easy importing
export type {
  Task,
  TaskExecutionPlan,
  TaskStep,
  TaskInput,
  TaskOutput,
  TaskDependency,
  TaskResult,
  TaskMetrics,
  TaskQuality,
  TaskIssue,
  TaskComment,
  TaskTemplate,
  TaskBatch,
  TaskExecutionContext,
  TestResults,
  TestFileResult,
  BuildStatus,
  BuildError,
  BuildWarning
};