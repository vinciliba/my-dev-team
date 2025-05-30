/**
 * VS Code Extension Entry Point
 * AI Development Team Extension - Main extension file
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectOrchestrator, OrchestratorConfig } from './orchestrator/ProjectOrchestrator';
import { OllamaService } from './services/OllamaService';
import { FileService } from './services/FileService';
import { GitService } from './services/GitService';
import { Logger, createCombinedLogger } from './utils/logger';
import { formatDuration, formatBytes } from './utils/helpers';

// Extension globals
let orchestrator: ProjectOrchestrator | null = null;
let ollamaService: OllamaService | null = null;
let logger: Logger;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let aiAgentTreeProvider: AIAgentTreeProvider;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('AI Development Team extension is activating...');
    
    try {
        // Initialize logging
        const logPath = path.join(context.extensionPath, 'logs', 'extension.log');
        logger = createCombinedLogger('AIDevTeam', logPath, 'info');
        logger.info('Extension activation started');
        
        // Create output channel
        outputChannel = vscode.window.createOutputChannel('AI Dev Team');
        outputChannel.show(true);
        outputChannel.appendLine('🤖 AI Development Team Extension Starting...');
        
        // Initialize status bar
        setupStatusBar(context);
        
        // Initialize services
        await initializeServices(context);
        
        // Register commands
        registerCommands(context);
        
        // Setup UI components
        setupUIComponents(context);
        
        // Setup event handlers
        setupEventHandlers(context);
        
        // Show welcome message
        showWelcomeMessage();
        
        logger.info('Extension activated successfully');
        outputChannel.appendLine('✅ AI Development Team Extension Ready!');
        
    } catch (error) {
        const errorMessage = `Failed to activate extension: ${error}`;
        logger?.error(errorMessage, error);
        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
    logger?.info('Extension deactivation started');
    outputChannel?.appendLine('🔄 Shutting down AI Development Team...');
    
    try {
        // Cleanup services
        if (orchestrator) {
            await orchestrator.stop();
            orchestrator = null;
        }
        
        if (ollamaService) {
            await ollamaService.shutdown();
            ollamaService = null;
        }
        
        // Cleanup UI
        if (statusBarItem) {
            statusBarItem.dispose();
        }
        
        if (outputChannel) {
            outputChannel.appendLine('✅ AI Development Team Extension Stopped');
            outputChannel.dispose();
        }
        
        logger?.info('Extension deactivated successfully');
        await logger?.shutdown();
        
    } catch (error) {
        console.error('Error during extension deactivation:', error);
    }
}

/**
 * Initialize all services
 */
async function initializeServices(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        throw new Error('No workspace folder open. Please open a folder to use AI Development Team.');
    }
    
    outputChannel.appendLine(`📁 Workspace: ${workspaceRoot}`);
    
    // Initialize Ollama Service
    outputChannel.appendLine('🧠 Initializing Ollama Service...');
    ollamaService = new OllamaService({
        baseUrl: getConfiguration('ollama.baseUrl', 'http://localhost:11434'),
        defaultModel: getConfiguration('ollama.defaultModel', 'codellama:13b'),
        timeout: getConfiguration('ollama.timeout', 120000)
    });
    
    try {
        await ollamaService.initialize();
        outputChannel.appendLine('✅ Ollama Service initialized');
    } catch (error) {
        outputChannel.appendLine(`❌ Ollama Service failed: ${error}`);
        throw error;
    }
    
    // Initialize Project Orchestrator
    outputChannel.appendLine('🎯 Initializing Project Orchestrator...');
    const orchestratorConfig: OrchestratorConfig = {
        workspaceRoot,
        maxConcurrentTasks: getConfiguration('orchestrator.maxTasks', 10),
        taskTimeout: getConfiguration('orchestrator.taskTimeout', 300000),
        autoAssignTasks: getConfiguration('orchestrator.autoAssign', true),
        enableFileWatching: getConfiguration('orchestrator.fileWatching', true),
        enableContinuousAnalysis: getConfiguration('orchestrator.analysis', true),
        agentHealthCheckInterval: 30000,
        taskPrioritizationStrategy: getConfiguration('orchestrator.strategy', 'smart')
    };
    
    orchestrator = new ProjectOrchestrator(orchestratorConfig);
    
    try {
        await orchestrator.initialize();
        await orchestrator.start();
        outputChannel.appendLine('✅ Project Orchestrator initialized');
    } catch (error) {
        outputChannel.appendLine(`❌ Project Orchestrator failed: ${error}`);
        throw error;
    }
    
    // Register default AI agents
    await registerDefaultAgents();
    
    updateStatusBar('ready', 'AI Dev Team Ready');
}

