
import { BaseAgent } from './BaseAgent';
import { AgentTask, AgentResult, AgentCapability} from '../types/Agents';
import { CodeSymbol } from '../types/Projects';
import { OllamaService } from '../services/OllamaService';
import { FileService } from '../services/FileService';
import { WorkspaceAnalyzer } from '../context/WorkspaceAnalyzer';
import { ProjectContext } from '../context/ProjectContext';
import * as path from 'path';

export class CoderAgent extends BaseAgent {
  private ollamaService: OllamaService;
  private fileService: FileService;
  private workspaceAnalyzer: WorkspaceAnalyzer | null = null;
  
  constructor() {
    super(
      'Coder',
      'coder',
      'Implements features, writes code, and maintains coding standards',
      [
        {
          name: 'Code Generation',
          description: 'Generates new code from specifications',
          inputTypes: ['create'],
          outputTypes: ['source_code', 'implementation']
        },
        {
          name: 'Code Modification',
          description: 'Modifies and refactors existing code',
          inputTypes: ['modify', 'refactor'],
          outputTypes: ['updated_code', 'refactored_code']
        },
        {
          name: 'Feature Implementation',
          description: 'Implements complete features across multiple files',
          inputTypes: ['create', 'modify'],
          outputTypes: ['feature_implementation']
        }
      ]
    );

    this.ollamaService = new OllamaService();
    this.fileService = new FileService();
    // WorkspaceAnalyzer will be initialized when needed with proper context
  }

  private getWorkspaceAnalyzer(workspaceRoot: string): WorkspaceAnalyzer {
    if (!this.workspaceAnalyzer) {
      const projectContext = new ProjectContext(workspaceRoot);
      this.workspaceAnalyzer = new WorkspaceAnalyzer(projectContext);
    }
    return this.workspaceAnalyzer;
  }

  protected validateTask(task: AgentTask): boolean {
    const isValidType = ['create', 'modify', 'refactor'].includes(task.type);
    const hasDescription = !!task.description && task.description.length > 5;
    return isValidType && hasDescription;
  }

  protected estimateTaskTime(task: AgentTask): number {
    const baseTime = 8000; // 8 seconds base
    const complexityFactor = this.estimateComplexity(task.description);
    return baseTime * complexityFactor;
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    this.log(`Coder implementing: ${task.description}`);

    switch (task.type) {
      case 'create':
        return await this.createCode(task);
      case 'modify':
        return await this.modifyCode(task);
      case 'refactor':
        return await this.refactorCode(task);
      default:
        throw new Error(`Unsupported task type: ${task.type}`);
    }
  }

  private async createCode(task: AgentTask): Promise<AgentResult> {
    const { description, parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';
    const targetFile = parameters?.targetFile;
    const featureType = parameters?.featureType || 'component';

    this.log(`Creating ${featureType}: ${description}`);

    // Analyze existing codebase for context
    const workspaceAnalyzer = this.getWorkspaceAnalyzer(workspaceRoot);
    const projectContext = await workspaceAnalyzer.analyzeWorkspace(workspaceRoot);
    const existingPatterns = await this.analyzeCodePatterns(workspaceRoot);

    // Generate code based on description and context
    const codePrompt = this.buildCodeGenerationPrompt(
      description, 
      featureType, 
      projectContext,
      existingPatterns
    );

    const aiResponse = await this.ollamaService.generateCode(codePrompt);
    const codeImplementation = this.parseCodeResponse(aiResponse);

    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];

    // Create or modify files based on implementation
    for (const file of codeImplementation.files) {
      const fullPath = path.join(workspaceRoot, file.path);
      
      if (await this.fileService.fileExists(fullPath)) {
        // File exists, merge with existing content
        const existingContent = await this.fileService.readFile(fullPath);
        const mergedContent = await this.mergeCodeContent(existingContent, file.content, file.mergeStrategy);
        await this.fileService.writeFile(fullPath, mergedContent);
        modifiedFiles.push(fullPath);
      } else {
        // Create new file
        await this.fileService.ensureDirectoryExists(path.dirname(fullPath));
        await this.fileService.writeFile(fullPath, file.content);
        createdFiles.push(fullPath);
      }
    }

    // Update imports and dependencies if needed
    if (codeImplementation.dependencies.length > 0) {
      await this.updateDependencies(workspaceRoot, codeImplementation.dependencies);
    }

    // Generate tests for the new code
    const testTasks = await this.generateTestTasks(codeImplementation, workspaceRoot);

    return this.createSuccessResult(
      task,
      `Implementation complete: ${createdFiles.length} files created, ${modifiedFiles.length} files modified`,
      createdFiles,
      modifiedFiles,
      testTasks
    );
  }

