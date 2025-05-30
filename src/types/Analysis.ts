/**
 * Analysis Types for Workspace Analyzer
 * Defines all interfaces and types used for code analysis and workspace insights
 */

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type ProjectHealth = 'excellent' | 'good' | 'fair' | 'poor';
export type IssueType = 'security' | 'performance' | 'quality' | 'dependency' | 'architecture' | 'technical-debt';

/**
 * Main analysis result containing all workspace analysis data
 */
export interface AnalysisResult {
  timestamp: Date;
  workspaceRoot: string;
  projectType: string;
  languages: string[];
  framework?: string;
  codeMetrics: CodeMetrics;
  securityIssues: SecurityIssue[];
  performanceIssues: PerformanceIssue[];
  qualityIssues: QualityIssue[];
  dependencyIssues: DependencyIssue[];
  architectureInsights: ArchitectureInsight[];
  technicalDebt: TechnicalDebt[];
  recommendations: string[];
  analysisTime: number; // milliseconds
}

/**
 * Code metrics and complexity analysis
 */
export interface CodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  averageComplexity: number;
  maintainabilityIndex: number;
  technicalDebtRatio: number;
  testCoverage: number;
  duplicateCode: number;
  fileMetrics: Record<string, FileMetrics>;
}

/**
 * Metrics for individual files
 */
export interface FileMetrics {
  linesOfCode: number;
  nonEmptyLines: number;
  cyclomaticComplexity: number;
  functions: number;
  classes: number;
  comments: number;
  maintainabilityIndex?: number;
  cognitiveComplexity?: number;
}

/**
 * Security vulnerability or issue
 */
export interface SecurityIssue {
  type: SecurityIssueType;
  severity: SeverityLevel;
  message: string;
  file: string;
  line?: number;
  column?: number;
  code?: string;
  recommendation: string;
  cweId?: string; // Common Weakness Enumeration ID
  cvssScore?: number; // Common Vulnerability Scoring System
  references?: string[];
}

export type SecurityIssueType = 
  | 'code-injection'
  | 'xss'
  | 'sql-injection'
  | 'credential-exposure'
  | 'insecure-random'
  | 'path-traversal'
  | 'insecure-crypto'
  | 'weak-authentication'
  | 'data-exposure'
  | 'unsafe-deserialization'
  | 'missing-validation'
  | 'insecure-communication';

/**
 * Performance issue or optimization opportunity
 */
export interface PerformanceIssue {
  type: PerformanceIssueType;
  severity: SeverityLevel;
  message: string;
  file: string;
  line?: number;
  column?: number;
  code?: string;
  impact: string;
  suggestion?: string;
  estimatedImpact?: PerformanceImpact;
}

export type PerformanceIssueType =
  | 'inefficient-code'
  | 'memory-leak'
  | 'unnecessary-computation'
  | 'blocking-operation'
  | 'large-bundle'
  | 'unoptimized-query'
  | 'excessive-rerendering'
  | 'slow-algorithm'
  | 'resource-waste';

export interface PerformanceImpact {
  cpuImpact: 'low' | 'medium' | 'high';
  memoryImpact: 'low' | 'medium' | 'high';
  networkImpact: 'low' | 'medium' | 'high';
  userExperience: 'minimal' | 'noticeable' | 'significant';
}

/**
 * Code quality issue
 */
export interface QualityIssue {
  type: QualityIssueType;
  severity: SeverityLevel;
  message: string;
  file: string;
  line?: number;
  column?: number;
  code?: string;
  rule?: string;
  suggestion?: string;
}

export type QualityIssueType =
  | 'style'
  | 'maintainability'
  | 'readability'
  | 'complexity'
  | 'duplication'
  | 'naming'
  | 'documentation'
  | 'error-handling'
  | 'type-safety'
  | 'best-practices';

/**
 * Dependency-related issue
 */
export interface DependencyIssue {
  type: DependencyIssueType;
  severity: SeverityLevel;
  message: string;
  packageName: string;
  currentVersion?: string;
  recommendedVersion?: string;
  vulnerabilityId?: string;
  license?: string;
  recommendation: string;
  affectedFiles?: string[];
}

export type DependencyIssueType =
  | 'outdated'
  | 'vulnerable'
  | 'unused'
  | 'duplicate'
  | 'license-incompatible'
  | 'deprecated'
  | 'breaking-change'
  | 'size-impact'
  | 'peer-dependency';