/**
 * Register default AI agents
 */
async function registerDefaultAgents(): Promise<void> {
    if (!orchestrator || !ollamaService) return;
    
    outputChannel.appendLine('👥 Registering AI agents...');
    
    const agents = [
        {
            id: 'senior-developer',
            name: 'Senior Developer',
            type: 'developer' as const,
            capabilities: ['typescript', 'react', 'nodejs', 'testing']
        },
        {
            id: 'code-reviewer',
            name: 'Code Reviewer', 
            type: 'reviewer' as const,
            capabilities: ['code-review', 'security', 'performance']
        },
        {
            id: 'project-analyst',
            name: 'Project Analyst',
            type: 'analyst' as const,
            capabilities: ['analysis', 'planning', 'strategy']
        },
        {
            id: 'documentation-writer',
            name: 'Documentation Writer',
            type: 'documentation' as const,
            capabilities: ['documentation', 'technical-writing']
        }
    ];
    
    for (const agentConfig of agents) {
        try {
            orchestrator.registerAgent({
                id: agentConfig.id,
                name: agentConfig.name,
                type: agentConfig.type,
                status: 'online',
                capabilities: agentConfig.capabilities,
                metadata: {}
            }, agentConfig.capabilities.map(cap => ({
                name: cap,
                level: 'advanced' as const,
                tags: [cap],
                estimatedSpeed: 1.5,
                successRate: 0.9
            })));
            
            outputChannel.appendLine(`  ✅ ${agentConfig.name} registered`);
        } catch (error) {
            outputChannel.appendLine(`  ❌ Failed to register ${agentConfig.name}: ${error}`);
        }
    }
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
        // AI Agent Commands
        {
            command: 'aiDevTeam.generateCode',
            callback: generateCodeCommand,
            title: 'Generate Code with AI'
        },
        {
            command: 'aiDevTeam.reviewCode',
            callback: reviewCodeCommand,
            title: 'Review Code with AI'
        },
        {
            command: 'aiDevTeam.refactorCode',
            callback: refactorCodeCommand,
            title: 'Refactor Code with AI'
        },
        {
            command: 'aiDevTeam.generateDocumentation',
            callback: generateDocumentationCommand,
            title: 'Generate Documentation'
        },
        {
            command: 'aiDevTeam.analyzeProject',
            callback: analyzeProjectCommand,
            title: 'Analyze Project Structure'
        },
        
        // Task Management Commands
        {
            command: 'aiDevTeam.createTask',
            callback: createTaskCommand,
            title: 'Create AI Task'
        },
        {
            command: 'aiDevTeam.showTasks',
            callback: showTasksCommand,
            title: 'Show Active Tasks'
        },
        {
            command: 'aiDevTeam.showAgents',
            callback: showAgentsCommand,
            title: 'Show AI Agents'
        },
        
        // Service Commands
        {
            command: 'aiDevTeam.showStatus',
            callback: showStatusCommand,
            title: 'Show System Status'
        },
        {
            command: 'aiDevTeam.restartServices',
            callback: restartServicesCommand,
            title: 'Restart AI Services'
        },
        {
            command: 'aiDevTeam.openLogs',
            callback: openLogsCommand,
            title: 'Open Extension Logs'
        }
    ];
    
    for (const cmd of commands) {
        const disposable = vscode.commands.registerCommand(cmd.command, cmd.callback);
        context.subscriptions.push(disposable);
    }
    
    logger.info(`Registered ${commands.length} commands`);
}

/**
 * Setup UI components
 */
