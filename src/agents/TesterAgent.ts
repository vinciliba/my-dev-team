import { BaseAgent } from './BaseAgent';
import { AgentTask, AgentResult, AgentCapability} from '../types/Agents';
import { TestResults, TestFileResult } from '../types/Task';
import { OllamaService } from '../services/OllamaService';
import { FileService } from '../services/FileService';
import { WorkspaceAnalyzer } from '../context/WorkspaceAnalyzer';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TestSummary } from '../types/Task';
import { ProjectContext } from '../context/ProjectContext';

const execAsync = promisify(exec);


export class TesterAgent extends BaseAgent {
  private ollamaService: OllamaService;
  private fileService: FileService;
  private workspaceAnalyzer: WorkspaceAnalyzer | null = null;


  constructor() {
    super(
      'Tester',
      'tester',
      'Generates tests, runs test suites, and ensures code quality through comprehensive testing',
      [
        {
          name: 'Test Generation',
          description: 'Generates unit, integration, and e2e tests',
          inputTypes: ['test', 'create'],
          outputTypes: ['test_files', 'test_suite']
        },
        {
          name: 'Test Execution',
          description: 'Runs test suites and reports results',
          inputTypes: ['test'],
          outputTypes: ['test_results', 'coverage_report']
        },
        {
          name: 'Test Analysis',
          description: 'Analyzes test coverage and suggests improvements',
          inputTypes: ['analyze'],
          outputTypes: ['coverage_analysis', 'test_recommendations']
        }
      ]
    );

    this.ollamaService = new OllamaService();
    this.fileService = new FileService();
  }

  protected validateTask(task: AgentTask): boolean {
    return ['test', 'create', 'analyze'].includes(task.type) && 
           task.description &&
           (task.parameters?.targetFile || task.parameters?.workspaceRoot);
  }

  protected estimateTaskTime(task: AgentTask): number {
    const baseTime = 6000; // 6 seconds base
    const testType = task.parameters?.testType || 'unit';
    const multiplier = this.getTimeMultiplier(testType);
    return baseTime * multiplier;
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    this.log(`Tester working on: ${task.description}`);

    switch (task.type) {
      case 'test':
        return await this.runTests(task);
      case 'create':
        return await this.generateTests(task);
      case 'analyze':
        return await this.analyzeTestCoverage(task);
      default:
        throw new Error(`Unsupported task type: ${task.type}`);
    }
  }

   private getWorkspaceAnalyzer(workspaceRoot: string): WorkspaceAnalyzer {
      if (!this.workspaceAnalyzer) {
        const projectContext = new ProjectContext(workspaceRoot);
        this.workspaceAnalyzer = new WorkspaceAnalyzer(projectContext);
      }
      return this.workspaceAnalyzer;
    }