  private async modifyCode(task: AgentTask): Promise<AgentResult> {
    const { description, parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';
    const targetFiles = parameters?.targetFiles || [];
    const changeType = parameters?.changeType || 'enhancement';

    this.log(`Modifying code: ${changeType} - ${description}`);

    const modifiedFiles: string[] = [];

    for (const filePath of targetFiles) {
      const fullPath = path.join(workspaceRoot, filePath);
      
      if (!await this.fileService.fileExists(fullPath)) {
        this.log(`Warning: File not found: ${fullPath}`);
        continue;
      }

      const existingContent = await this.fileService.readFile(fullPath);
      const fileLanguage = this.detectLanguage(fullPath);
      
      const modificationPrompt = this.buildModificationPrompt(
        description,
        existingContent,
        fileLanguage,
        changeType
      );

      const aiResponse = await this.ollamaService.generateCode(modificationPrompt);
      const modifiedContent = this.extractModifiedCode(aiResponse, existingContent);

      // Validate the modification doesn't break syntax
      if (await this.validateCodeSyntax(modifiedContent, fileLanguage)) {
        await this.fileService.writeFile(fullPath, modifiedContent);
        modifiedFiles.push(fullPath);
      } else {
        this.log(`Warning: Syntax validation failed for ${fullPath}, skipping modification`);
      }
    }

    return this.createSuccessResult(
      task,
      `Code modification complete: ${modifiedFiles.length} files updated`,
      [],
      modifiedFiles
    );
  }

  private async refactorCode(task: AgentTask): Promise<AgentResult> {
    const { description, parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';
    const targetFiles = parameters?.targetFiles || [];
    const refactorType = parameters?.refactorType || 'clean_code';

    this.log(`Refactoring code: ${refactorType} - ${description}`);

    const modifiedFiles: string[] = [];
    const refactoringSummary: RefactoringSummary = {
      filesProcessed: 0,
      improvementsApplied: [],
      issuesFound: []
    };

    for (const filePath of targetFiles) {
      const fullPath = path.join(workspaceRoot, filePath);
      
      if (!await this.fileService.fileExists(fullPath)) {
        continue;
      }

      const existingContent = await this.fileService.readFile(fullPath);
      const fileLanguage = this.detectLanguage(fullPath);
      
      const refactorPrompt = this.buildRefactorPrompt(
        existingContent,
        fileLanguage,
        refactorType,
        description
      );

      const aiResponse = await this.ollamaService.generateCode(refactorPrompt);
      const refactoredResult = this.parseRefactorResponse(aiResponse);

      if (refactoredResult.code && refactoredResult.code !== existingContent) {
        // Validate refactored code
        if (await this.validateCodeSyntax(refactoredResult.code, fileLanguage)) {
          await this.fileService.writeFile(fullPath, refactoredResult.code);
          modifiedFiles.push(fullPath);
          refactoringSummary.improvementsApplied.push(...refactoredResult.improvements);
        } else {
          refactoringSummary.issuesFound.push(`Syntax validation failed for ${filePath}`);
        }
      }
      
      refactoringSummary.filesProcessed++;
    }

    return this.createSuccessResult(
      task,
      `Refactoring complete: ${modifiedFiles.length} files improved. Applied: ${refactoringSummary.improvementsApplied.join(', ')}`,
      [],
      modifiedFiles
    );
  }

  private buildCodeGenerationPrompt(
    description: string, 
    featureType: string, 
    projectContext: any,
    patterns: CodePattern[]
  ): string {
    return `
You are an expert ${projectContext.language[0] || 'TypeScript'} developer. Generate production-ready code for:

TASK: ${description}
TYPE: ${featureType}
PROJECT: ${projectContext.type} application using ${projectContext.framework || 'standard patterns'}

EXISTING PATTERNS IN CODEBASE:
${patterns.map(p => `- ${p.pattern}: ${p.description} (used ${p.frequency} times)`).join('\n')}

REQUIREMENTS:
1. Follow existing code style and patterns
2. Include proper error handling
3. Add TypeScript types if applicable
4. Include JSDoc comments
5. Follow SOLID principles
6. Include necessary imports

OUTPUT FORMAT:
Return response as JSON:
{
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "content": "// Complete file content here",
      "mergeStrategy": "replace|append|merge"
    }
  ],
  "dependencies": ["package-name"],
  "description": "Brief description of implementation"
}

Generate clean, maintainable, production-ready code that integrates well with the existing codebase.
`;
  }

  private buildModificationPrompt(
    description: string,
    existingCode: string,
    language: string,
    changeType: string
  ): string {
    return `
You are an expert ${language} developer. Modify the following code according to the requirements:

MODIFICATION REQUEST: ${description}
CHANGE TYPE: ${changeType}

EXISTING CODE:
\`\`\`${language}
${existingCode}
\`\`\`

REQUIREMENTS:
1. Maintain existing functionality
2. Preserve code style and patterns
3. Add proper error handling
4. Update types and interfaces if needed
5. Maintain backward compatibility when possible

Return ONLY the complete modified code without explanations or markdown formatting.
The response should be valid ${language} code that can directly replace the existing file content.
`;
  }

  private buildRefactorPrompt(
    existingCode: string,
    language: string,
    refactorType: string,
    description: string
  ): string {
    return `
You are an expert ${language} developer. Refactor the following code to improve quality:

REFACTORING GOAL: ${description}
TYPE: ${refactorType}

EXISTING CODE:
\`\`\`${language}
${existingCode}
\`\`\`

REFACTORING TARGETS:
- Remove code duplication
- Improve readability
- Optimize performance
- Follow SOLID principles
- Improve error handling
- Extract reusable functions
- Improve naming conventions

RETURN FORMAT:
{
  "code": "// Complete refactored code here",
  "improvements": ["List of improvements made"],
  "issues_found": ["List of issues that were fixed"]
}

Ensure the refactored code maintains the same functionality while being cleaner and more maintainable.
`;
  }

  private parseCodeResponse(aiResponse: string): CodeImplementation {
    try {
      // Try to parse as JSON first
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          files: parsed.files || [],
          dependencies: parsed.dependencies || [],
          description: parsed.description || ''
        };
      }
    } catch (error) {
      this.log('Failed to parse JSON response, using fallback parsing');
    }

    // Fallback: extract code blocks
    return this.extractCodeFromResponse(aiResponse);
  }