function setupUIComponents(context: vscode.ExtensionContext): void {
    // AI Agents Tree View
    aiAgentTreeProvider = new AIAgentTreeProvider();
    const treeView = vscode.window.createTreeView('aiDevTeamAgents', {
        treeDataProvider: aiAgentTreeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    
    // Refresh tree view when agents change
    if (orchestrator) {
        orchestrator.on('agent-registered', () => aiAgentTreeProvider.refresh());
        orchestrator.on('agent-unregistered', () => aiAgentTreeProvider.refresh());
        orchestrator.on('task-assigned', () => aiAgentTreeProvider.refresh());
        orchestrator.on('task-completed', () => aiAgentTreeProvider.refresh());
    }
}

/**
 * Setup event handlers
 */
function setupEventHandlers(context: vscode.ExtensionContext): void {
    // File save event - trigger code review
    const onSave = vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (getConfiguration('autoReview.onSave', false)) {
            await reviewCodeCommand(document.uri);
        }
    });
    context.subscriptions.push(onSave);
    
    // Configuration change event
    const onConfigChange = vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('aiDevTeam')) {
            outputChannel.appendLine('🔄 Configuration changed, restarting services...');
            await restartServicesCommand();
        }
    });
    context.subscriptions.push(onConfigChange);
}

/**
 * Setup status bar
 */
function setupStatusBar(context: vscode.ExtensionContext): void {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'aiDevTeam.showStatus';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    
    updateStatusBar('initializing', 'AI Dev Team Starting...');
}

/**
 * Update status bar
 */
function updateStatusBar(status: 'initializing' | 'ready' | 'working' | 'error', message?: string): void {
    const icons = {
        initializing: '$(loading~spin)',
        ready: '$(robot)',
        working: '$(loading~spin)',
        error: '$(error)'
    };
    
    const colors = {
        initializing: undefined,
        ready: undefined,
        working: new vscode.ThemeColor('statusBarItem.prominentBackground'),
        error: new vscode.ThemeColor('statusBarItem.errorBackground')
    };
    
    statusBarItem.text = `${icons[status]} ${message || 'AI Dev Team'}`;
    statusBarItem.backgroundColor = colors[status];
}

// Command Implementations

async function generateCodeCommand(uri?: vscode.Uri): Promise<void> {
    if (!ollamaService) {
        vscode.window.showErrorMessage('AI services not initialized');
        return;
    }
    
    const prompt = await vscode.window.showInputBox({
        prompt: 'What code would you like to generate?',
        placeHolder: 'e.g., Create a React component for user authentication'
    });
    
    if (!prompt) return;
    
    const language = await vscode.window.showQuickPick(
        ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
        { placeHolder: 'Select programming language' }
    );
    
    if (!language) return;
    
    try {
        updateStatusBar('working', 'Generating code...');
        
        const code = await ollamaService.generateCode(prompt, language, {
            fileName: uri ? path.basename(uri.fsPath) : undefined
        });
        
        // Create new document with generated code
        const document = await vscode.workspace.openTextDocument({
            content: code,
            language: language
        });
        
        await vscode.window.showTextDocument(document);
        
        updateStatusBar('ready', 'AI Dev Team Ready');
        vscode.window.showInformationMessage('Code generated successfully!');
        
    } catch (error) {
        updateStatusBar('error', 'Generation failed');
        vscode.window.showErrorMessage(`Code generation failed: ${error}`);
        logger.error('Code generation failed', error);
    }
}

async function reviewCodeCommand(uri?: vscode.Uri): Promise<void> {
    if (!ollamaService) {
        vscode.window.showErrorMessage('AI services not initialized');
        return;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor && !uri) {
        vscode.window.showWarningMessage('No file selected for review');
        return;
    }
    
    const document = uri ? await vscode.workspace.openTextDocument(uri) : editor!.document;
    const code = document.getText();
    
    if (!code.trim()) {
        vscode.window.showWarningMessage('No code to review');
        return;
    }
    
    try {
        updateStatusBar('working', 'Reviewing code...');
        
        const review = await ollamaService.reviewCode(code, document.languageId);
        
        // Show review results
        const panel = vscode.window.createWebviewPanel(
            'codeReview',
            'AI Code Review',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );
        
        panel.webview.html = generateCodeReviewHTML(review, document.fileName);
        
        updateStatusBar('ready', 'AI Dev Team Ready');
        
    } catch (error) {
        updateStatusBar('error', 'Review failed');
        vscode.window.showErrorMessage(`Code review failed: ${error}`);
        logger.error('Code review failed', error);
    }
}

