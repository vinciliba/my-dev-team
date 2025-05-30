import { ProjectContext } from './ProjectContext';
import { ProjectStructure, DirectoryNode, CodeAnalysis, FileChange } from '../types/Projects';
import { AnalysisResult, CodeMetrics, SecurityIssue, PerformanceIssue, QualityIssue, DependencyIssue, ArchitectureInsight, TechnicalDebt } from '../types/Analysis';
import { Logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';

export class WorkspaceAnalyzer {
  private projectContext: ProjectContext;
  private logger: Logger;
  private analysisCache: Map<string, AnalysisResult> = new Map();
  private lastFullAnalysis: Date | null = null;

  constructor(projectContext: ProjectContext) {
    this.projectContext = projectContext;
    this.logger = new Logger('WorkspaceAnalyzer');
  }

  /**
   * Perform comprehensive workspace analysis
   */
  async analyzeWorkspace(force: boolean = false): Promise<AnalysisResult> {
    this.logger.info('Starting comprehensive workspace analysis...');
    
    const cacheKey = this.getCacheKey();
    
    // Check cache unless forced
    if (!force && this.analysisCache.has(cacheKey)) {
      const cached = this.analysisCache.get(cacheKey)!;
      if (this.isCacheValid(cached)) {
        this.logger.info('Returning cached analysis result');
        return cached;
      }
    }

    const startTime = Date.now();
    
    try {
      const [
        codeMetrics,
        securityIssues,
        performanceIssues,
        qualityIssues,
        dependencyIssues,
        architectureInsights,
        technicalDebt
      ] = await Promise.all([
        this.analyzeCodeMetrics(),
        this.analyzeSecurityIssues(),
        this.analyzePerformanceIssues(),
        this.analyzeQualityIssues(),
        this.analyzeDependencyIssues(),
        this.analyzeArchitecture(),
        this.analyzeTechnicalDebt()
      ]);

      const result: AnalysisResult = {
        timestamp: new Date(),
        workspaceRoot: this.projectContext.getWorkspaceRoot(),
        projectType: this.projectContext.getProjectType(),
        languages: this.projectContext.getPrimaryLanguages(),
        framework: this.projectContext.getFramework(),
        codeMetrics,
        securityIssues,
        performanceIssues,
        qualityIssues,
        dependencyIssues,
        architectureInsights,
        technicalDebt,
        recommendations: this.generateRecommendations({
          codeMetrics,
          securityIssues,
          performanceIssues,
          qualityIssues,
          dependencyIssues,
          architectureInsights,
          technicalDebt
        }),
        analysisTime: Date.now() - startTime
      };

      // Cache the result
      this.analysisCache.set(cacheKey, result);
      this.lastFullAnalysis = new Date();
      
      this.logger.info(`Workspace analysis completed in ${result.analysisTime}ms`);
      return result;

    } catch (error) {
      this.logger.error('Failed to analyze workspace:', error);
      throw error;
    }
  }

  /**
   * Analyze specific files that have changed
   */
  async analyzeChangedFiles(changes: FileChange[]): Promise<Partial<AnalysisResult>> {
    this.logger.info(`Analyzing ${changes.length} changed files...`);
    
    const changedFilePaths = changes.map(c => c.path);
    const relevantFiles = changedFilePaths.filter(filePath => 
      this.isAnalyzableFile(filePath)
    );

    if (relevantFiles.length === 0) {
      return { timestamp: new Date() };
    }

    try {
      const [
        deltaMetrics,
        deltaSecurityIssues,
        deltaQualityIssues
      ] = await Promise.all([
        this.analyzeFilesMetrics(relevantFiles),
        this.analyzeFilesForSecurity(relevantFiles),
        this.analyzeFilesForQuality(relevantFiles)
      ]);

      return {
        timestamp: new Date(),
        codeMetrics: deltaMetrics,
        securityIssues: deltaSecurityIssues,
        qualityIssues: deltaQualityIssues,
        recommendations: this.generateIncrementalRecommendations({
          codeMetrics: deltaMetrics,
          securityIssues: deltaSecurityIssues,
          qualityIssues: deltaQualityIssues
        })
      };

    } catch (error) {
      this.logger.error('Failed to analyze changed files:', error);
      throw error;
    }
  }

  /**
   * Get analysis summary for quick overview
   */
  getAnalysisSummary(): AnalysisSummary | null {
    const latest = this.getLatestAnalysis();
    if (!latest) return null;

    const totalIssues = 
      latest.securityIssues.length +
      latest.performanceIssues.length +
      latest.qualityIssues.length +
      latest.dependencyIssues.length;

    const criticalIssues = [
      ...latest.securityIssues.filter(i => i.severity === 'critical'),
      ...latest.performanceIssues.filter(i => i.severity === 'critical'),
      ...latest.qualityIssues.filter(i => i.severity === 'critical'),
      ...latest.dependencyIssues.filter(i => i.severity === 'critical')
    ].length;

    return {
      timestamp: latest.timestamp,
      projectHealth: this.calculateProjectHealth(latest),
      totalIssues,
      criticalIssues,
      codeQualityScore: this.calculateCodeQualityScore(latest),
      securityScore: this.calculateSecurityScore(latest),
      maintainabilityScore: this.calculateMaintainabilityScore(latest),
      topRecommendations: latest.recommendations.slice(0, 3)
    };
  }

  /**
   * Analyze code metrics (complexity, maintainability, etc.)
   */
  private async analyzeCodeMetrics(): Promise<CodeMetrics> {
    const structure = this.projectContext.getProjectStructure();
    const analysis = this.projectContext.getCodeAnalysis();
    
    if (!structure || !analysis) {
      return this.getEmptyCodeMetrics();
    }

    const sourceFiles = await this.getSourceFiles();
    let totalComplexity = 0;
    let totalFunctions = 0;
    let totalClasses = 0;
    const fileMetrics: Record<string, any> = {};

    for (const filePath of sourceFiles.slice(0, 50)) { // Limit for performance
      try {
        const content = await this.readFile(filePath);
        const metrics = await this.analyzeFileMetrics(filePath, content);
        
        totalComplexity += metrics.cyclomaticComplexity;
        totalFunctions += metrics.functions;
        totalClasses += metrics.classes;
        fileMetrics[filePath] = metrics;
      } catch (error) {
        this.logger.debug(`Error analyzing metrics for ${filePath}:`, error);
      }
    }

    const avgComplexity = totalFunctions > 0 ? totalComplexity / totalFunctions : 0;

    return {
      linesOfCode: analysis.totalLines,
      cyclomaticComplexity: totalComplexity,
      averageComplexity: avgComplexity,
      maintainabilityIndex: this.calculateMaintainabilityIndex(avgComplexity, analysis.totalLines),
      technicalDebtRatio: this.calculateTechnicalDebtRatio(analysis),
      testCoverage: await this.getTestCoverage(),
      duplicateCode: await this.findDuplicateCode(sourceFiles),
      fileMetrics
    };
  }

  /**
   * Analyze security vulnerabilities
   */
  private async analyzeSecurityIssues(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];
    const sourceFiles = await this.getSourceFiles();

    // Check dependencies for known vulnerabilities
    const dependencyVulns = await this.checkDependencyVulnerabilities();
    issues.push(...dependencyVulns);

    // Analyze source code for security patterns
    for (const filePath of sourceFiles.slice(0, 30)) {
      try {
        const content = await this.readFile(filePath);
        const fileIssues = await this.analyzeFileForSecurity(filePath, content);
        issues.push(...fileIssues);
      } catch (error) {
        this.logger.debug(`Error analyzing security for ${filePath}:`, error);
      }
    }

    // Check configuration files
    const configIssues = await this.analyzeConfigurationSecurity();
    issues.push(...configIssues);

    return issues.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Analyze performance issues
   */
  private async analyzePerformanceIssues(): Promise<PerformanceIssue[]> {
    const issues: PerformanceIssue[] = [];
    const sourceFiles = await this.getSourceFiles();

    for (const filePath of sourceFiles.slice(0, 30)) {
      try {
        const content = await this.readFile(filePath);
        const fileIssues = await this.analyzeFileForPerformance(filePath, content);
        issues.push(...fileIssues);
      } catch (error) {
        this.logger.debug(`Error analyzing performance for ${filePath}:`, error);
      }
    }

    // Check bundle size and optimization opportunities
    const bundleIssues = await this.analyzeBundlePerformance();
    issues.push(...bundleIssues);

    return issues.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Analyze code quality issues
   */
  private async analyzeQualityIssues(): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const sourceFiles = await this.getSourceFiles();

    for (const filePath of sourceFiles.slice(0, 40)) {
      try {
        const content = await this.readFile(filePath);
        const fileIssues = await this.analyzeFileForQuality(filePath, content);
        issues.push(...fileIssues);
      } catch (error) {
        this.logger.debug(`Error analyzing quality for ${filePath}:`, error);
      }
    }

    return issues.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Analyze dependency issues
   */
  private async analyzeDependencyIssues(): Promise<DependencyIssue[]> {
    const issues: DependencyIssue[] = [];
    const dependencies = this.projectContext.getDependencies();

    // Check for outdated dependencies
    const outdatedDeps = await this.checkOutdatedDependencies(dependencies);
    issues.push(...outdatedDeps);

    // Check for unused dependencies
    const unusedDeps = await this.findUnusedDependencies();
    issues.push(...unusedDeps);

    // Check for duplicate dependencies
    const duplicateDeps = await this.findDuplicateDependencies();
    issues.push(...duplicateDeps);

    // Check for license compatibility
    const licenseIssues = await this.checkLicenseCompatibility(dependencies);
    issues.push(...licenseIssues);

    return issues.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Analyze architecture and design patterns
   */
  private async analyzeArchitecture(): Promise<ArchitectureInsight[]> {
    const insights: ArchitectureInsight[] = [];
    const structure = this.projectContext.getProjectStructure();
    
    if (!structure) return insights;

    // Analyze project structure patterns
    const structureInsights = this.analyzeProjectStructure(structure);
    insights.push(...structureInsights);

    // Analyze import/dependency patterns
    const dependencyInsights = await this.analyzeDependencyPatterns();
    insights.push(...dependencyInsights);

    // Analyze design patterns usage
    const patternInsights = await this.analyzeDesignPatterns();
    insights.push(...patternInsights);

    // Analyze modularity and coupling
    const modularityInsights = await this.analyzeModularity();
    insights.push(...modularityInsights);

    return insights;
  }

  /**
   * Analyze technical debt
   */
  private async analyzeTechnicalDebt(): Promise<TechnicalDebt[]> {
    const debt: TechnicalDebt[] = [];
    const sourceFiles = await this.getSourceFiles();

    for (const filePath of sourceFiles.slice(0, 30)) {
      try {
        const content = await this.readFile(filePath);
        const fileDebt = await this.analyzeFileForTechnicalDebt(filePath, content);
        debt.push(...fileDebt);
      } catch (error) {
        this.logger.debug(`Error analyzing technical debt for ${filePath}:`, error);
      }
    }

    return debt.sort((a, b) => b.estimatedHours - a.estimatedHours);
  }

  /**
   * Helper method to analyze individual file metrics
   */
  private async analyzeFileMetrics(filePath: string, content: string): Promise<any> {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    // Simple complexity calculation based on control flow statements
    const complexityKeywords = ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', 'try'];
    let complexity = 1; // Base complexity
    
    for (const line of lines) {
      for (const keyword of complexityKeywords) {
        if (line.includes(keyword)) {
          complexity++;
        }
      }
    }

    // Count functions and classes (simplified)
    const functionMatches = content.match(/function\s+\w+|=>\s*{|^\s*(async\s+)?function/gm) || [];
    const classMatches = content.match(/class\s+\w+/gm) || [];

    return {
      linesOfCode: lines.length,
      nonEmptyLines: nonEmptyLines.length,
      cyclomaticComplexity: complexity,
      functions: functionMatches.length,
      classes: classMatches.length,
      comments: this.countComments(content)
    };
  }

  /**
   * Analyze file for security issues
   */
  private async analyzeFileForSecurity(filePath: string, content: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];
    const lines = content.split('\n');

    // Check for common security anti-patterns
    const securityPatterns = [
      { pattern: /eval\s*\(/g, type: 'code-injection', severity: 'high' as const, message: 'Use of eval() can lead to code injection' },
      { pattern: /innerHTML\s*=/g, type: 'xss', severity: 'medium' as const, message: 'Direct innerHTML assignment may lead to XSS' },
      { pattern: /document\.write/g, type: 'xss', severity: 'medium' as const, message: 'document.write can be exploited for XSS' },
      { pattern: /password.*=.*['"]/gi, type: 'credential-exposure', severity: 'critical' as const, message: 'Hardcoded password detected' },
      { pattern: /api[_-]?key.*=.*['"]/gi, type: 'credential-exposure', severity: 'critical' as const, message: 'Hardcoded API key detected' },
      { pattern: /secret.*=.*['"]/gi, type: 'credential-exposure', severity: 'high' as const, message: 'Hardcoded secret detected' }
    ];

    lines.forEach((line, index) => {
      securityPatterns.forEach(({ pattern, type, severity, message }) => {
        if (pattern.test(line)) {
          issues.push({
            type,
            severity,
            message,
            file: filePath,
            line: index + 1,
            code: line.trim(),
            recommendation: this.getSecurityRecommendation(type)
          });
        }
      });
    });

    return issues;
  }

  /**
   * Analyze file for performance issues
   */
  private async analyzeFileForPerformance(filePath: string, content: string): Promise<PerformanceIssue[]> {
    const issues: PerformanceIssue[] = [];
    const lines = content.split('\n');

    // Check for performance anti-patterns
    const performancePatterns = [
      { pattern: /for.*in.*Object\.keys/g, severity: 'medium' as const, message: 'Consider using Object.entries() or for...of loop' },
      { pattern: /\.map\(\)\.filter\(\)/g, severity: 'low' as const, message: 'Chain operations can be optimized with reduce()' },
      { pattern: /new RegExp\(/g, severity: 'low' as const, message: 'Consider using regex literals for better performance' },
      { pattern: /console\.log/g, severity: 'low' as const, message: 'Remove console.log statements in production' }
    ];

    lines.forEach((line, index) => {
      performancePatterns.forEach(({ pattern, severity, message }) => {
        if (pattern.test(line)) {
          issues.push({
            type: 'inefficient-code',
            severity,
            message,
            file: filePath,
            line: index + 1,
            code: line.trim(),
            impact: this.estimatePerformanceImpact(severity)
          });
        }
      });
    });

    return issues;
  }

  /**
   * Analyze file for quality issues
   */
  private async analyzeFileForQuality(filePath: string, content: string): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const lines = content.split('\n');

    // Check for code quality issues
    lines.forEach((line, index) => {
      // Long lines
      if (line.length > 120) {
        issues.push({
          type: 'style',
          severity: 'low',
          message: 'Line too long (>120 characters)',
          file: filePath,
          line: index + 1,
          code: line.substring(0, 50) + '...'
        });
      }

      // TODO comments
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
        issues.push({
          type: 'maintainability',
          severity: 'low',
          message: 'TODO/FIXME comment found',
          file: filePath,
          line: index + 1,
          code: line.trim()
        });
      }

      // Magic numbers
      const magicNumberPattern = /(?<!\w)\d{3,}(?!\w)/g;
      if (magicNumberPattern.test(line) && !line.includes('//')) {
        issues.push({
          type: 'maintainability',
          severity: 'low',
          message: 'Magic number detected, consider using named constant',
          file: filePath,
          line: index + 1,
          code: line.trim()
        });
      }
    });

    return issues;
  }

  // Helper methods
  private async getSourceFiles(): Promise<string[]> {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c'];
    return extensions.flatMap(ext => this.projectContext.getFilesByType(ext));
  }

  private async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.projectContext.getWorkspaceRoot(), filePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  private isAnalyzableFile(filePath: string): boolean {
    const analyzableExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c'];
    return analyzableExtensions.some(ext => filePath.endsWith(ext));
  }

  private getCacheKey(): string {
    const structure = this.projectContext.getProjectStructure();
    const recentChanges = this.projectContext.getRecentChanges(10);
    return `${structure?.root || 'unknown'}-${recentChanges.length}-${Date.now()}`;
  }

  private isCacheValid(result: AnalysisResult): boolean {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return Date.now() - result.timestamp.getTime() < maxAge;
  }

  private getLatestAnalysis(): AnalysisResult | null {
    const entries = Array.from(this.analysisCache.entries());
    if (entries.length === 0) return null;
    
    return entries.reduce((latest, [, result]) => 
      !latest || result.timestamp > latest.timestamp ? result : latest
    , null as AnalysisResult | null);
  }

  private calculateProjectHealth(analysis: AnalysisResult): 'excellent' | 'good' | 'fair' | 'poor' {
    const criticalIssues = [
      ...analysis.securityIssues.filter(i => i.severity === 'critical'),
      ...analysis.performanceIssues.filter(i => i.severity === 'critical'),
      ...analysis.qualityIssues.filter(i => i.severity === 'critical'),
      ...analysis.dependencyIssues.filter(i => i.severity === 'critical')
    ].length;

    if (criticalIssues === 0 && analysis.codeMetrics.maintainabilityIndex > 80) return 'excellent';
    if (criticalIssues <= 2 && analysis.codeMetrics.maintainabilityIndex > 60) return 'good';
    if (criticalIssues <= 5 && analysis.codeMetrics.maintainabilityIndex > 40) return 'fair';
    return 'poor';
  }

  private calculateCodeQualityScore(analysis: AnalysisResult): number {
    const base = 100;
    const qualityPenalty = analysis.qualityIssues.reduce((sum, issue) => 
      sum + this.getSeverityWeight(issue.severity), 0
    );
    return Math.max(0, base - qualityPenalty);
  }

  private calculateSecurityScore(analysis: AnalysisResult): number {
    const base = 100;
    const securityPenalty = analysis.securityIssues.reduce((sum, issue) => 
      sum + this.getSeverityWeight(issue.severity) * 2, 0
    );
    return Math.max(0, base - securityPenalty);
  }

  private calculateMaintainabilityScore(analysis: AnalysisResult): number {
    return Math.min(100, analysis.codeMetrics.maintainabilityIndex);
  }

  private getSeverityWeight(severity: 'low' | 'medium' | 'high' | 'critical'): number {
    const weights = { low: 1, medium: 3, high: 7, critical: 15 };
    return weights[severity];
  }

  private generateRecommendations(analysisData: any): string[] {
    const recommendations: string[] = [];

    // Security recommendations
    if (analysisData.securityIssues.length > 0) {
      const criticalSecurity = analysisData.securityIssues.filter((i: any) => i.severity === 'critical');
      if (criticalSecurity.length > 0) {
        recommendations.push(`Address ${criticalSecurity.length} critical security vulnerabilities immediately`);
      }
    }

    // Performance recommendations  
    if (analysisData.codeMetrics.averageComplexity > 10) {
      recommendations.push('Reduce code complexity by breaking down complex functions');
    }

    // Quality recommendations
    if (analysisData.codeMetrics.testCoverage < 80) {
      recommendations.push('Increase test coverage to at least 80%');
    }

    // Dependency recommendations
    const outdatedDeps = analysisData.dependencyIssues.filter((i: any) => i.type === 'outdated');
    if (outdatedDeps.length > 5) {
      recommendations.push('Update outdated dependencies to improve security and performance');
    }

    return recommendations.slice(0, 10); // Limit recommendations
  }

  private generateIncrementalRecommendations(deltaData: any): string[] {
    const recommendations: string[] = [];

    if (deltaData.securityIssues?.length > 0) {
      recommendations.push('Review security issues in recently changed files');
    }

    if (deltaData.qualityIssues?.length > 0) {
      recommendations.push('Address code quality issues in recent changes');
    }

    return recommendations;
  }

  // Placeholder implementations for complex analysis methods
  private async checkDependencyVulnerabilities(): Promise<SecurityIssue[]> {
    // Implement vulnerability checking logic
    return [];
  }

  private async analyzeConfigurationSecurity(): Promise<SecurityIssue[]> {
    // Implement config security analysis
    return [];
  }

  private async analyzeBundlePerformance(): Promise<PerformanceIssue[]> {
    // Implement bundle analysis
    return [];
  }

  private async checkOutdatedDependencies(deps: Record<string, string>): Promise<DependencyIssue[]> {
    // Implement outdated dependency checking
    return [];
  }

  private async findUnusedDependencies(): Promise<DependencyIssue[]> {
    // Implement unused dependency detection
    return [];
  }

  private async findDuplicateDependencies(): Promise<DependencyIssue[]> {
    // Implement duplicate dependency detection
    return [];
  }

  private async checkLicenseCompatibility(deps: Record<string, string>): Promise<DependencyIssue[]> {
    // Implement license compatibility checking
    return [];
  }

  private analyzeProjectStructure(structure: ProjectStructure): ArchitectureInsight[] {
    // Implement project structure analysis
    return [];
  }

  private async analyzeDependencyPatterns(): Promise<ArchitectureInsight[]> {
    // Implement dependency pattern analysis
    return [];
  }

  private async analyzeDesignPatterns(): Promise<ArchitectureInsight[]> {
    // Implement design pattern analysis
    return [];
  }

  private async analyzeModularity(): Promise<ArchitectureInsight[]> {
    // Implement modularity analysis
    return [];
  }

  private async analyzeFileForTechnicalDebt(filePath: string, content: string): Promise<TechnicalDebt[]> {
    // Implement technical debt analysis
    return [];
  }

  private calculateMaintainabilityIndex(complexity: number, linesOfCode: number): number {
    // Simplified maintainability index calculation
    return Math.max(0, 171 - 5.2 * Math.log(complexity) - 0.23 * linesOfCode);
  }

  private calculateTechnicalDebtRatio(analysis: CodeAnalysis): number {
    // Simplified technical debt ratio
    return Math.min(100, (analysis.totalLines / 1000) * 5);
  }

  private async getTestCoverage(): Promise<number> {
    // Implement test coverage calculation
    return 0;
  }

  private async findDuplicateCode(files: string[]): Promise<number> {
    // Implement duplicate code detection
    return 0;
  }

  private countComments(content: string): number {
    const singleLineComments = (content.match(/\/\/.*/g) || []).length;
    const multiLineComments = (content.match(/\/\*[\s\S]*?\*\//g) || []).length;
    return singleLineComments + multiLineComments;
  }

  private getSecurityRecommendation(type: string): string {
    const recommendations: Record<string, string> = {
      'code-injection': 'Avoid using eval(). Use safer alternatives like JSON.parse() or Function constructor.',
      'xss': 'Sanitize user input and use textContent instead of innerHTML when possible.',
      'credential-exposure': 'Move sensitive data to environment variables or secure configuration files.'
    };
    return recommendations[type] || 'Review and address this security concern.';
  }

  private estimatePerformanceImpact(severity: 'low' | 'medium' | 'high' | 'critical'): string {
    const impacts = {
      low: 'Minimal performance impact',
      medium: 'Moderate performance impact',
      high: 'Significant performance impact',
      critical: 'Severe performance impact'
    };
    return impacts[severity];
  }

  private async analyzeFilesMetrics(files: string[]): Promise<CodeMetrics> {
    // Simplified implementation for incremental analysis
    return this.getEmptyCodeMetrics();
  }

  private async analyzeFilesForSecurity(files: string[]): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];
    for (const filePath of files) {
      try {
        const content = await this.readFile(filePath);
        const fileIssues = await this.analyzeFileForSecurity(filePath, content);
        issues.push(...fileIssues);
      } catch (error) {
        this.logger.debug(`Error analyzing security for ${filePath}:`, error);
      }
    }
    return issues;
  }

  private async analyzeFilesForQuality(files: string[]): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    for (const filePath of files) {
      try {
        const content = await this.readFile(filePath);
        const fileIssues = await this.analyzeFileForQuality(filePath, content);
        issues.push(...fileIssues);
      } catch (error) {
        this.logger.debug(`Error analyzing quality for ${filePath}:`, error);
      }
    }
    return issues;
  }

  private getEmptyCodeMetrics(): CodeMetrics {
    return {
      linesOfCode: 0,
      cyclomaticComplexity: 0,
      averageComplexity: 0,
      maintainabilityIndex: 0,
      technicalDebtRatio: 0,
      testCoverage: 0,
      duplicateCode: 0,
      fileMetrics: {}
    };
  }
}

// Supporting interfaces for analysis summary
interface AnalysisSummary {
  timestamp: Date;
  projectHealth: 'excellent' | 'good' | 'fair' | 'poor';
  totalIssues: number;
  criticalIssues: number;
  codeQualityScore: number;
  securityScore: number;
  maintainabilityScore: number;
  topRecommendations: string[];
}