  private extractCodeFromResponse(response: string): CodeImplementation {
    const files: CodeFile[] = [];
    const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
    
    codeBlocks.forEach((block, index) => {
      const content = block.replace(/```[\w]*\n?/, '').replace(/```$/, '');
      const language = this.detectLanguageFromContent(content);
      const extension = this.getExtensionForLanguage(language);
      
      files.push({
        path: `src/generated_${index}.${extension}`,
        content: content.trim(),
        mergeStrategy: 'replace'
      });
    });

    return {
      files,
      dependencies: [],
      description: 'Generated code from AI response'
    };
  }

  private parseRefactorResponse(aiResponse: string): RefactorResult {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.log('Failed to parse refactor response');
    }

    return {
      code: aiResponse,
      improvements: [],
      issues_found: []
    };
  }

  private async mergeCodeContent(
    existing: string, 
    newContent: string, 
    strategy: string
  ): Promise<string> {
    switch (strategy) {
      case 'append':
        return existing + '\n\n' + newContent;
      
      case 'merge':
        // Smart merge: add new functions/classes, update existing ones
        return await this.smartMergeCode(existing, newContent);
      
      case 'replace':
      default:
        return newContent;
    }
  }

  private async smartMergeCode(existing: string, newCode: string): Promise<string> {
    // Simplified merge logic - in production, use AST parsing
    const existingLines = existing.split('\n');
    const newLines = newCode.split('\n');
    
    // Find import section
    const importEndIndex = existingLines.findIndex(line => 
      !line.startsWith('import') && !line.startsWith('//') && line.trim() !== ''
    );
    
    const newImports = newLines.filter(line => line.startsWith('import'));
    const newCodeWithoutImports = newLines.filter(line => !line.startsWith('import'));
    
    // Merge imports
    const existingImports = existingLines.slice(0, importEndIndex);
    const mergedImports = [...new Set([...existingImports, ...newImports])];
    
    // Combine
    return [
      ...mergedImports,
      '',
      ...existingLines.slice(importEndIndex),
      '',
      ...newCodeWithoutImports
    ].join('\n');
  }

  private async analyzeCodePatterns(workspaceRoot: string): Promise<CodePattern[]> {
    // Analyze existing code to understand patterns
    const patterns: CodePattern[] = [];
    
    try {
      const sourceFiles = await this.fileService.findFiles(workspaceRoot, '**/*.{ts,js,tsx,jsx}');
      const patternCounts = new Map<string, number>();
      
      for (const file of sourceFiles.slice(0, 10)) { // Limit analysis
        const content = await this.fileService.readFile(file);
        
        // Detect common patterns
        if (content.includes('export class')) patternCounts.set('class-based', (patternCounts.get('class-based') || 0) + 1);
        if (content.includes('export function')) patternCounts.set('functional', (patternCounts.get('functional') || 0) + 1);
        if (content.includes('export default')) patternCounts.set('default-export', (patternCounts.get('default-export') || 0) + 1);
        if (content.includes('interface ')) patternCounts.set('typescript-interfaces', (patternCounts.get('typescript-interfaces') || 0) + 1);
        if (content.includes('React.')) patternCounts.set('react-components', (patternCounts.get('react-components') || 0) + 1);
      }
      
      for (const [pattern, count] of patternCounts) {
        patterns.push({
          pattern,
          description: this.getPatternDescription(pattern),
          frequency: count
        });
      }
    } catch (error) {
      this.log(`Error analyzing code patterns: ${error}`);
    }
    
    return patterns;
  }

  private async updateDependencies(workspaceRoot: string, dependencies: string[]): Promise<void> {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    
    if (await this.fileService.fileExists(packageJsonPath)) {
      try {
        const packageContent = await this.fileService.readFile(packageJsonPath);
        const packageJson = JSON.parse(packageContent);
        
        // Add new dependencies
        if (!packageJson.dependencies) packageJson.dependencies = {};
        
        for (const dep of dependencies) {
          if (!packageJson.dependencies[dep]) {
            packageJson.dependencies[dep] = 'latest'; // In production, use specific versions
          }
        }
        
        await this.fileService.writeFile(
          packageJsonPath, 
          JSON.stringify(packageJson, null, 2)
        );
        
        this.log(`Updated package.json with ${dependencies.length} new dependencies`);
      } catch (error) {
        this.log(`Error updating package.json: ${error}`);
      }
    }
  }

  private getPatternDescription(pattern: string): string {
    const descriptions: Record<string, string> = {
      'class-based': 'Object-oriented classes',
      'functional': 'Functional programming approach',
      'default-export': 'Default exports pattern',
      'typescript-interfaces': 'TypeScript interfaces for type safety',
      'react-components': 'React component structure'
    };
    
    return descriptions[pattern] || 'Custom pattern';
  }

  private async generateTestTasks(implementation: CodeImplementation, workspaceRoot: string): Promise<AgentTask[]> {
    const testTasks: AgentTask[] = [];
    
    for (const file of implementation.files) {
      if (file.path.includes('.test.') || file.path.includes('.spec.')) {
        continue; // Skip test files
      }
      
      testTasks.push({
        id: `test-${path.basename(file.path, path.extname(file.path))}`,
        type: 'test',
        description: `Generate tests for ${file.path}`,
        priority: 'medium',
        parameters: {
          targetFile: file.path,
          workspaceRoot
        },
        created: new Date()
      });
    }
    
    return testTasks;
  }


  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust'
    };
    
    return languageMap[ext] || 'text';
  }

  private detectLanguageFromContent(content: string): string {
    if (content.includes('interface ') || content.includes(': string') || content.includes('export ')) return 'typescript';
    if (content.includes('def ') || content.includes('import ')) return 'python';
    if (content.includes('function ') || content.includes('const ') || content.includes('let ')) return 'javascript';
    if (content.includes('class ') && content.includes('public ')) return 'java';
    
    return 'text';
  }

  private getExtensionForLanguage(language: string): string {
    const extensionMap: Record<string, string> = {
      'typescript': 'ts',
      'javascript': 'js',
      'python': 'py',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'csharp': 'cs',
      'go': 'go',
      'rust': 'rs'
    };
    
    return extensionMap[language] || 'txt';
  }

  private async validateCodeSyntax(code: string, language: string): Promise<boolean> {
    // Basic syntax validation - in production, use language-specific parsers
    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
          // Basic JS/TS validation
          return !code.includes('SyntaxError') && 
                 this.validateBraces(code) &&
                 this.validateParentheses(code);
        
        case 'python':
          // Basic Python validation
          return this.validatePythonIndentation(code);
        
        default:
          return this.validateBraces(code);
      }
    } catch (error) {
      return false;
    }
  }

  private validateBraces(code: string): boolean {
    let count = 0;
    for (const char of code) {
      if (char === '{') count++;
      if (char === '}') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  private validateParentheses(code: string): boolean {
    let count = 0;
    for (const char of code) {
      if (char === '(') count++;
      if (char === ')') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  private validatePythonIndentation(code: string): boolean {
    const lines = code.split('\n');
    let indentLevel = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const indent = line.length - line.trimStart().length;
      
      if (line.endsWith(':')) {
        indentLevel += 4;
      } else if (indent < indentLevel && indent % 4 !== 0) {
        return false;
      }
    }
    
    return true;
  }

  private estimateComplexity(description: string): number {
    let complexity = 1;
    
    // Complexity indicators
    if (description.toLowerCase().includes('api')) complexity += 0.5;
    if (description.toLowerCase().includes('database')) complexity += 0.5;
    if (description.toLowerCase().includes('authentication')) complexity += 1;
    if (description.toLowerCase().includes('integration')) complexity += 0.8;
    if (description.toLowerCase().includes('complex')) complexity += 1;
    if (description.length > 100) complexity += 0.3;
    
    return Math.min(complexity, 3); // Cap at 3x
  }

  private extractModifiedCode(aiResponse: string, originalCode: string): string {
    // If response contains code blocks, extract the first one
    const codeBlock = aiResponse.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlock) {
      return codeBlock[1].trim();
    }
    
    // If no code blocks, assume entire response is code (fallback)
    return aiResponse.trim();
  }
}

// Supporting interfaces
interface CodeImplementation {
  files: CodeFile[];
  dependencies: string[];
  description: string;
}

interface CodeFile {
  path: string;
  content: string;
  mergeStrategy: 'replace' | 'append' | 'merge';
}

interface CodePattern {
  pattern: string;
  description: string;
  frequency: number;
}

interface RefactorResult {
  code: string;
  improvements: string[];
  issues_found: string[];
}

interface RefactoringSummary {
  filesProcessed: number;
  improvementsApplied: string[];
  issuesFound: string[];
}