async function refactorCodeCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }
    
    const selection = editor.selection;
    const code = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    
    const refactorType = await vscode.window.showQuickPick([
        'Extract function',
        'Optimize performance',
        'Improve readability',
        'Add error handling',
        'Add type safety'
    ], { placeHolder: 'Select refactoring type' });
    
    if (!refactorType || !ollamaService) return;
    
    try {
        updateStatusBar('working', 'Refactoring code...');
        
        const prompt = `Refactor this ${editor.document.languageId} code to ${refactorType.toLowerCase()}:\n\n${code}`;
        const refactoredCode = await ollamaService.generateCode(prompt, editor.document.languageId);
        
        // Replace selection or entire document
        await editor.edit(editBuilder => {
            const range = selection.isEmpty ? 
                new vscode.Range(0, 0, editor.document.lineCount, 0) : 
                selection;
            editBuilder.replace(range, refactoredCode);
        });
        
        updateStatusBar('ready', 'AI Dev Team Ready');
        vscode.window.showInformationMessage('Code refactored successfully!');
        
    } catch (error) {
        updateStatusBar('error', 'Refactoring failed');
        vscode.window.showErrorMessage(`Refactoring failed: ${error}`);
        logger.error('Code refactoring failed', error);
    }
}

async function generateDocumentationCommand(): Promise<void> {
    if (!ollamaService) {
        vscode.window.showErrorMessage('AI services not initialized');
        return;
    }
    
    const response = await ollamaService.askAgent(
        'documentation-writer',
        'Generate comprehensive documentation for this project',
        {
            projectStructure: orchestrator?.getProjectStatus().goal,
            workspace: getWorkspaceRoot()
        }
    );
    
    // Create documentation file
    const uri = vscode.Uri.file(path.join(getWorkspaceRoot()!, 'AI_GENERATED_DOCS.md'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(response));
    
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    
    vscode.window.showInformationMessage('Documentation generated!');
}

async function analyzeProjectCommand(): Promise<void> {
    if (!orchestrator) {
        vscode.window.showErrorMessage('Project orchestrator not initialized');
        return;
    }
    
    try {
        updateStatusBar('working', 'Analyzing project...');
        
        const analysis = await orchestrator.analyzeWorkspace(true);
        
        // Show analysis results
        const panel = vscode.window.createWebviewPanel(
            'projectAnalysis',
            'Project Analysis',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        
        panel.webview.html = generateProjectAnalysisHTML(analysis);
        
        updateStatusBar('ready', 'AI Dev Team Ready');
        
    } catch (error) {
        updateStatusBar('error', 'Analysis failed');
        vscode.window.showErrorMessage(`Project analysis failed: ${error}`);
        logger.error('Project analysis failed', error);
    }
}

async function createTaskCommand(): Promise<void> {
    if (!orchestrator) {
        vscode.window.showErrorMessage('Orchestrator not initialized');
        return;
    }
    
    const title = await vscode.window.showInputBox({
        prompt: 'Task title',
        placeHolder: 'e.g., Implement user authentication'
    });
    
    if (!title) return;
    
    const description = await vscode.window.showInputBox({
        prompt: 'Task description',
        placeHolder: 'Detailed description of what needs to be done'
    });
    
    const priority = await vscode.window.showQuickPick(
        ['low', 'normal', 'high', 'urgent'],
        { placeHolder: 'Select priority' }
    );
    
    const type = await vscode.window.showQuickPick(
        ['feature', 'bug-fix', 'refactoring', 'documentation', 'testing'],
        { placeHolder: 'Select task type' }
    );
    
    if (!description || !priority || !type) return;
    
    const taskId = orchestrator.createTask({
        title,
        description,
        type: type as any,
        status: 'pending',
        priority: priority as any
    });
    
    vscode.window.showInformationMessage(`Task created: ${taskId}`);
    aiAgentTreeProvider.refresh();
}

async function showTasksCommand(): Promise<void> {
    if (!orchestrator) return;
    
    const status = orchestrator.getProjectStatus();
    const activeTasks = status.stats.activeTasks;
    const completedTasks = status.stats.completedTasks;
    
    const message = `
Active Tasks: ${activeTasks}
Completed Tasks: ${completedTasks}
Project Progress: ${status.stats.projectProgress.toFixed(1)}%
    `.trim();
    
    vscode.window.showInformationMessage(message);
}

async function showAgentsCommand(): Promise<void> {
    if (!orchestrator) return;
    
    const agents = orchestrator.getAgents();
    const agentList = agents.map(agent => 
        `${agent.name} (${agent.type}) - ${agent.status}`
    ).join('\n');
    
    vscode.window.showInformationMessage(`AI Agents:\n${agentList}`);
}

async function showStatusCommand(): Promise<void> {
    if (!orchestrator || !ollamaService) return;
    
    const projectStatus = orchestrator.getProjectStatus();
    const ollamaStats = await ollamaService.getStats();
    
    const panel = vscode.window.createWebviewPanel(
        'systemStatus',
        'AI Dev Team Status',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );
    
    panel.webview.html = generateStatusHTML(projectStatus, ollamaStats);
}

async function restartServicesCommand(): Promise<void> {
    try {
        outputChannel.appendLine('🔄 Restarting AI services...');
        updateStatusBar('initializing', 'Restarting...');
        
        if (orchestrator) {
            await orchestrator.stop();
            orchestrator = null;
        }
        
        if (ollamaService) {
            await ollamaService.shutdown();
            ollamaService = null;
        }
        
        const context = vscode.extensions.getExtension('your-extension-id')?.exports;
        await initializeServices(context);
        
        updateStatusBar('ready', 'AI Dev Team Ready');
        vscode.window.showInformationMessage('AI services restarted successfully');
        
    } catch (error) {
        updateStatusBar('error', 'Restart failed');
        vscode.window.showErrorMessage(`Failed to restart services: ${error}`);
    }
}

async function openLogsCommand(): Promise<void> {
    const logPath = path.join(vscode.extensions.getExtension('your-extension-id')?.extensionPath || '', 'logs', 'extension.log');
    const uri = vscode.Uri.file(logPath);
    
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
    } catch (error) {
        vscode.window.showErrorMessage(`Could not open logs: ${error}`);
    }
}

// Utility Functions

function getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getConfiguration<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration('aiDevTeam').get(key, defaultValue);
}

