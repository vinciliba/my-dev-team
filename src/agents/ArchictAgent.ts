import { BaseAgent } from './BaseAgent';
import { AgentTask, AgentResult, AgentCapability } from '../types/Agents';
import {ProjectStructure } from '../types/Projects';
import { TaskExecutionPlan } from '../types/Task';
import { OllamaService } from '../services/OllamaService';
import { FileService } from '../services/FileService';
import { WorkspaceAnalyzer } from '../context/WorkspaceAnalyzer';
import * as path from 'path';

export class ArchitectAgent extends BaseAgent {
  private ollamaService: OllamaService;
  private fileService: FileService;
  private workspaceAnalyzer: WorkspaceAnalyzer;

  constructor() {
    super(
      'Architect',
      'architect',
      'Analyzes requirements and designs project architecture',
      [
        {
          name: 'Project Analysis',
          description: 'Analyzes project requirements and creates structure',
          inputTypes: ['analyze'],
          outputTypes: ['project_plan', 'file_structure']
        },
        {
          name: 'Architecture Design',
          description: 'Designs software architecture and patterns',
          inputTypes: ['create'],
          outputTypes: ['architecture_diagram', 'design_document']
        }
      ]
    );

    this.ollamaService = new OllamaService();
    this.fileService = new FileService();
    this.workspaceAnalyzer = new WorkspaceAnalyzer();
  }

  protected validateTask(task: AgentTask): boolean {
    return ['analyze', 'create'].includes(task.type) && 
           task.description && 
           task.description.length > 10;
  }

  protected estimateTaskTime(task: AgentTask): number {
    // Estimate based on task complexity
    const baseTime = 5000; // 5 seconds base
    const complexityMultiplier = task.description.length > 100 ? 2 : 1;
    return baseTime * complexityMultiplier;
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    this.log(`Architect analyzing: ${task.description}`);

    switch (task.type) {
      case 'analyze':
        return await this.analyzeRequirements(task);
      case 'create':
        return await this.createProjectStructure(task);
      default:
        throw new Error(`Unsupported task type: ${task.type}`);
    }
  }