/**
 * Architecture insight or pattern analysis
 */
export interface ArchitectureInsight {
  type: ArchitectureInsightType;
  category: ArchitectureCategory;
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  severity?: SeverityLevel;
  files?: string[];
  metrics?: Record<string, number>;
  recommendations?: string[];
}

export type ArchitectureInsightType =
  | 'pattern-usage'
  | 'coupling-analysis'
  | 'cohesion-analysis'
  | 'dependency-inversion'
  | 'layering-violation'
  | 'circular-dependency'
  | 'god-class'
  | 'feature-envy'
  | 'data-class'
  | 'shotgun-surgery';

export type ArchitectureCategory =
  | 'design-patterns'
  | 'solid-principles'
  | 'modularity'
  | 'separation-of-concerns'
  | 'code-organization'
  | 'dependency-management'
  | 'scalability'
  | 'maintainability';

/**
 * Technical debt item
 */
export interface TechnicalDebt {
  type: TechnicalDebtType;
  severity: SeverityLevel;
  title: string;
  description: string;
  file?: string;
  line?: number;
  estimatedHours: number;
  priority: DebtPriority;
  tags: string[];
  createdDate?: Date;
  lastUpdated?: Date;
  assignee?: string;
  blocksFeatures?: string[];
  relatedIssues?: string[];
}

export type TechnicalDebtType =
  | 'code-smell'
  | 'outdated-technology'
  | 'missing-tests'
  | 'documentation-debt'
  | 'infrastructure-debt'
  | 'design-debt'
  | 'knowledge-debt'
  | 'testing-debt'
  | 'configuration-debt'
  | 'data-debt';

export type DebtPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Analysis configuration and options
 */
export interface AnalysisConfig {
  enabledAnalyzers: AnalyzerType[];
  securityConfig: SecurityAnalysisConfig;
  performanceConfig: PerformanceAnalysisConfig;
  qualityConfig: QualityAnalysisConfig;
  dependencyConfig: DependencyAnalysisConfig;
  excludePatterns: string[];
  maxFilesToAnalyze: number;
  timeoutMs: number;
}

export type AnalyzerType =
  | 'security'
  | 'performance'
  | 'quality'
  | 'dependencies'
  | 'architecture'
  | 'technical-debt'
  | 'metrics';

export interface SecurityAnalysisConfig {
  enableVulnerabilityScanning: boolean;
  checkHardcodedSecrets: boolean;
  validateInputSanitization: boolean;
  checkCryptoUsage: boolean;
  excludeTestFiles: boolean;
  customRules: SecurityRule[];
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  severity: SeverityLevel;
  message: string;
  recommendation: string;
  filePatterns?: string[];
}

export interface PerformanceAnalysisConfig {
  checkAlgorithmComplexity: boolean;
  analyzeBundleSize: boolean;
  detectMemoryLeaks: boolean;
  checkAsyncPatterns: boolean;
  validateCaching: boolean;
  customRules: PerformanceRule[];
}

export interface PerformanceRule {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  severity: SeverityLevel;
  message: string;
  impact: PerformanceImpact;
  filePatterns?: string[];
}

export interface QualityAnalysisConfig {
  checkCodeStyle: boolean;
  validateNaming: boolean;
  detectDuplication: boolean;
  checkComplexity: boolean;
  enforceDocumentation: boolean;
  customRules: QualityRule[];
  eslintRules?: Record<string, any>;
}

export interface QualityRule {
  id: string;
  name: string;
  description: string;
  pattern?: RegExp;
  severity: SeverityLevel;
  message: string;
  autoFixable?: boolean;
  filePatterns?: string[];
}

export interface DependencyAnalysisConfig {
  checkOutdated: boolean;
  checkVulnerabilities: boolean;
  detectUnused: boolean;
  validateLicenses: boolean;
  allowedLicenses: string[];
  maxAge: number; // days
  excludeDevDependencies: boolean;
}

/**
 * Analysis progress and status
 */
export interface AnalysisProgress {
  phase: AnalysisPhase;
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  issuesFound: number;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
  errors: AnalysisError[];
}

export type AnalysisPhase =
  | 'initializing'
  | 'scanning-files'
  | 'analyzing-metrics'
  | 'checking-security'
  | 'analyzing-performance'
  | 'checking-quality'
  | 'analyzing-dependencies'
  | 'analyzing-architecture'
  | 'calculating-debt'
  | 'generating-recommendations'
  | 'finalizing'
  | 'completed'
  | 'error';