function showWelcomeMessage(): void {
    const message = `
🤖 AI Development Team Extension Activated!

Available Models:
• CodeLlama 13B - Code generation & review
• Gemma3 12B - Analysis & planning

Ready to assist with your development workflow!
    `.trim();
    
    vscode.window.showInformationMessage('AI Dev Team Ready!', 'Show Status', 'View Agents')
        .then(selection => {
            if (selection === 'Show Status') {
                showStatusCommand();
            } else if (selection === 'View Agents') {
                showAgentsCommand();
            }
        });
}

// Tree Data Provider for AI Agents
class AIAgentTreeProvider implements vscode.TreeDataProvider<AgentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AgentTreeItem | undefined | null | void> = new vscode.EventEmitter<AgentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AgentTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AgentTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AgentTreeItem): Thenable<AgentTreeItem[]> {
        if (!orchestrator) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Root level - show agent categories
            const agents = orchestrator.getAgents();
            const categories = [...new Set(agents.map(a => a.type))];
            
            return Promise.resolve(categories.map(category => 
                new AgentTreeItem(
                    category.charAt(0).toUpperCase() + category.slice(1),
                    vscode.TreeItemCollapsibleState.Expanded,
                    'category'
                )
            ));
        } else if (element.contextValue === 'category') {
            // Show agents in category
            const agents = orchestrator.getAgents().filter(a => 
                a.type === element.label?.toString().toLowerCase()
            );
            
            return Promise.resolve(agents.map(agent => 
                new AgentTreeItem(
                    `${agent.name} (${agent.status})`,
                    vscode.TreeItemCollapsibleState.None,
                    'agent',
                    agent.status === 'online' ? '$(check)' : '$(x)'
                )
            ));
        }

        return Promise.resolve([]);
    }
}

class AgentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: 'category' | 'agent',
        public readonly iconPath?: string | vscode.ThemeIcon
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        this.contextValue = contextValue;
        if (iconPath) {
            this.iconPath = new vscode.ThemeIcon(iconPath.toString().replace('$(', '').replace(')', ''));
        }
    }
}

// HTML Generation Functions

function generateCodeReviewHTML(review: any, fileName: string): string {
    const issuesList = review.issues.map((issue: any) => `
        <div class="issue ${issue.severity}">
            <h4>${issue.type} - ${issue.severity}</h4>
            <p><strong>Line ${issue.line || 'N/A'}:</strong> ${issue.message}</p>
            <p><em>Suggestion:</em> ${issue.suggestion}</p>
        </div>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .header { border-bottom: 2px solid #ccc; margin-bottom: 20px; }
                .issue { margin: 10px 0; padding: 10px; border-left: 4px solid; }
                .critical { border-color: #d32f2f; background: #ffebee; }
                .high { border-color: #f57c00; background: #fff3e0; }
                .medium { border-color: #fbc02d; background: #fffde7; }
                .low { border-color: #388e3c; background: #e8f5e8; }
                .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>AI Code Review</h1>
                <p><strong>File:</strong> ${fileName}</p>
                <p><strong>Rating:</strong> ${review.rating}/10</p>
            </div>
            
            <div class="summary">
                <h3>Summary</h3>
                <p>${review.summary}</p>
            </div>
            
            <h3>Issues Found (${review.issues.length})</h3>
            ${issuesList}
            
            <h3>Suggestions</h3>
            <ul>
                ${review.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
        </body>
        </html>
    `;
}

function generateProjectAnalysisHTML(analysis: any): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .metric { display: inline-block; margin: 10px; padding: 15px; background: #f5f5f5; border-radius: 5px; }
                .section { margin: 20px 0; }
            </style>
        </head>
        <body>
            <h1>Project Analysis</h1>
            
            <div class="section">
                <h2>Code Metrics</h2>
                <div class="metric">
                    <strong>Lines of Code:</strong> ${analysis.codeMetrics.linesOfCode}
                </div>
                <div class="metric">
                    <strong>Complexity:</strong> ${analysis.codeMetrics.cyclomaticComplexity}
                </div>
                <div class="metric">
                    <strong>Maintainability:</strong> ${analysis.codeMetrics.maintainabilityIndex}
                </div>
            </div>
            
            <div class="section">
                <h2>Issues Summary</h2>
                <p>Security Issues: ${analysis.securityIssues.length}</p>
                <p>Performance Issues: ${analysis.performanceIssues.length}</p>
                <p>Quality Issues: ${analysis.qualityIssues.length}</p>
            </div>
            
            <div class="section">
                <h2>Recommendations</h2>
                <ul>
                    ${analysis.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
                </ul>
            </div>
        </body>
        </html>
    `;
}

function generateStatusHTML(projectStatus: any, ollamaStats: any): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    padding: 20px; 
                    background: #1e1e1e; 
                    color: #d4d4d4; 
                    margin: 0;
                }
                .container { max-width: 1200px; margin: 0 auto; }
                .header { 
                    text-align: center; 
                    margin-bottom: 30px; 
                    padding-bottom: 20px; 
                    border-bottom: 2px solid #007acc; 
                }
                .status-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
                    gap: 20px; 
                    margin-bottom: 30px; 
                }
                .status-card { 
                    background: #252526; 
                    border: 1px solid #3c3c3c; 
                    border-radius: 8px; 
                    padding: 20px; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3); 
                }
                .status-card h3 { 
                    margin-top: 0; 
                    color: #007acc; 
                    border-bottom: 1px solid #3c3c3c; 
                    padding-bottom: 10px; 
                }
                .metric { 
                    display: flex; 
                    justify-content: space-between; 
                    margin: 10px 0; 
                    padding: 8px 0; 
                    border-bottom: 1px dotted #3c3c3c; 
                }
                .metric:last-child { border-bottom: none; }
                .metric-value { 
                    font-weight: bold; 
                    color: #4ec9b0; 
                }
                .status-indicator { 
                    display: inline-block; 
                    width: 12px; 
                    height: 12px; 
                    border-radius: 50%; 
                    margin-right: 8px; 
                }
                .status-online { background: #4caf50; }
                .status-offline { background: #f44336; }
                .status-busy { background: #ff9800; }
                .progress-bar { 
                    width: 100%; 
                    height: 20px; 
                    background: #3c3c3c; 
                    border-radius: 10px; 
                    overflow: hidden; 
                    margin: 10px 0; 
                }
                .progress-fill { 
                    height: 100%; 
                    background: linear-gradient(90deg, #007acc, #4ec9b0); 
                    transition: width 0.3s ease; 
                }
                .agent-list { 
                    list-style: none; 
                    padding: 0; 
                    margin: 0; 
                }
                .agent-item { 
                    display: flex; 
                    align-items: center; 
                    padding: 8px 0; 
                    border-bottom: 1px solid #3c3c3c; 
                }
                .agent-item:last-child { border-bottom: none; }
                .refresh-btn { 
                    background: #007acc; 
                    color: white; 
                    border: none; 
                    padding: 10px 20px; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    margin: 10px 5px; 
                }
                .refresh-btn:hover { background: #005a9e; }
                .timestamp { 
                    text-align: center; 
                    color: #888; 
                    margin-top: 20px; 
                    font-size: 0.9em; 
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🤖 AI Development Team Status</h1>
                    <p>Real-time system monitoring and agent status</p>
                </div>
                
                <div class="status-grid">
                    <!-- Project Status Card -->
                    <div class="status-card">
                        <h3>📊 Project Overview</h3>
                        <div class="metric">
                            <span>Project Goal:</span>
                            <span class="metric-value">${projectStatus.goal?.title || 'No goal set'}</span>
                        </div>
                        <div class="metric">
                            <span>Progress:</span>
                            <span class="metric-value">${projectStatus.stats.projectProgress.toFixed(1)}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${projectStatus.stats.projectProgress}%"></div>
                        </div>
                        <div class="metric">
                            <span>Active Tasks:</span>
                            <span class="metric-value">${projectStatus.stats.activeTasks}</span>
                        </div>
                        <div class="metric">
                            <span>Completed Tasks:</span>
                            <span class="metric-value">${projectStatus.stats.completedTasks}</span>
                        </div>
                        <div class="metric">
                            <span>Failed Tasks:</span>
                            <span class="metric-value">${projectStatus.stats.failedTasks}</span>
                        </div>
                    </div>
                    
                    <!-- Ollama Service Status Card -->
                    <div class="status-card">
                        <h3>🧠 Ollama Service</h3>
                        <div class="metric">
                            <span>Status:</span>
                            <span class="metric-value">
                                <span class="status-indicator ${ollamaStats.isRunning ? 'status-online' : 'status-offline'}"></span>
                                ${ollamaStats.isRunning ? 'Online' : 'Offline'}
                            </span>
                        </div>
                        <div class="metric">
                            <span>Version:</span>
                            <span class="metric-value">${ollamaStats.version}</span>
                        </div>
                        <div class="metric">
                            <span>Loaded Models:</span>
                            <span class="metric-value">${ollamaStats.loadedModels.length}/${ollamaStats.totalModels}</span>
                        </div>
                        <div class="metric">
                            <span>Memory Usage:</span>
                            <span class="metric-value">${formatBytes(ollamaStats.memoryUsage || 0)}</span>
                        </div>
                        <div class="metric">
                            <span>System:</span>
                            <span class="metric-value">${ollamaStats.systemInfo.platform} (${ollamaStats.systemInfo.cpuCores} cores)</span>
                        </div>
                    </div>
                    
                    <!-- Active Agents Card -->
                    <div class="status-card">
                        <h3>👥 AI Agents</h3>
                        <ul class="agent-list">
                            ${orchestrator?.getAgents().map(agent => `
                                <li class="agent-item">
                                    <span class="status-indicator status-${agent.status === 'online' ? 'online' : agent.status === 'busy' ? 'busy' : 'offline'}"></span>
                                    <div>
                                        <strong>${agent.name}</strong><br>
                                        <small>${agent.type} - ${agent.capabilities.join(', ')}</small>
                                    </div>
                                </li>
                            `).join('') || '<li>No agents registered</li>'}
                        </ul>
                    </div>
                    
                    <!-- System Performance Card -->
                    <div class="status-card">
                        <h3>⚡ Performance</h3>
                        <div class="metric">
                            <span>Avg Task Duration:</span>
                            <span class="metric-value">${formatDuration(projectStatus.stats.averageTaskDuration || 0)}</span>
                        </div>
                        <div class="metric">
                            <span>Agent Utilization:</span>
                            <span class="metric-value">${Object.values(projectStatus.stats.agentUtilization).length > 0 ? 
                                (Object.values(projectStatus.stats.agentUtilization).reduce((a: any, b: any) => a + b, 0) / 
                                Object.values(projectStatus.stats.agentUtilization).length).toFixed(1) + '%' : '0%'}</span>
                        </div>
                        <div class="metric">
                            <span>Est. Completion:</span>
                            <span class="metric-value">${projectStatus.stats.estimatedCompletion ? 
                                new Date(projectStatus.stats.estimatedCompletion).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        <div class="metric">
                            <span>Total Memory:</span>
                            <span class="metric-value">${formatBytes(ollamaStats.systemInfo.totalMemory || 0)}</span>
                        </div>
                        <div class="metric">
                            <span>Available Memory:</span>
                            <span class="metric-value">${formatBytes(ollamaStats.systemInfo.availableMemory || 0)}</span>
                        </div>
                    </div>
                    
                    <!-- Recent Activity Card -->
                    <div class="status-card">
                        <h3>📈 Recent Activity</h3>
                        <div class="metric">
                            <span>Workflow Phases:</span>
                            <span class="metric-value">${projectStatus.phases.length}</span>
                        </div>
                        <div class="metric">
                            <span>Completed Phases:</span>
                            <span class="metric-value">${projectStatus.phases.filter((p: any) => p.status === 'completed').length}</span>
                        </div>
                        <div class="metric">
                            <span>Active Phase:</span>
                            <span class="metric-value">${projectStatus.phases.find((p: any) => p.status === 'in-progress')?.name || 'None'}</span>
                        </div>
                        <div class="metric">
                            <span>Last Update:</span>
                            <span class="metric-value">${projectStatus.stats.lastUpdated ? 
                                new Date(projectStatus.stats.lastUpdated).toLocaleTimeString() : 'Never'}</span>
                        </div>
                    </div>
                    
                    <!-- Models Status Card -->
                    <div class="status-card">
                        <h3>🎯 Available Models</h3>
                        ${ollamaStats.loadedModels.length > 0 ? 
                            ollamaStats.loadedModels.map((model: string) => `
                                <div class="metric">
                                    <span>${model}:</span>
                                    <span class="metric-value">
                                        <span class="status-indicator status-online"></span>
                                        Loaded
                                    </span>
                                </div>
                            `).join('') :
                            '<div class="metric"><span>No models loaded</span></div>'
                        }
                        <div class="metric">
                            <span>CodeLlama 13B:</span>
                            <span class="metric-value">Code Generation</span>
                        </div>
                        <div class="metric">
                            <span>Gemma3 12B:</span>
                            <span class="metric-value">Analysis & Planning</span>
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="text-align: center; margin: 30px 0;">
                    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Status</button>
                    <button class="refresh-btn" onclick="vscode.postMessage({command: 'restartServices'})">🔄 Restart Services</button>
                    <button class="refresh-btn" onclick="vscode.postMessage({command: 'openLogs'})">📋 View Logs</button>
                </div>
                
                <div class="timestamp">
                    Last updated: ${new Date().toLocaleString()}
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // Auto-refresh every 30 seconds
                setInterval(() => {
                    location.reload();
                }, 30000);
                
                // Handle button clicks
                document.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON' && e.target.onclick) {
                        e.target.onclick();
                    }
                });
            </script>
        </body>
        </html>
    `;
}