  private async analyzeRequirements(task: AgentTask): Promise<AgentResult> {
    const { description, parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';

    this.log('Analyzing project requirements...');

    // Analyze existing project if workspace exists
    let existingProject: ProjectStructure | null = null;
    if (workspaceRoot) {
      existingProject = await this.workspaceAnalyzer.analyzeWorkspace(workspaceRoot);
    }

    // Use AI to analyze requirements and suggest architecture
    const analysisPrompt = this.buildAnalysisPrompt(description, existingProject);
    const aiResponse = await this.ollamaService.generateCode(analysisPrompt);

    // Parse AI response into structured plan
    const projectPlan = this.parseProjectPlan(aiResponse);

    // Create analysis document
    const analysisDoc = this.createAnalysisDocument(projectPlan, description);
    const analysisPath = path.join(workspaceRoot, 'docs', 'architecture-analysis.md');
    
    if (workspaceRoot) {
      await this.fileService.ensureDirectoryExists(path.dirname(analysisPath));
      await this.fileService.writeFile(analysisPath, analysisDoc);
    }

    return this.createSuccessResult(
      task,
      `Project analysis completed. Architecture plan created with ${projectPlan.components.length} components.`,
      [analysisPath],
      [],
      this.generateNextTasks(projectPlan, workspaceRoot)
    );
  }

  private async createProjectStructure(task: AgentTask): Promise<AgentResult> {
    const { description, parameters } = task;
    const workspaceRoot = parameters?.workspaceRoot || '';
    const projectType = parameters?.type || 'web';

    this.log(`Creating ${projectType} project structure...`);

    // Generate project structure based on type and requirements
    const structurePrompt = this.buildStructurePrompt(description, projectType);
    const aiResponse = await this.ollamaService.generateCode(structurePrompt);

    // Parse and create directory structure
    const structure = this.parseDirectoryStructure(aiResponse);
    const createdFiles: string[] = [];

    for (const item of structure.items) {
      const fullPath = path.join(workspaceRoot, item.path);
      
      if (item.type === 'directory') {
        await this.fileService.ensureDirectoryExists(fullPath);
      } else {
        await this.fileService.ensureDirectoryExists(path.dirname(fullPath));
        await this.fileService.writeFile(fullPath, item.content || this.getTemplateContent(item));
        createdFiles.push(fullPath);
      }
    }

    // Create package.json if it's a Node.js project
    if (['web', 'api', 'library'].includes(projectType)) {
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const packageJson = this.generatePackageJson(description, projectType);
      await this.fileService.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      createdFiles.push(packageJsonPath);
    }

    // Create README.md
    const readmePath = path.join(workspaceRoot, 'README.md');
    const readme = this.generateReadme(description, projectType);
    await this.fileService.writeFile(readmePath, readme);
    createdFiles.push(readmePath);

    return this.createSuccessResult(
      task,
      `Project structure created with ${createdFiles.length} files and directories.`,
      createdFiles,
      [],
      []
    );
  }

  private buildAnalysisPrompt(description: string, existingProject?: ProjectStructure | null): string {
    return `
As a Senior Software Architect, analyze the following project requirements and provide a detailed architecture plan:

PROJECT DESCRIPTION: ${description}

${existingProject ? `
EXISTING PROJECT STRUCTURE:
- Type: ${existingProject.type}
- Language: ${existingProject.language.join(', ')}
- Framework: ${existingProject.framework || 'None'}
- Files: ${existingProject.structure.children?.length || 0} items
` : 'This is a new project starting from scratch.'}

Please provide analysis in this format:

## PROJECT ANALYSIS
- **Type**: [web/api/desktop/mobile/library]
- **Primary Language**: [JavaScript/TypeScript/Python/etc]
- **Framework**: [React/Express/FastAPI/etc]
- **Architecture Pattern**: [MVC/Microservices/Component-based/etc]

## COMPONENTS
List main components/modules needed:
1. Component Name - Description
2. Component Name - Description

## DIRECTORY STRUCTURE
Suggested folder organization

## TECHNOLOGY STACK
- Frontend: 
- Backend: 
- Database: 
- Testing: 
- Deployment: 

## NEXT STEPS
Priority order for implementation

Provide practical, implementable recommendations for a modern software project.
`;
  }

  private buildStructurePrompt(description: string, projectType: string): string {
    return `
Create a ${projectType} project directory structure for: ${description}

Generate a modern, best-practice folder structure. Return ONLY a JSON array of items:

[
  {"type": "directory", "path": "src"},
  {"type": "directory", "path": "src/components"},
  {"type": "file", "path": "src/index.ts", "template": "main_entry"},
  {"type": "file", "path": ".gitignore", "template": "gitignore"}
]

For ${projectType} projects, include:
- src/ directory for source code
- tests/ for testing
- docs/ for documentation
- Appropriate config files
- Modern tooling setup

Provide 10-15 essential files and directories for a production-ready project structure.
`;
  }

  private parseProjectPlan(aiResponse: string): ProjectPlan {
    // Simple parsing - in production, use more robust parsing
    const components: ProjectComponent[] = [];
    const lines = aiResponse.split('\n');
    
    let inComponentsSection = false;
    
    for (const line of lines) {
      if (line.includes('## COMPONENTS')) {
        inComponentsSection = true;
        continue;
      }
      
      if (line.startsWith('##') && inComponentsSection) {
        inComponentsSection = false;
      }
      
      if (inComponentsSection && line.match(/^\d+\./)) {
        const match = line.match(/^\d+\.\s*(.+?)\s*-\s*(.+)$/);
        if (match) {
          components.push({
            name: match[1].trim(),
            description: match[2].trim(),
            type: 'module'
          });
        }
      }
    }

    return {
      type: this.extractValue(aiResponse, 'Type') || 'web',
      language: this.extractValue(aiResponse, 'Primary Language') || 'TypeScript',
      framework: this.extractValue(aiResponse, 'Framework') || '',
      components,
      nextSteps: this.extractNextSteps(aiResponse)
    };
  }

  private parseDirectoryStructure(aiResponse: string): DirectoryStructure {
    try {
      // Extract JSON from AI response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON structure found in response');
      }
      
      const items = JSON.parse(jsonMatch[0]);
      return { items };
    } catch (error) {
      this.log('Failed to parse directory structure, using fallback');
      return this.getFallbackStructure();
    }
  }