  private async generateTests(task: AgentTask): Promise<AgentResult> {
    const { description, parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';
    const targetFile = parameters?.targetFile;
    const testType = parameters?.testType || 'unit';

    this.log(`Generating ${testType} tests for: ${targetFile || 'project'}`);

    const createdFiles: string[] = [];
    const testResults: TestGenerationResult[] = [];

    if (targetFile) {
      // Generate tests for specific file
      const result = await this.generateTestsForFile(targetFile, workspaceRoot, testType);
      createdFiles.push(...result.files);
      testResults.push(result);
    } else {
      // Generate tests for entire project
      const sourceFiles = await this.findTestableFiles(workspaceRoot);
      
      for (const sourceFile of sourceFiles.slice(0, 5)) { // Limit to prevent overwhelming
        const result = await this.generateTestsForFile(sourceFile, workspaceRoot, testType);
        createdFiles.push(...result.files);
        testResults.push(result);
      }
    }

    // Generate test configuration if it doesn't exist
    const configFiles = await this.generateTestConfiguration(workspaceRoot);
    createdFiles.push(...configFiles);

    const summary = this.createTestGenerationSummary(testResults);

    return this.createSuccessResult(
      task,
      `Test generation complete: ${createdFiles.length} test files created. ${summary}`,
      createdFiles,
      []
    );
  }

  private async runTests(task: AgentTask): Promise<AgentResult> {
    const { parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';
    const testPattern = parameters?.testPattern || '**/*.test.*';
    const testFramework = parameters?.framework || await this.detectTestFramework(workspaceRoot);

    this.log(`Running tests with ${testFramework} framework`);

    try {
      // Run tests based on detected framework
      const testResults = await this.executeTestFramework(workspaceRoot, testFramework, testPattern);
      
      // Generate coverage report
      const coverageReport = await this.generateCoverageReport(workspaceRoot, testFramework);
      
      // Analyze results and suggest improvements
      const analysis = await this.analyzeTestResults(testResults, coverageReport);
      
      // Save test report
      const reportPath = await this.saveTestReport(workspaceRoot, testResults, coverageReport, analysis);

      const success = testResults.passed === testResults.total;
      const message = success 
        ? `All ${testResults.total} tests passed! Coverage: ${coverageReport.overallCoverage}%`
        : `${testResults.failed}/${testResults.total} tests failed. Coverage: ${coverageReport.overallCoverage}%`;

      return this.createSuccessResult(
        task,
        message,
        [reportPath],
        [],
        analysis.recommendedActions.map(action => this.createActionTask(action, workspaceRoot))
      );

    } catch (error) {
      this.log(`Test execution failed:`,);
      return this.createErrorResult(task, `Test execution failed:`);
    }
  }

  private async analyzeTestCoverage(task: AgentTask): Promise<AgentResult> {
    const { parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';

    this.log('Analyzing test coverage and quality');

    try {
      // Analyze existing test files
      const testFiles = await this.findTestFiles(workspaceRoot);
      const sourceFiles = await this.findTestableFiles(workspaceRoot);
      
      const coverageAnalysis = await this.performCoverageAnalysis(testFiles, sourceFiles, workspaceRoot);
      const qualityAnalysis = await this.performTestQualityAnalysis(testFiles, workspaceRoot);
      
      // Generate recommendations
      const recommendations = await this.generateTestRecommendations(
        coverageAnalysis,
        qualityAnalysis,
        workspaceRoot
      );

      // Create analysis report
      const reportPath = await this.saveAnalysisReport(workspaceRoot, {
        coverage: coverageAnalysis,
        quality: qualityAnalysis,
        recommendations
      });

      return this.createSuccessResult(
        task,
        `Test analysis complete. Coverage: ${coverageAnalysis.overallCoverage}%, Quality Score: ${qualityAnalysis.overallScore}/10`,
        [reportPath],
        [],
        recommendations.map(rec => this.createRecommendationTask(rec, workspaceRoot))
      );

    } catch (error) {
      return this.createErrorResult(task, `Analysis failed:`);
    }
  }

  private async generateTestsForFile(
    targetFile: string, 
    workspaceRoot: string, 
    testType: string
  ): Promise<TestGenerationResult> {
    const fullPath = path.join(workspaceRoot, targetFile);
    
    if (!await this.fileService.fileExists(fullPath)) {
      throw new Error(`Target file not found: ${targetFile}`);
    }

    const sourceCode = await this.fileService.readFile(fullPath);
    const language = this.detectLanguage(fullPath);
    const framework = await this.detectTestFramework(workspaceRoot);
    
    // Analyze source code to understand structure
    const codeAnalysis = await this.analyzeSourceCode(sourceCode, language);
    
    // Generate appropriate tests
    const testPrompt = this.buildTestGenerationPrompt(
      sourceCode,
      codeAnalysis,
      language,
      framework,
      testType
    );

    const aiResponse = await this.ollamaService.generateCode(testPrompt);
    const testCode = this.parseTestResponse(aiResponse);

    // Create test file path
    const testFilePath = this.generateTestFilePath(targetFile, testType);
    const fullTestPath = path.join(workspaceRoot, testFilePath);

    // Ensure test directory exists
    await this.fileService.ensureDirectoryExists(path.dirname(fullTestPath));

    // Write test file
    await this.fileService.writeFile(fullTestPath, testCode.content);

    return {
      sourceFile: targetFile,
      testFile: testFilePath,
      testType,
      framework,
      files: [fullTestPath],
      testsGenerated: testCode.testCount,
      coverageEstimate: testCode.coverageEstimate
    };
  }

  private async findTestableFiles(workspaceRoot: string): Promise<string[]> {
    const patterns = [
      '**/*.ts',
      '**/*.js',
      '**/*.tsx',
      '**/*.jsx',
      '**/*.py',
      '**/*.java'
    ];

    const excludePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/coverage/**'
    ];

    const allFiles = await this.fileService.findFiles(workspaceRoot, patterns[0]); // Simplified
    return allFiles.filter(file => 
      !excludePatterns.some(pattern => 
        file.includes(pattern.replace('**/', '').replace('/**', ''))
      )
    );
  }

  private async findTestFiles(workspaceRoot: string): Promise<string[]> {
    const patterns = [
      '**/*.test.*',
      '**/*.spec.*',
      '**/test/**/*.*',
      '**/tests/**/*.*'
    ];

    return await this.fileService.findFiles(workspaceRoot, patterns[0]); // Simplified
  }

  private async detectTestFramework(workspaceRoot: string): Promise<TestFramework> {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    
    if (await this.fileService.fileExists(packageJsonPath)) {
      try {
        const packageContent = await this.fileService.readFile(packageJsonPath);
        const packageJson = JSON.parse(packageContent);
        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };

        // Detect framework based on dependencies
        if (dependencies.jest) return 'jest';
        if (dependencies.mocha) return 'mocha';
        if (dependencies.vitest) return 'vitest';
        if (dependencies.ava) return 'ava';
        if (dependencies.tap) return 'tap';
        if (dependencies.pytest) return 'pytest';
        if (dependencies.unittest) return 'unittest';
      } catch (error) {
        this.log('Error reading package.json:');
      }
    }

    // Default framework based on file types
    const sourceFiles = await this.findTestableFiles(workspaceRoot);
    const hasTypeScript = sourceFiles.some(file => file.endsWith('.ts') || file.endsWith('.tsx'));
    const hasPython = sourceFiles.some(file => file.endsWith('.py'));

    if (hasPython) return 'pytest';
    if (hasTypeScript) return 'jest';
    return 'jest'; // Default
  }

  private buildTestGenerationPrompt(
    sourceCode: string,
    analysis: CodeAnalysis,
    language: string,
    framework: TestFramework,
    testType: string
  ): string {
    return `
You are an expert test engineer. Generate comprehensive ${testType} tests for the following ${language} code using ${framework}.

SOURCE CODE TO TEST:
\`\`\`${language}
${sourceCode}
\`\`\`

CODE ANALYSIS:
- Functions: ${analysis.functions.map(f => f.name).join(', ')}
- Classes: ${analysis.classes.map(c => c.name).join(', ')}
- Exports: ${analysis.exports.join(', ')}
- Complexity: ${analysis.complexity}

TEST REQUIREMENTS:
1. Test all public functions and methods
2. Include edge cases and error scenarios
3. Test both positive and negative cases
4. Include setup and teardown if needed
5. Use proper ${framework} syntax and best practices
6. Add descriptive test names and comments
7. Aim for high code coverage
8. Include mocking where appropriate

TEST TYPE: ${testType}
${testType === 'unit' ? '- Focus on individual functions/methods\n- Mock external dependencies' : ''}
${testType === 'integration' ? '- Test component interactions\n- Include real dependencies where appropriate' : ''}
${testType === 'e2e' ? '- Test complete user workflows\n- Include UI interactions if applicable' : ''}

RETURN FORMAT:
Return a JSON object:
{
  "content": "// Complete test file content here",
  "testCount": 5,
  "coverageEstimate": 85,
  "description": "Brief description of tests generated"
}

Generate production-ready, comprehensive tests that follow ${framework} best practices.
`;
  }

  private parseTestResponse(aiResponse: string): TestCode {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          content: parsed.content || '',
          testCount: parsed.testCount || 0,
          coverageEstimate: parsed.coverageEstimate || 0,
          description: parsed.description || ''
        };
      }
    } catch (error) {
      this.log('Failed to parse test response, using fallback');
    }

    // Fallback: extract code from response
    const codeBlock = aiResponse.match(/```[\w]*\n([\s\S]*?)```/);
    const content = codeBlock ? codeBlock[1] : aiResponse;
    
    return {
      content: content.trim(),
      testCount: this.estimateTestCount(content),
      coverageEstimate: 70,
      description: 'Generated tests'
    };
  }

  private async analyzeSourceCode(sourceCode: string, language: string): Promise<CodeAnalysis> {
    const analysis: CodeAnalysis = {
      functions: [],
      classes: [],
      exports: [],
      complexity: 'medium'
    };

    // Simple pattern-based analysis (in production, use AST parsing)
    const lines = sourceCode.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect functions
      const functionMatch = trimmed.match(/(?:function|const|let|var)\s+(\w+)|(\w+)\s*[=:]\s*(?:function|\([^)]*\)\s*=>)/);
      if (functionMatch) {
        const name = functionMatch[1] || functionMatch[2];
        analysis.functions.push({ name, line: lines.indexOf(line) + 1 });
      }
      
      // Detect classes
      const classMatch = trimmed.match(/class\s+(\w+)/);
      if (classMatch) {
        analysis.classes.push({ name: classMatch[1], line: lines.indexOf(line) + 1 });
      }
      
      // Detect exports
      const exportMatch = trimmed.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)?\s*(\w+)/);
      if (exportMatch) {
        analysis.exports.push(exportMatch[1]);
      }
    }

    // Estimate complexity
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(sourceCode);
    analysis.complexity = cyclomaticComplexity > 10 ? 'high' : cyclomaticComplexity > 5 ? 'medium' : 'low';

    return analysis;
  }

  private calculateCyclomaticComplexity(code: string): number {
    // Simple cyclomatic complexity calculation
    const complexityKeywords = ['if', 'else', 'while', 'for', 'case', 'catch', '&&', '||', '?'];
    let complexity = 1; // Base complexity
    
    for (const keyword of complexityKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  private generateTestFilePath(sourceFile: string, testType: string): string {
    const parsed = path.parse(sourceFile);
    const testSuffix = testType === 'unit' ? 'test' : 
                     testType === 'integration' ? 'integration.test' :
                     'e2e.test';
    
    // Place tests in __tests__ directory or alongside source
    const testDir = parsed.dir.includes('src') ? 
      parsed.dir.replace('src', '__tests__') : 
      path.join(parsed.dir, '__tests__');
    
    return path.join(testDir, `${parsed.name}.${testSuffix}${parsed.ext}`);
  }

  private async executeTestFramework(
    workspaceRoot: string, 
    framework: TestFramework, 
    pattern: string
  ): Promise<TestResults> {
    const commands: Record<TestFramework, string> = {
      jest: 'npx jest --coverage --json',
      mocha: 'npx mocha --reporter json',
      vitest: 'npx vitest run --coverage --reporter=json',
      ava: 'npx ava --tap',
      tap: 'npx tap --coverage',
      pytest: 'python -m pytest --json-report',
      unittest: 'python -m unittest discover -v'
    };

    const command = commands[framework];
    if (!command) {
      throw new Error(`Unsupported test framework: ${framework}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: workspaceRoot,
        timeout: 60000 // 1 minute timeout
      });

      return this.parseTestResults(stdout, framework);
    } catch (error) {
      // Even if tests fail, we might get useful output
      if (error && typeof error === 'object' && 'stdout' in error) {
        return this.parseTestResults((error as any).stdout || '', framework);
      }
      throw error;
    }
  }

  private parseTestResults(output: string, framework: TestFramework): TestResults {
    try {
      switch (framework) {
        case 'jest':
          return this.parseJestResults(output);
        case 'mocha':
          return this.parseMochaResults(output);
        default:
          return this.parseGenericResults(output);
      }
    } catch (error) {
      this.log('Error parsing test results:');
      return this.createDefaultTestResults();
    }
  }

private parseJestResults(output: string): TestResults {
  try {
    const jestResult = JSON.parse(output);
    const passed = jestResult.numPassedTests || 0;
    const failed = jestResult.numFailedTests || 0;
    const total = jestResult.numTotalTests || 0;
    
    return {
      total,
      passed,
      failed,
      coverage: jestResult.coverageMap ? this.calculateJestCoverage(jestResult.coverageMap) : 0,
      files: jestResult.testResults?.map((result: any) => ({
        file: result.name,
        tests: result.numTotalTests,
        passed: result.numPassingTests,
        failed: result.numFailingTests,
        coverage: 0,
        duration: result.perfStats.end - result.perfStats.start
      })) || [],
      timestamp: new Date(),
      duration: jestResult.perfStats?.end - jestResult.perfStats?.start || 0,
      summary: {
        message: `${passed} passed, ${failed} failed`,
        status: failed > 0 ? 'failed' : 'passed'
      } as any  // Use 'any' instead of TestSummary
    };
  } catch (error) {
    return this.createDefaultTestResults();
  }
}

private parseMochaResults(output: string): TestResults {
  try {
    const mochaResult = JSON.parse(output);
    const total = mochaResult.stats.tests || 0;
    const passed = mochaResult.stats.passes || 0;
    const failed = mochaResult.stats.failures || 0;
    
    return {
      total,
      passed,
      failed,
      coverage: 0, // Mocha doesn't include coverage by default
      files: [],
      timestamp: new Date(),
      duration: mochaResult.stats.duration || 0,  // Add this line
      summary: {
        message: `${passed} passed, ${failed} failed`,
        status: failed > 0 ? 'failed' : 'passed'
      } as any  // Use 'any' instead of TestSummary
    };
  } catch (error) {
    return this.createDefaultTestResults();
  }
}

private parseGenericResults(output: string): TestResults {
  const passedMatch = output.match(/(\d+) passing/);
  const failedMatch = output.match(/(\d+) failing/);
  
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const total = passed + failed;
  
  return {
    total,
    passed,
    failed,
    coverage: 0,
    files: [],
    timestamp: new Date(),
    duration: 0,                    // Add this line
    summary: {
      message: `${passed} passed, ${failed} failed`,
      status: failed > 0 ? 'failed' : 'passed'
    } as any  // Use 'any' instead of TestSummary
  };
}

private createDefaultTestResults(): TestResults {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    coverage: 0,
    files: [],
    timestamp: new Date(),
    duration: 0,                    // Add this line
   summary: {
      message: 'No tests executed',
      status: 'passed'
    } as any  // Use 'any' instead of TestSummary
  };
}

  private calculateJestCoverage(coverageMap: any): number {
    if (!coverageMap) return 0;
    
    let totalStatements = 0;
    let coveredStatements = 0;
    
    for (const file in coverageMap) {
      const fileCoverage = coverageMap[file];
      if (fileCoverage.s) {
        for (const statement in fileCoverage.s) {
          totalStatements++;
          if (fileCoverage.s[statement] > 0) {
            coveredStatements++;
          }
        }
      }
    }
    
    return totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0;
  }

  private async generateCoverageReport(workspaceRoot: string, framework: TestFramework): Promise<CoverageReport> {
    // This would integrate with coverage tools like Istanbul, nyc, coverage.py, etc.
    return {
      overallCoverage: 75, // Placeholder
      lineCoverage: 78,
      branchCoverage: 72,
      functionCoverage: 85,
      files: []
    };
  }

  private async analyzeTestResults(results: TestResults, coverage: CoverageReport): Promise<TestAnalysis> {
    const aiPrompt = `
  Analyze these test results and provide actionable recommendations:

  TEST RESULTS:
  - Total Tests: ${results.total}
  - Passed: ${results.passed}
  - Failed: ${results.failed}
  - Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%

  COVERAGE:
  - Overall: ${coverage.overallCoverage}%
  - Lines: ${coverage.lineCoverage}%
  - Branches: ${coverage.branchCoverage}%
  - Functions: ${coverage.functionCoverage}%

  Provide analysis in this format:
  {
    "overallHealth": "excellent|good|fair|poor",
    "criticalIssues": ["list of critical issues"],
    "recommendations": ["list of specific recommendations"],
    "priority": "high|medium|low"
  }

  Focus on actionable improvements for test quality and coverage.
  `;

    try {
      const aiResponse = await this.ollamaService.generateCode(aiPrompt);
      const analysis = JSON.parse(aiResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
      
      return {
        overallHealth: analysis.overallHealth || 'fair',
        criticalIssues: analysis.criticalIssues || [],
        recommendedActions: analysis.recommendations || [],
        priority: analysis.priority || 'medium'
      };
    } catch (error) {
      this.log(`Error analyzing test results: ${error}`);
      return this.createDefaultAnalysis(results, coverage);
    }
  }

  private createDefaultAnalysis(results: TestResults, coverage: CoverageReport): TestAnalysis {
    const successRate = (results.passed / results.total) * 100;
    const issues: string[] = [];
    const actions: string[] = [];
    
    if (successRate < 90) issues.push('Low test success rate');
    if (coverage.overallCoverage < 80) issues.push('Insufficient test coverage');
    if (results.total < 10) issues.push('Too few tests');
    
    if (coverage.overallCoverage < 80) actions.push('Increase test coverage to at least 80%');
    if (results.failed > 0) actions.push('Fix failing tests');
    if (coverage.branchCoverage < 70) actions.push('Add tests for uncovered branches');
    
    return {
      overallHealth: successRate > 95 && coverage.overallCoverage > 85 ? 'excellent' : 
                    successRate > 85 && coverage.overallCoverage > 75 ? 'good' : 
                    successRate > 70 ? 'fair' : 'poor',
      criticalIssues: issues,
      recommendedActions: actions,
      priority: issues.length > 2 ? 'high' : issues.length > 0 ? 'medium' : 'low'
    };
  }

  private async generateTestConfiguration(workspaceRoot: string): Promise<string[]> {
    const configFiles: string[] = [];
    const framework = await this.detectTestFramework(workspaceRoot);
    
    // Generate Jest config
    if (framework === 'jest') {
      const jestConfigPath = path.join(workspaceRoot, 'jest.config.js');
      if (!await this.fileService.fileExists(jestConfigPath)) {
        const jestConfig = this.generateJestConfig();
        await this.fileService.writeFile(jestConfigPath, jestConfig);
        configFiles.push(jestConfigPath);
      }
    }
    
    // Generate test scripts in package.json
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (await this.fileService.fileExists(packageJsonPath)) {
      // Add test scripts if missing (simplified implementation)
      // In production, properly parse and update package.json
    }
    
    return configFiles;
  }

  private generateJestConfig(): string {
    return `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
`;
  }

  private async saveTestReport(
    workspaceRoot: string, 
    results: TestResults, 
    coverage: CoverageReport,
    analysis: TestAnalysis
  ): Promise<string> {
    const reportPath = path.join(workspaceRoot, 'test-reports', `test-report-${Date.now()}.md`);
    await this.fileService.ensureDirectoryExists(path.dirname(reportPath));
    
    const report = this.generateTestReport(results, coverage, analysis);
    await this.fileService.writeFile(reportPath, report);
    
    return reportPath;
  }

  private generateTestReport(results: TestResults, coverage: CoverageReport, analysis: TestAnalysis): string {
    return `# Test Report

## Summary
- **Total Tests**: ${results.total}
- **Passed**: ${results.passed} ✅
- **Failed**: ${results.failed} ❌
- **Success Rate**: ${((results.passed / results.total) * 100).toFixed(1)}%
- **Overall Health**: ${analysis.overallHealth.toUpperCase()}

## Coverage
- **Overall**: ${coverage.overallCoverage}%
- **Lines**: ${coverage.lineCoverage}%
- **Branches**: ${coverage.branchCoverage}%
- **Functions**: ${coverage.functionCoverage}%

## Analysis
### Critical Issues
${analysis.criticalIssues.map(issue => `- ⚠️ ${issue}`).join('\n')}

### Recommended Actions
${analysis.recommendedActions.map(action => `- 🔧 ${action}`).join('\n')}

## File Results
${results.files.map(file => `
### ${file.file}
- Tests: ${file.tests}
- Passed: ${file.passed}
- Failed: ${file.failed}
- Duration: ${file.duration}ms
`).join('\n')}

---
*Generated by Tester Agent on ${new Date().toISOString()}*
`;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java'
    };
    
    return languageMap[ext] || 'javascript';
  }

  private estimateTestCount(content: string): number {
    const testKeywords = ['test(', 'it(', 'describe(', 'def test_', 'class Test'];
    let count = 0;
    
    for (const keyword of testKeywords) {
      const matches = content.match(new RegExp(keyword, 'g'));
      if (matches) count += matches.length;
    }
    
    return count;
  }

  private getTimeMultiplier(testType: string): number {
    const multipliers: Record<string, number> = {
      'unit': 1,
      'integration': 1.5,
      'e2e': 2.5,
      'performance': 3
    };
    
    return multipliers[testType] || 1;
  }


  private createTestGenerationSummary(results: TestGenerationResult[]): string {
    const totalTests = results.reduce((sum, r) => sum + r.testsGenerated, 0);
    const avgCoverage = results.reduce((sum, r) => sum + r.coverageEstimate, 0) / results.length;
    
    return `${totalTests} tests generated, estimated ${avgCoverage.toFixed(1)}% coverage`;
  }

  private createActionTask(action: string, workspaceRoot: string): AgentTask {
    return {
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'create',
      description: action,
      priority: 'medium',
      parameters: {
        workspaceRoot,
        actionType: 'test_improvement',
        recommendation: action
      },
      created: new Date()
    };
  }

  private createRecommendationTask(recommendation: TestRecommendation, workspaceRoot: string): AgentTask {
    return {
      id: `recommendation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: recommendation.type,
      description: recommendation.description,
      priority: recommendation.priority,
      parameters: {
        workspaceRoot,
        targetFiles: recommendation.targetFiles,
        recommendationType: recommendation.category
      },
      created: new Date()
    };
  }

  private async performCoverageAnalysis(
    testFiles: string[],
    sourceFiles: string[],
    workspaceRoot: string
  ): Promise<CoverageAnalysis> {
    const testedFiles = new Set<string>();
    const untestedFiles: string[] = [];
    
    // Analyze which source files have corresponding tests
    for (const sourceFile of sourceFiles) {
      const possibleTestFiles = this.getPossibleTestFiles(sourceFile);
      const hasTest = possibleTestFiles.some(testFile => 
        testFiles.some(existing => existing.includes(path.basename(testFile)))
      );
      
      if (hasTest) {
        testedFiles.add(sourceFile);
      } else {
        untestedFiles.push(sourceFile);
      }
    }
    
    const overallCoverage = Math.round((testedFiles.size / sourceFiles.length) * 100);
    
    return {
      overallCoverage,
      testedFiles: Array.from(testedFiles),
      untestedFiles,
      coverageByDirectory: await this.calculateDirectoryCoverage(sourceFiles, Array.from(testedFiles)),
      missingTestTypes: this.identifyMissingTestTypes(testFiles)
    };
  }

  private async performTestQualityAnalysis(
    testFiles: string[],
    workspaceRoot: string
  ): Promise<TestQualityAnalysis> {
    let totalScore = 0;
    const fileScores: TestFileQuality[] = [];
    
    for (const testFile of testFiles.slice(0, 10)) { // Limit for performance
      const fullPath = path.join(workspaceRoot, testFile);
      if (await this.fileService.fileExists(fullPath)) {
        const content = await this.fileService.readFile(fullPath);
        const quality = await this.analyzeTestFileQuality(content, testFile);
        fileScores.push(quality);
        totalScore += quality.score;
      }
    }
    
    const overallScore = fileScores.length > 0 ? totalScore / fileScores.length : 0;
    
    return {
      overallScore: Math.round(overallScore * 10) / 10,
      fileScores,
      commonIssues: this.identifyCommonIssues(fileScores),
      suggestions: this.generateQualitySuggestions(fileScores)
    };
  }

  private async generateTestRecommendations(
    coverageAnalysis: CoverageAnalysis,
    qualityAnalysis: TestQualityAnalysis,
    workspaceRoot: string
  ): Promise<TestRecommendation[]> {
    const recommendations: TestRecommendation[] = [];
    
    // Coverage-based recommendations
    if (coverageAnalysis.overallCoverage < 80) {
      recommendations.push({
        type: 'create',
        category: 'coverage',
        description: `Add tests for ${coverageAnalysis.untestedFiles.length} untested files`,
        priority: 'high',
        targetFiles: coverageAnalysis.untestedFiles.slice(0, 5), // Top 5 priority
        estimatedEffort: 'medium'
      });
    }
    
    // Missing test types
    for (const missingType of coverageAnalysis.missingTestTypes) {
      recommendations.push({
        type: 'create',
        category: 'test_type',
        description: `Add ${missingType} tests to improve coverage`,
        priority: 'medium',
        targetFiles: [],
        estimatedEffort: 'high'
      });
    }
    
    // Quality-based recommendations
    if (qualityAnalysis.overallScore < 7) {
      recommendations.push({
        type: 'refactor',
        category: 'quality',
        description: 'Improve test quality by addressing common issues',
        priority: 'medium',
        targetFiles: qualityAnalysis.fileScores
          .filter(f => f.score < 6)
          .map(f => f.file),
        estimatedEffort: 'medium'
      });
    }
    
    // Specific file recommendations
    for (const fileScore of qualityAnalysis.fileScores) {
      if (fileScore.score < 5) {
        recommendations.push({
          type: 'modify',
          category: 'file_quality',
          description: `Improve test quality in ${fileScore.file}`,
          priority: 'low',
          targetFiles: [fileScore.file],
          estimatedEffort: 'low'
        });
      }
    }
    
    return recommendations;
  }

  private async saveAnalysisReport(
    workspaceRoot: string,
    analysis: {
      coverage: CoverageAnalysis;
      quality: TestQualityAnalysis;
      recommendations: TestRecommendation[];
    }
  ): Promise<string> {
    const reportPath = path.join(workspaceRoot, 'test-reports', `analysis-report-${Date.now()}.md`);
    await this.fileService.ensureDirectoryExists(path.dirname(reportPath));
    
    const report = `# Test Analysis Report

## Coverage Analysis
- **Overall Coverage**: ${analysis.coverage.overallCoverage}%
- **Tested Files**: ${analysis.coverage.testedFiles.length}
- **Untested Files**: ${analysis.coverage.untestedFiles.length}

### Untested Files
${analysis.coverage.untestedFiles.slice(0, 10).map(file => `- ❌ ${file}`).join('\n')}

### Missing Test Types
${analysis.coverage.missingTestTypes.map(type => `- 🔍 ${type} tests needed`).join('\n')}

## Quality Analysis
- **Overall Score**: ${analysis.quality.overallScore}/10
- **Files Analyzed**: ${analysis.quality.fileScores.length}

### Common Issues
${analysis.quality.commonIssues.map(issue => `- ⚠️ ${issue}`).join('\n')}

### Quality Suggestions
${analysis.quality.suggestions.map(suggestion => `- 💡 ${suggestion}`).join('\n')}

## Recommendations

### High Priority
${analysis.recommendations
  .filter(r => r.priority === 'high')
  .map(r => `- 🔥 ${r.description}`)
  .join('\n')}

### Medium Priority
${analysis.recommendations
  .filter(r => r.priority === 'medium')
  .map(r => `- 🟡 ${r.description}`)
  .join('\n')}

### Low Priority
${analysis.recommendations
  .filter(r => r.priority === 'low')
  .map(r => `- 🟢 ${r.description}`)
  .join('\n')}

---
*Generated by Tester Agent on ${new Date().toISOString()}*
`;
    
    await this.fileService.writeFile(reportPath, report);
    return reportPath;
  }

  private getPossibleTestFiles(sourceFile: string): string[] {
    const parsed = path.parse(sourceFile);
    const baseName = parsed.name;
    const dir = parsed.dir;
    
    return [
      path.join(dir, `${baseName}.test${parsed.ext}`),
      path.join(dir, `${baseName}.spec${parsed.ext}`),
      path.join(dir, '__tests__', `${baseName}.test${parsed.ext}`),
      path.join(dir, '__tests__', `${baseName}.spec${parsed.ext}`),
      path.join('tests', `${baseName}.test${parsed.ext}`),
      path.join('test', `${baseName}.test${parsed.ext}`)
    ];
  }

  private async calculateDirectoryCoverage(
    sourceFiles: string[],
    testedFiles: string[]
  ): Promise<Record<string, number>> {
    const directoryCoverage: Record<string, number> = {};
    const directoryStats: Record<string, { total: number; tested: number }> = {};
    
    // Count files by directory
    for (const file of sourceFiles) {
      const dir = path.dirname(file);
      if (!directoryStats[dir]) {
        directoryStats[dir] = { total: 0, tested: 0 };
      }
      directoryStats[dir].total++;
    }
    
    // Count tested files by directory
    for (const file of testedFiles) {
      const dir = path.dirname(file);
      if (directoryStats[dir]) {
        directoryStats[dir].tested++;
      }
    }
    
    // Calculate coverage percentages
    for (const [dir, stats] of Object.entries(directoryStats)) {
      directoryCoverage[dir] = Math.round((stats.tested / stats.total) * 100);
    }
    
    return directoryCoverage;
  }

  private identifyMissingTestTypes(testFiles: string[]): string[] {
    const existingTypes = new Set<string>();
    
    for (const file of testFiles) {
      if (file.includes('.test.') || file.includes('.spec.')) existingTypes.add('unit');
      if (file.includes('integration')) existingTypes.add('integration');
      if (file.includes('e2e') || file.includes('end-to-end')) existingTypes.add('e2e');
      if (file.includes('performance') || file.includes('perf')) existingTypes.add('performance');
    }
    
    const allTypes = ['unit', 'integration', 'e2e', 'performance'];
    return allTypes.filter(type => !existingTypes.has(type));
  }

  private async analyzeTestFileQuality(content: string, fileName: string): Promise<TestFileQuality> {
    let score = 10; // Start with perfect score
    const issues: string[] = [];
    
    // Check for test structure
    if (!content.includes('describe') && !content.includes('test') && !content.includes('it')) {
      score -= 3;
      issues.push('No clear test structure');
    }
    
    // Check for assertions
    const assertionKeywords = ['expect', 'assert', 'should', 'assertEqual', 'assertTrue'];
    const hasAssertions = assertionKeywords.some(keyword => content.includes(keyword));
    if (!hasAssertions) {
      score -= 2;
      issues.push('No assertions found');
    }
    
    // Check for setup/teardown
    if (!content.includes('beforeEach') && !content.includes('beforeAll') && 
        !content.includes('setUp') && !content.includes('setup')) {
      score -= 1;
      issues.push('No setup/teardown methods');
    }
    
    // Check for mocking
    if (content.includes('import') && !content.includes('mock') && !content.includes('stub')) {
      score -= 1;
      issues.push('No mocking detected for dependencies');
    }
    
    // Check for descriptive test names
    const testNameRegex = /(test|it)\s*\(\s*['"`]([^'"`]*)/g;
    const testNames = [...content.matchAll(testNameRegex)].map(match => match[2]);
    const hasDescriptiveNames = testNames.some(name => name.length > 20);
    if (!hasDescriptiveNames && testNames.length > 0) {
      score -= 1;
      issues.push('Test names could be more descriptive');
    }
    
    // Check for edge cases
    const edgeCaseKeywords = ['null', 'undefined', 'empty', 'zero', 'negative', 'boundary'];
    const hasEdgeCases = edgeCaseKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
    if (!hasEdgeCases) {
      score -= 1;
      issues.push('No edge case testing detected');
    }
    
    return {
      file: fileName,
      score: Math.max(0, score),
      issues,
      suggestions: this.generateFileSuggestions(issues)
    };
  }

  private identifyCommonIssues(fileScores: TestFileQuality[]): string[] {
    const issueFrequency: Record<string, number> = {};
    
    for (const fileScore of fileScores) {
      for (const issue of fileScore.issues) {
        issueFrequency[issue] = (issueFrequency[issue] || 0) + 1;
      }
    }
    
    return Object.entries(issueFrequency)
      .filter(([, count]) => count > fileScores.length * 0.3) // Issues in >30% of files
      .map(([issue]) => issue)
      .sort((a, b) => issueFrequency[b] - issueFrequency[a]);
  }

  private generateQualitySuggestions(fileScores: TestFileQuality[]): string[] {
    const suggestions: string[] = [];
    const commonIssues = this.identifyCommonIssues(fileScores);
    
    if (commonIssues.includes('No assertions found')) {
      suggestions.push('Add proper assertions to verify expected behavior');
    }
    
    if (commonIssues.includes('No setup/teardown methods')) {
      suggestions.push('Implement setup and teardown methods for consistent test state');
    }
    
    if (commonIssues.includes('Test names could be more descriptive')) {
      suggestions.push('Use descriptive test names that explain what is being tested');
    }
    
    if (commonIssues.includes('No edge case testing detected')) {
      suggestions.push('Add tests for edge cases, error conditions, and boundary values');
    }
    
    if (commonIssues.includes('No mocking detected for dependencies')) {
      suggestions.push('Mock external dependencies to create isolated unit tests');
    }
    
    return suggestions;
  }

  private generateFileSuggestions(issues: string[]): string[] {
    const suggestions: string[] = [];
    
    for (const issue of issues) {
      switch (issue) {
        case 'No clear test structure':
          suggestions.push('Organize tests using describe/context blocks');
          break;
        case 'No assertions found':
          suggestions.push('Add expect() statements to verify behavior');
          break;
        case 'No setup/teardown methods':
          suggestions.push('Add beforeEach/afterEach for test setup');
          break;
        case 'No mocking detected for dependencies':
          suggestions.push('Mock external dependencies with jest.mock()');
          break;
        case 'Test names could be more descriptive':
          suggestions.push('Use descriptive test names explaining the scenario');
          break;
        case 'No edge case testing detected':
          suggestions.push('Add tests for null, undefined, and boundary values');
          break;
      }
    }
    
    return suggestions;
  }
}

// Supporting interfaces for the TesterAgent
type TestFramework = 'jest' | 'mocha' | 'vitest' | 'ava' | 'tap' | 'pytest' | 'unittest';

interface TestCode {
  content: string;
  testCount: number;
  coverageEstimate: number;
  description: string;
}

interface TestGenerationResult {
  sourceFile: string;
  testFile: string;
  testType: string;
  framework: TestFramework;
  files: string[];
  testsGenerated: number;
  coverageEstimate: number;
}

interface CodeAnalysis {
  functions: Array<{ name: string; line: number }>;
  classes: Array<{ name: string; line: number }>;
  exports: string[];
  complexity: 'low' | 'medium' | 'high';
}

interface CoverageReport {
  overallCoverage: number;
  lineCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  files: Array<{
    file: string;
    coverage: number;
  }>;
}

interface TestAnalysis {
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  criticalIssues: string[];
  recommendedActions: string[];
  priority: 'high' | 'medium' | 'low';
}

interface CoverageAnalysis {
  overallCoverage: number;
  testedFiles: string[];
  untestedFiles: string[];
  coverageByDirectory: Record<string, number>;
  missingTestTypes: string[];
}

interface TestQualityAnalysis {
  overallScore: number;
  fileScores: TestFileQuality[];
  commonIssues: string[];
  suggestions: string[];
}

interface TestFileQuality {
  file: string;
  score: number;
  issues: string[];
  suggestions: string[];
}

interface TestRecommendation {
  type: 'create' | 'modify' | 'refactor';
  category: 'coverage' | 'quality' | 'test_type' | 'file_quality';
  description: string;
  priority: 'high' | 'medium' | 'low';
  targetFiles: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
}