export interface AnalysisError {
  file?: string;
  phase: AnalysisPhase;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Analysis summary for quick overview
 */
export interface AnalysisSummary {
  timestamp: Date;
  projectHealth: ProjectHealth;
  totalIssues: number;
  criticalIssues: number;
  codeQualityScore: number;
  securityScore: number;
  maintainabilityScore: number;
  performanceScore: number;
  topRecommendations: string[];
  trendsData?: AnalysisTrends;
}

/**
 * Historical analysis trends
 */
export interface AnalysisTrends {
  codeQualityTrend: TrendData[];
  securityTrend: TrendData[];
  performanceTrend: TrendData[];
  issueCountTrend: TrendData[];
  technicalDebtTrend: TrendData[];
}

export interface TrendData {
  timestamp: Date;
  value: number;
  change?: number; // percentage change from previous
}

/**
 * Issue filter and search criteria
 */
export interface IssueFilter {
  types?: IssueType[];
  severities?: SeverityLevel[];
  files?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  searchText?: string;
  tags?: string[];
  assignee?: string;
  status?: IssueStatus;
}

export type IssueStatus = 'open' | 'in-progress' | 'resolved' | 'ignored' | 'false-positive';

/**
 * Analysis report configuration
 */
export interface ReportConfig {
  format: ReportFormat;
  includeSections: ReportSection[];
  includeCharts: boolean;
  includeCodeSamples: boolean;
  includeRecommendations: boolean;
  maxIssuesPerSection: number;
  sortBy: 'severity' | 'type' | 'file' | 'date';
  groupBy?: 'file' | 'type' | 'severity';
}

export type ReportFormat = 'html' | 'pdf' | 'markdown' | 'json' | 'csv';

export type ReportSection =
  | 'executive-summary'
  | 'code-metrics'
  | 'security-issues'
  | 'performance-issues'
  | 'quality-issues'
  | 'dependency-issues'
  | 'architecture-insights'
  | 'technical-debt'
  | 'recommendations'
  | 'trends'
  | 'appendix';

/**
 * Code complexity metrics
 */
export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  parameterCount: number;
  linesOfCode: number;
  halsteadMetrics?: HalsteadMetrics;
}

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  calculatedLength: number;
  volume: number;
  difficulty: number;
  effort: number;
  time: number;
  bugs: number;
}

/**
 * Test coverage information
 */
export interface TestCoverage {
  statements: CoverageData;
  branches: CoverageData;
  functions: CoverageData;
  lines: CoverageData;
  files: FileCoverage[];
}

export interface CoverageData {
  total: number;
  covered: number;
  percentage: number;
}

export interface FileCoverage {
  file: string;
  statements: CoverageData;
  branches: CoverageData;
  functions: CoverageData;
  lines: CoverageData;
  uncoveredLines: number[];
}

/**
 * Duplicate code detection
 */
export interface DuplicateCode {
  files: string[];
  startLine: number;
  endLine: number;
  duplicateCount: number;
  similarity: number;
  codeBlock: string;
  tokens: number;
}

/**
 * Dependency graph and analysis
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  circularDependencies: CircularDependency[];
  orphanNodes: string[];
  clusters: DependencyCluster[];
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'file' | 'module' | 'package';
  path: string;
  language?: string;
  size: number;
  exports: string[];
  imports: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'require' | 'dynamic';
  weight: number;
}

export interface CircularDependency {
  nodes: string[];
  severity: SeverityLevel;
  suggestedBreakPoint?: string;
}

export interface DependencyCluster {
  id: string;
  nodes: string[];
  cohesion: number;
  coupling: number;
}

/**
 * Export all types for easy importing
 */
export type {
  AnalysisResult,
  CodeMetrics,
  FileMetrics,
  SecurityIssue,
  PerformanceIssue,
  QualityIssue,
  DependencyIssue,
  ArchitectureInsight,
  TechnicalDebt,
  AnalysisConfig,
  AnalysisProgress,
  AnalysisSummary,
  AnalysisTrends,
  IssueFilter,
  ReportConfig,
  ComplexityMetrics,
  TestCoverage,
  DuplicateCode,
  DependencyGraph
};