  private extractValue(text: string, key: string): string | null {
    const regex = new RegExp(`\\*\\*${key}\\*\\*:?\\s*([^\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim().replace(/^\[|\]$/g, '') : null;
  }

  private extractNextSteps(text: string): string[] {
    const steps: string[] = [];
    const lines = text.split('\n');
    let inNextSteps = false;
    
    for (const line of lines) {
      if (line.includes('## NEXT STEPS')) {
        inNextSteps = true;
        continue;
      }
      
      if (line.startsWith('##') && inNextSteps) {
        break;
      }
      
      if (inNextSteps && line.match(/^\d+\./)) {
        steps.push(line.replace(/^\d+\.\s*/, '').trim());
      }
    }
    
    return steps;
  }

  private generateNextTasks(projectPlan: ProjectPlan, workspaceRoot: string): AgentTask[] {
    const tasks: AgentTask[] = [];
    
    // Create task for each component
    projectPlan.components.forEach((component, index) => {
      tasks.push({
        id: `create-${component.name.toLowerCase().replace(/\s+/g, '-')}`,
        type: 'create',
        description: `Create ${component.name}: ${component.description}`,
        priority: index === 0 ? 'high' : 'medium',
        parameters: {
          component: component.name,
          workspaceRoot,
          type: component.type
        },
        created: new Date()
      });
    });

    return tasks;
  }

  private generatePackageJson(description: string, projectType: string): any {
    const name = description.toLowerCase().replace(/\s+/g, '-').substring(0, 50);
    
    const base = {
      name,
      version: '1.0.0',
      description,
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        dev: 'nodemon src/index.js',
        test: 'jest',
        build: 'npm run compile'
      },
      keywords: [],
      author: '',
      license: 'MIT'
    };

    switch (projectType) {
      case 'web':
        return {
          ...base,
          scripts: {
            ...base.scripts,
            start: 'react-scripts start',
            build: 'react-scripts build',
            dev: 'react-scripts start'
          },
          dependencies: {
            'react': '^18.2.0',
            'react-dom': '^18.2.0'
          },
          devDependencies: {
            'react-scripts': '^5.0.1',
            '@types/react': '^18.2.0',
            '@types/react-dom': '^18.2.0',
            'typescript': '^5.0.0'
          }
        };
      
      case 'api':
        return {
          ...base,
          dependencies: {
            'express': '^4.18.0',
            'cors': '^2.8.5',
            'helmet': '^7.0.0'
          },
          devDependencies: {
            'nodemon': '^3.0.0',
            '@types/express': '^4.17.0',
            '@types/cors': '^2.8.0',
            'typescript': '^5.0.0',
            'jest': '^29.0.0'
          }
        };
      
      default:
        return base;
    }
  }

  private generateReadme(description: string, projectType: string): string {
    return `# ${description}

## Description
${description}

## Project Type
${projectType}

## Setup
\`\`\`bash
npm install
npm run dev
\`\`\`

## Architecture
This project follows modern best practices with a clean architecture pattern.

## Development
- Run \`npm run dev\` for development
- Run \`npm test\` for testing
- Run \`npm run build\` for production build

## Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

Generated by AI Agent Squad 🤖
`;
  }

  private getTemplateContent(item: StructureItem): string {
    switch (item.template) {
      case 'main_entry':
        return `// Main entry point
console.log('Application starting...');

export default function main() {
  // Application logic here
}

if (require.main === module) {
  main();
}
`;
      
      case 'gitignore':
        return `node_modules/
dist/
build/
.env
.env.local
.DS_Store
*.log
coverage/
.nyc_output/
`;
      
      default:
        return `// ${item.path}\n// TODO: Implement this file\n`;
    }
  }

  private getFallbackStructure(): DirectoryStructure {
    return {
      items: [
        { type: 'directory', path: 'src' },
        { type: 'directory', path: 'tests' },
        { type: 'directory', path: 'docs' },
        { type: 'file', path: 'src/index.ts', template: 'main_entry' },
        { type: 'file', path: '.gitignore', template: 'gitignore' }
      ]
    };
  }

  private createAnalysisDocument(plan: ProjectPlan, description: string): string {
    return `# Architecture Analysis

## Project Description
${description}

## Recommended Architecture

### Technology Stack
- **Type**: ${plan.type}
- **Language**: ${plan.language}
- **Framework**: ${plan.framework || 'None specified'}

### Components
${plan.components.map((comp, index) => 
  `${index + 1}. **${comp.name}**: ${comp.description}`
).join('\n')}

### Implementation Steps
${plan.nextSteps.map((step, index) => 
  `${index + 1}. ${step}`
).join('\n')}

---
*Generated by Architect Agent on ${new Date().toISOString()}*
`;
  }
}

// Supporting interfaces
interface ProjectPlan {
  type: string;
  language: string;
  framework: string;
  components: ProjectComponent[];
  nextSteps: string[];
}

interface ProjectComponent {
  name: string;
  description: string;
  type: 'module' | 'service' | 'component' | 'utility';
}

interface StructureItem {
  type: 'file' | 'directory';
  path: string;
  template?: string;
  content?: string;
}

interface DirectoryStructure {
  items: StructureItem[];
}