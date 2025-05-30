/**
 * Ollama Service
 * Integration with Ollama for running local LLMs in AI agent development workflows
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface OllamaConfig {
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultModel?: string;
  apiVersion?: string;
  keepAlive?: string; // Duration to keep model loaded (e.g., "5m", "10s", "-1" for always)
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: Date;
  details?: OllamaModelDetails;
  digest?: string;
  format?: string;
  families?: string[];
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaModelDetails {
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
  license?: string;
  modelfile?: string;
  template?: string;
  system?: string;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  suffix?: string;
  images?: string[]; // Base64 encoded images
  format?: 'json' | string; // Response format
  options?: GenerateOptions;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  keep_alive?: string;
}

export interface GenerateOptions {
  // Model parameters
  num_keep?: number;
  seed?: number;
  num_predict?: number;
  top_k?: number;
  top_p?: number;
  tfs_z?: number;
  typical_p?: number;
  repeat_last_n?: number;
  temperature?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  penalize_newline?: boolean;
  stop?: string[];
  numa?: boolean;
  num_ctx?: number;
  num_batch?: number;
  num_gqa?: number;
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  f16_kv?: boolean;
  logits_all?: boolean;
  vocab_only?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  embedding_only?: boolean;
  rope_frequency_base?: number;
  rope_frequency_scale?: number;
  num_thread?: number;
}

export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  format?: 'json' | string;
  options?: GenerateOptions;
  stream?: boolean;
  keep_alive?: string;
}

export interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface EmbeddingRequest {
  model: string;
  prompt: string;
  options?: GenerateOptions;
  keep_alive?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  specializations: string[];
  context: ChatMessage[];
  performance: AgentPerformance;
}

export interface AgentPerformance {
  totalRequests: number;
  averageResponseTime: number;
  successRate: number;
  lastUsed: Date;
  tokensGenerated: number;
  errors: number;
}

export interface ModelBenchmark {
  model: string;
  timestamp: Date;
  metrics: {
    averageResponseTime: number;
    tokensPerSecond: number;
    memoryUsage: number;
    cpuUsage: number;
    accuracy?: number;
    coherence?: number;
  };
  testCases: BenchmarkTestCase[];
}

export interface BenchmarkTestCase {
  name: string;
  prompt: string;
  expectedPattern?: RegExp;
  category: 'code' | 'reasoning' | 'creativity' | 'analysis' | 'translation';
  responseTime: number;
  success: boolean;
  response: string;
}

export interface OllamaStats {
  isRunning: boolean;
  version: string;
  loadedModels: string[];
  totalModels: number;
  memoryUsage: number;
  modelStats: Record<string, ModelStats>;
  systemInfo: SystemInfo;
}

export interface ModelStats {
  name: string;
  loaded: boolean;
  lastUsed?: Date;
  requestCount: number;
  averageResponseTime: number;
  memoryFootprint?: number;
}

export interface SystemInfo {
  gpu: boolean;
  gpuMemory?: number;
  totalMemory: number;
  availableMemory: number;
  cpuCores: number;
  platform: string;
}

/**
 * Ollama service for local LLM integration
 */
export class OllamaService extends EventEmitter {
  private logger: Logger;
  private config: OllamaConfig;
  private agentProfiles = new Map<string, AgentProfile>();
  private modelBenchmarks = new Map<string, ModelBenchmark>();
  private requestQueue: RequestQueueItem[] = [];
  private isProcessingQueue = false;
  private modelLoadState = new Map<string, boolean>();

  // Known model specializations
  private readonly modelSpecializations = {
    'codellama:13b': {
      strengths: ['code_generation', 'code_review', 'debugging', 'refactoring', 'documentation'],
      languages: ['python', 'javascript', 'typescript', 'java', 'cpp', 'rust', 'go'],
      maxTokens: 4096,
      temperature: 0.1, // Lower for more deterministic code
      description: 'Specialized for code generation and programming tasks'
    },
    'gemma3:12b': {
      strengths: ['reasoning', 'analysis', 'planning', 'communication', 'general_tasks'],
      languages: ['natural_language'],
      maxTokens: 8192,
      temperature: 0.7, // Higher for more creative responses
      description: 'General-purpose model excellent for reasoning and analysis'
    }
  };

  constructor(config: OllamaConfig = {}) {
    super();
    this.config = {
      baseUrl: 'http://localhost:11434',
      timeout: 120000, // 2 minutes
      maxRetries: 3,
      defaultModel: 'codellama:13b',
      apiVersion: 'v1',
      keepAlive: '5m',
      logLevel: 'info',
      ...config
    };
    
    this.logger = new Logger('OllamaService');
    this.logger.info('Ollama Service initialized');
  }

  /**
   * Initialize the service and check Ollama status
   */
  async initialize(): Promise<void> {
    try {
      await this.checkOllamaStatus();
      await this.loadAvailableModels();
      await this.initializeDefaultAgents();
      
      this.logger.info('Ollama Service initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Ollama Service:', error);
      throw error;
    }
  }

  /**
   * Check if Ollama is running
   */
  async checkOllamaStatus(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/version`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        this.logger.info(`Ollama is running, version: ${data.version}`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Ollama is not running or not accessible:', error);
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.makeRequest('/api/tags', 'GET');
      const data = await response.json() as any;
      
      const models: OllamaModel[] = data.models.map((model: any) => ({
        name: model.name,
        id: model.digest,
        size: this.formatBytes(model.size),
        modified: new Date(model.modified_at),
        details: model.details,
        digest: model.digest,
        format: model.details?.format,
        families: model.details?.families,
        parameterSize: model.details?.parameter_size,
        quantizationLevel: model.details?.quantization_level
      }));
      
      this.logger.info(`Found ${models.length} available models`);
      return models;
    } catch (error) {
      this.logger.error('Failed to list models:', error);
      throw error;
    }
  }

  /**
   * Generate text using a model
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    try {
      this.logger.debug(`Generating with model ${request.model}`);
      
      // Ensure model is loaded
      await this.ensureModelLoaded(request.model);
      
      const response = await this.makeRequest('/api/generate', 'POST', {
        ...request,
        keep_alive: request.keep_alive || this.config.keepAlive
      });
      
      const result = await response.json() as GenerateResponse;
      
      // Update performance metrics
      this.updateModelPerformance(request.model, result);
      
      this.logger.debug(`Generated ${result.eval_count || 0} tokens in ${result.eval_duration || 0}ms`);
      this.emit('generation-completed', { request, response: result });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to generate with model ${request.model}:`, error);
      this.emit('generation-failed', { request, error });
      throw error;
    }
  }

  /**
   * Chat with a model
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      this.logger.debug(`Chat with model ${request.model}`);
      
      // Ensure model is loaded
      await this.ensureModelLoaded(request.model);
      
      const response = await this.makeRequest('/api/chat', 'POST', {
        ...request,
        keep_alive: request.keep_alive || this.config.keepAlive
      });
      
      const result = await response.json() as ChatResponse;
      
      // Update performance metrics
      this.updateModelPerformance(request.model, result);
      
      this.logger.debug(`Chat completed: ${result.eval_count || 0} tokens in ${result.eval_duration || 0}ms`);
      this.emit('chat-completed', { request, response: result });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to chat with model ${request.model}:`, error);
      this.emit('chat-failed', { request, error });
      throw error;
    }
  }

  /**
   * Generate embeddings
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      this.logger.debug(`Generating embedding with model ${request.model}`);
      
      const response = await this.makeRequest('/api/embeddings', 'POST', {
        ...request,
        keep_alive: request.keep_alive || this.config.keepAlive
      });
      
      const result = await response.json() as EmbeddingResponse;
      
      this.logger.debug(`Generated embedding with ${result.embedding.length} dimensions`);
      this.emit('embedding-generated', { request, response: result });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to generate embedding with model ${request.model}:`, error);
      throw error;
    }
  }

  /**
   * Create specialized AI agent
   */
  createAgent(config: {
    id: string;
    name: string;
    role: string;
    model?: string;
    systemPrompt: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    specializations?: string[];
  }): AgentProfile {
    const model = config.model || this.selectBestModelForRole(config.role);
    const modelSpec = this.modelSpecializations[model as keyof typeof this.modelSpecializations];
    
    const agent: AgentProfile = {
      id: config.id,
      name: config.name,
      role: config.role,
      model,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature ?? modelSpec?.temperature ?? 0.7,
      topP: config.topP ?? 0.9,
      maxTokens: config.maxTokens ?? modelSpec?.maxTokens ?? 4096,
      specializations: config.specializations || modelSpec?.strengths || [],
      context: [],
      performance: {
        totalRequests: 0,
        averageResponseTime: 0,
        successRate: 100,
        lastUsed: new Date(),
        tokensGenerated: 0,
        errors: 0
      }
    };
    
    this.agentProfiles.set(agent.id, agent);
    this.logger.info(`Created AI agent: ${agent.name} (${agent.role}) using ${agent.model}`);
    this.emit('agent-created', agent);
    
    return agent;
  }

  /**
   * Get response from specific agent
   */
  async askAgent(agentId: string, message: string, context?: Record<string, any>): Promise<string> {
    const agent = this.agentProfiles.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    const startTime = Date.now();
    
    try {
      // Prepare messages with system prompt and context
      const messages: ChatMessage[] = [
        { role: 'system', content: agent.systemPrompt },
        ...agent.context.slice(-10), // Keep last 10 messages for context
        { role: 'user', content: message }
      ];
      
      // Add context if provided
      if (context) {
        const contextMessage = `Context: ${JSON.stringify(context, null, 2)}`;
        messages.splice(-1, 0, { role: 'system', content: contextMessage });
      }
      
      const response = await this.chat({
        model: agent.model,
        messages,
        options: {
          temperature: agent.temperature,
          top_p: agent.topP,
          num_predict: agent.maxTokens
        }
      });
      
      const responseTime = Date.now() - startTime;
      const assistantMessage = response.message.content;
      
      // Update agent context
      agent.context.push({ role: 'user', content: message });
      agent.context.push({ role: 'assistant', content: assistantMessage });
      
      // Keep context manageable
      if (agent.context.length > 20) {
        agent.context = agent.context.slice(-20);
      }
      
      // Update performance metrics
      this.updateAgentPerformance(agent, responseTime, true, response.eval_count || 0);
      
      this.logger.debug(`Agent ${agent.name} responded in ${responseTime}ms`);
      this.emit('agent-response', { agentId, message, response: assistantMessage, responseTime });
      
      return assistantMessage;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateAgentPerformance(agent, responseTime, false, 0);
      
      this.logger.error(`Agent ${agent.name} failed to respond:`, error);
      this.emit('agent-error', { agentId, message, error, responseTime });
      
      throw error;
    }
  }

  /**
   * Generate code with CodeLlama
   */
  async generateCode(prompt: string, language: string = 'typescript', context?: {
    fileName?: string;
    existingCode?: string;
    requirements?: string[];
  }): Promise<string> {
    const codePrompt = this.buildCodePrompt(prompt, language, context);
    
    const response = await this.generate({
      model: 'codellama:13b',
      prompt: codePrompt,
      options: {
        temperature: 0.1, // Low temperature for deterministic code
        top_p: 0.9,
        num_predict: 2048,
        stop: ['</code>', 'Human:', 'User:']
      }
    });
    
    // Extract code from response
    const code = this.extractCodeFromResponse(response.response);
    
    this.logger.info(`Generated ${language} code: ${code.length} characters`);
    this.emit('code-generated', { prompt, language, code, context });
    
    return code;
  }

  /**
   * Review code with AI agent
   */
  async reviewCode(code: string, language: string = 'typescript', focusAreas: string[] = []): Promise<{
    issues: CodeIssue[];
    suggestions: string[];
    rating: number; // 1-10
    summary: string;
  }> {
    const reviewPrompt = this.buildCodeReviewPrompt(code, language, focusAreas);
    
    const response = await this.generate({
      model: 'codellama:13b',
      prompt: reviewPrompt,
      format: 'json',
      options: {
        temperature: 0.3,
        top_p: 0.9,
        num_predict: 1024
      }
    });
    
    try {
      const review = JSON.parse(response.response);
      this.logger.info(`Code review completed: ${review.issues?.length || 0} issues found`);
      this.emit('code-reviewed', { code, language, review });
      
      return review;
    } catch (error) {
      this.logger.error('Failed to parse code review response:', error);
      throw new Error('Invalid code review response format');
    }
  }

  /**
   * Analyze project with Gemma3 for high-level reasoning
   */
  async analyzeProject(projectData: {
    structure: any;
    requirements: string[];
    constraints: string[];
    currentStatus: string;
  }): Promise<{
    analysis: string;
    recommendations: string[];
    nextSteps: string[];
    risks: string[];
    timeline: string;
  }> {
    const analysisPrompt = this.buildProjectAnalysisPrompt(projectData);
    
    const response = await this.generate({
      model: 'gemma3:12b',
      prompt: analysisPrompt,
      format: 'json',
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 2048
      }
    });
    
    try {
      const analysis = JSON.parse(response.response);
      this.logger.info('Project analysis completed');
      this.emit('project-analyzed', { projectData, analysis });
      
      return analysis;
    } catch (error) {
      this.logger.error('Failed to parse project analysis response:', error);
      throw new Error('Invalid project analysis response format');
    }
  }

  /**
   * Benchmark model performance
   */
  async benchmarkModel(modelName: string, testCases?: BenchmarkTestCase[]): Promise<ModelBenchmark> {
    this.logger.info(`Starting benchmark for model: ${modelName}`);
    
    const defaultTestCases: BenchmarkTestCase[] = [
      {
        name: 'Simple code generation',
        prompt: 'Write a TypeScript function to calculate factorial',
        category: 'code',
        expectedPattern: /function.*factorial/i,
        responseTime: 0,
        success: false,
        response: ''
      },
      {
        name: 'Code explanation',
        prompt: 'Explain what this code does: const result = arr.reduce((acc, val) => acc + val, 0);',
        category: 'analysis',
        responseTime: 0,
        success: false,
        response: ''
      },
      {
        name: 'Problem solving',
        prompt: 'How would you optimize a slow database query?',
        category: 'reasoning',
        responseTime: 0,
        success: false,
        response: ''
      }
    ];
    
    const cases = testCases || defaultTestCases;
    const results: BenchmarkTestCase[] = [];
    let totalTime = 0;
    let successCount = 0;
    
    for (const testCase of cases) {
      const startTime = Date.now();
      
      try {
        const response = await this.generate({
          model: modelName,
          prompt: testCase.prompt,
          options: { temperature: 0.7, num_predict: 512 }
        });
        
        const responseTime = Date.now() - startTime;
        const success = testCase.expectedPattern ? 
          testCase.expectedPattern.test(response.response) : 
          response.response.length > 10;
        
        results.push({
          ...testCase,
          responseTime,
          success,
          response: response.response
        });
        
        totalTime += responseTime;
        if (success) successCount++;
        
      } catch (error) {
        results.push({
          ...testCase,
          responseTime: Date.now() - startTime,
          success: false,
          response: `Error: ${error}`
        });
      }
    }
    
    const benchmark: ModelBenchmark = {
      model: modelName,
      timestamp: new Date(),
      metrics: {
        averageResponseTime: totalTime / cases.length,
        tokensPerSecond: 0, // Would need to calculate from response data
        memoryUsage: 0, // Would need system monitoring
        cpuUsage: 0, // Would need system monitoring
        accuracy: (successCount / cases.length) * 100
      },
      testCases: results
    };
    
    this.modelBenchmarks.set(modelName, benchmark);
    this.logger.info(`Benchmark completed for ${modelName}: ${benchmark.metrics.accuracy}% accuracy`);
    this.emit('benchmark-completed', benchmark);
    
    return benchmark;
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<OllamaStats> {
    try {
      const models = await this.listModels();
      const version = await this.getOllamaVersion();
      
      return {
        isRunning: await this.checkOllamaStatus(),
        version,
        loadedModels: Array.from(this.modelLoadState.keys()).filter(model => this.modelLoadState.get(model)),
        totalModels: models.length,
        memoryUsage: 0, // Would need system monitoring
        modelStats: this.getModelStats(),
        systemInfo: await this.getSystemInfo()
      };
    } catch (error) {
      this.logger.error('Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Select best model for a given role
   */
  private selectBestModelForRole(role: string): string {
    const codeRoles = ['developer', 'architect', 'reviewer', 'tester'];
    const reasoningRoles = ['analyst', 'coordinator', 'planner', 'documentation'];
    
    if (codeRoles.includes(role.toLowerCase())) {
      return 'codellama:13b';
    } else if (reasoningRoles.includes(role.toLowerCase())) {
      return 'gemma3:12b';
    }
    
    return this.config.defaultModel || 'codellama:13b';
  }

  /**
   * Initialize default AI agents
   */
  private async initializeDefaultAgents(): Promise<void> {
    // Senior Developer Agent (CodeLlama)
    this.createAgent({
      id: 'senior-developer',
      name: 'Senior Developer',
      role: 'developer',
      model: 'codellama:13b',
      systemPrompt: `You are a senior software developer with expertise in TypeScript, React, Node.js, and modern development practices. 
        You write clean, efficient, and well-documented code. You follow best practices for testing, security, and performance.
        Always provide complete, working code solutions with proper error handling and type safety.`,
      temperature: 0.1,
      specializations: ['typescript', 'react', 'nodejs', 'testing', 'architecture']
    });

    // Code Reviewer Agent (CodeLlama)
    this.createAgent({
      id: 'code-reviewer',
      name: 'Code Reviewer',
      role: 'reviewer',
      model: 'codellama:13b',
      systemPrompt: `You are an expert code reviewer focused on code quality, security, performance, and maintainability.
        Analyze code for bugs, vulnerabilities, performance issues, and adherence to best practices.
        Provide constructive feedback with specific suggestions for improvement.`,
      temperature: 0.2,
      specializations: ['code-review', 'security', 'performance', 'best-practices']
    });

    // Project Analyst Agent (Gemma3)
    this.createAgent({
      id: 'project-analyst',
      name: 'Project Analyst',
      role: 'analyst',
      model: 'gemma3:12b',
      systemPrompt: `You are a senior project analyst and technical strategist. You excel at understanding complex requirements,
        analyzing project scope, identifying risks, and creating actionable plans. You provide strategic insights and recommendations
        for project success. Your responses are well-structured, thorough, and focus on practical solutions.`,
      temperature: 0.7,
      specializations: ['analysis', 'planning', 'strategy', 'risk-assessment']
    });

    // Documentation Agent (Gemma3)
    this.createAgent({
      id: 'documentation-specialist',
      name: 'Documentation Specialist',
      role: 'documentation',
      model: 'gemma3:12b',
      systemPrompt: `You are a technical documentation specialist who creates clear, comprehensive, and user-friendly documentation.
        You excel at explaining complex technical concepts in an accessible way. You create API docs, user guides, tutorials,
        and technical specifications that are well-organized and easy to understand.`,
      temperature: 0.6,
      specializations: ['documentation', 'technical-writing', 'tutorials', 'api-docs']
    });

    this.logger.info('Default AI agents initialized');
  }

  // Private helper methods

  private async makeRequest(endpoint: string, method: 'GET' | 'POST', body?: any): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const options: any = {
      method,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    let lastError: Error;
    for (let attempt = 1; attempt <= (this.config.maxRetries || 3); attempt++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.debug(`Request attempt ${attempt} failed:`, error);
        
        if (attempt < (this.config.maxRetries || 3)) {
          await this.delay(1000 * attempt);
        }
      }
    }

    throw lastError!;
  }

  private async ensureModelLoaded(modelName: string): Promise<void> {
    if (this.modelLoadState.get(modelName)) {
      return; // Already loaded
    }

    this.logger.info(`Loading model: ${modelName}`);
    
    try {
      // Trigger model loading with a simple request
      await this.makeRequest('/api/generate', 'POST', {
        model: modelName,
        prompt: 'Hello',
        options: { num_predict: 1 }
      });
      
      this.modelLoadState.set(modelName, true);
      this.logger.info(`Model loaded successfully: ${modelName}`);
      this.emit('model-loaded', modelName);
      
    } catch (error) {
      this.logger.error(`Failed to load model ${modelName}:`, error);
      throw error;
    }
  }

  private async loadAvailableModels(): Promise<void> {
    try {
      const models = await this.listModels();
      for (const model of models) {
        this.modelLoadState.set(model.name, false);
      }
      this.logger.info(`Discovered ${models.length} available models`);
    } catch (error) {
      this.logger.warn('Could not load model list:', error);
    }
  }

  private updateModelPerformance(modelName: string, response: GenerateResponse | ChatResponse): void {
    // Implementation would track model performance metrics
    this.emit('model-performance-updated', {
      model: modelName,
      responseTime: response.total_duration || 0,
      tokens: response.eval_count || 0
    });
  }

  private updateAgentPerformance(agent: AgentProfile, responseTime: number, success: boolean, tokens: number): void {
    const perf = agent.performance;
    perf.totalRequests++;
    perf.averageResponseTime = (perf.averageResponseTime * (perf.totalRequests - 1) + responseTime) / perf.totalRequests;
    perf.successRate = success ? 
      (perf.successRate * (perf.totalRequests - 1) + 100) / perf.totalRequests :
      (perf.successRate * (perf.totalRequests - 1)) / perf.totalRequests;
    perf.lastUsed = new Date();
    perf.tokensGenerated += tokens;
    
    if (!success) {
      perf.errors++;
    }
  }

  private buildCodePrompt(prompt: string, language: string, context?: any): string {
    let codePrompt = `You are an expert ${language} developer. Generate clean, efficient, and well-documented code.

Task: ${prompt}

Language: ${language}
`;

    if (context?.fileName) {
      codePrompt += `File: ${context.fileName}\n`;
    }

    if (context?.existingCode) {
      codePrompt += `\nExisting code context:\n\`\`\`${language}\n${context.existingCode}\n\`\`\`\n`;
    }

    if (context?.requirements) {
      codePrompt += `\nRequirements:\n${context.requirements.map((req: string) => `- ${req}`).join('\n')}\n`;
    }

    codePrompt += `\nProvide only the code solution without explanation. Use proper formatting and include necessary imports:

\`\`\`${language}\n`;

    return codePrompt;
  }

  private buildCodeReviewPrompt(code: string, language: string, focusAreas: string[]): string {
    const areas = focusAreas.length > 0 ? focusAreas.join(', ') : 'security, performance, maintainability, best practices';
    
    return `You are an expert code reviewer. Analyze the following ${language} code and provide a detailed review.

Focus areas: ${areas}

Code to review:
\`\`\`${language}
${code}
\`\`\`

Provide your review in the following JSON format:
{
  "rating": <number 1-10>,
  "summary": "<brief summary of overall code quality>",
  "issues": [
    {
      "type": "<security|performance|maintainability|style|bug>",
      "severity": "<low|medium|high|critical>",
      "line": <line number or null>,
      "message": "<description of the issue>",
      "suggestion": "<how to fix it>"
    }
  ],
  "suggestions": [
    "<general improvement suggestions>"
  ]
}

Only respond with valid JSON.`;
  }

  private buildProjectAnalysisPrompt(projectData: any): string {
    return `You are a senior technical analyst. Analyze the following project information and provide strategic insights.

Project Structure: ${JSON.stringify(projectData.structure, null, 2)}

Requirements:
${projectData.requirements.map((req: string) => `- ${req}`).join('\n')}

Constraints:
${projectData.constraints.map((constraint: string) => `- ${constraint}`).join('\n')}

Current Status: ${projectData.currentStatus}

Provide your analysis in the following JSON format:
{
  "analysis": "<comprehensive analysis of the project>",
  "recommendations": [
    "<specific actionable recommendations>"
  ],
  "nextSteps": [
    "<immediate next steps to take>"
  ],
  "risks": [
    "<potential risks and mitigation strategies>"
  ],
  "timeline": "<estimated timeline and key milestones>"
}

Only respond with valid JSON.`;
  }

  private extractCodeFromResponse(response: string): string {
    // Extract code from markdown code blocks
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/g;
    const matches = codeBlockRegex.exec(response);
    
    if (matches && matches[1]) {
      return matches[1].trim();
    }
    
    // If no code block, return the response as-is (might be plain code)
    return response.trim();
  }

  private async getOllamaVersion(): Promise<string> {
    try {
      const response = await this.makeRequest('/api/version', 'GET');
      const data = await response.json() as any;
      return data.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private getModelStats(): Record<string, ModelStats> {
    const stats: Record<string, ModelStats> = {};
    
    for (const [modelName, loaded] of this.modelLoadState) {
      stats[modelName] = {
        name: modelName,
        loaded,
        requestCount: 0, // Would track this
        averageResponseTime: 0, // Would calculate this
        lastUsed: undefined
      };
    }
    
    return stats;
  }

  private async getSystemInfo(): Promise<SystemInfo> {
    try {
      // Get system information (simplified)
      const { stdout: memInfo } = await execAsync('free -m').catch(() => ({ stdout: '' }));
      const totalMemMatch = memInfo.match(/Mem:\s+(\d+)/);
      const availableMemMatch = memInfo.match(/available\s+(\d+)/);
      
      return {
        gpu: false, // Would need GPU detection
        totalMemory: totalMemMatch ? parseInt(totalMemMatch[1], 10) : 0,
        availableMemory: availableMemMatch ? parseInt(availableMemMatch[1], 10) : 0,
        cpuCores: require('os').cpus().length,
        platform: process.platform
      };
    } catch (error) {
      return {
        gpu: false,
        totalMemory: 0,
        availableMemory: 0,
        cpuCores: 1,
        platform: process.platform
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all agents
   */
  getAgents(): AgentProfile[] {
    return Array.from(this.agentProfiles.values());
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentProfile | null {
    return this.agentProfiles.get(agentId) || null;
  }

  /**
   * Remove agent
   */
  removeAgent(agentId: string): boolean {
    const success = this.agentProfiles.delete(agentId);
    if (success) {
      this.logger.info(`Agent removed: ${agentId}`);
      this.emit('agent-removed', agentId);
    }
    return success;
  }

  /**
   * Clear agent context
   */
  clearAgentContext(agentId: string): void {
    const agent = this.agentProfiles.get(agentId);
    if (agent) {
      agent.context = [];
      this.logger.debug(`Agent context cleared: ${agentId}`);
      this.emit('agent-context-cleared', agentId);
    }
  }

  /**
   * Update agent configuration
   */
  updateAgent(agentId: string, updates: Partial<AgentProfile>): boolean {
    const agent = this.agentProfiles.get(agentId);
    if (!agent) return false;

    Object.assign(agent, updates);
    this.logger.debug(`Agent updated: ${agentId}`);
    this.emit('agent-updated', agent);
    
    return true;
  }

  /**
   * Pull/download a new model
   */
  async pullModel(modelName: string, progressCallback?: (progress: number) => void): Promise<void> {
    try {
      this.logger.info(`Pulling model: ${modelName}`);
      
      const response = await fetch(`${this.config.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true })
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      // Handle streaming response for progress updates
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }

      let totalSize = 0;
      let downloadedSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.total) {
              totalSize = data.total;
            }
            
            if (data.completed) {
              downloadedSize = data.completed;
            }

            if (totalSize > 0 && progressCallback) {
              const progress = (downloadedSize / totalSize) * 100;
              progressCallback(progress);
            }

            if (data.status === 'success') {
              this.logger.info(`Model pulled successfully: ${modelName}`);
              this.emit('model-pulled', modelName);
              return;
            }
          } catch (parseError) {
            // Ignore JSON parse errors for partial chunks
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to pull model ${modelName}:`, error);
      this.emit('model-pull-failed', { modelName, error });
      throw error;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    try {
      await this.makeRequest('/api/delete', 'DELETE', { name: modelName });
      this.modelLoadState.delete(modelName);
      
      this.logger.info(`Model deleted: ${modelName}`);
      this.emit('model-deleted', modelName);
    } catch (error) {
      this.logger.error(`Failed to delete model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Create a custom model from Modelfile
   */
  async createModel(name: string, modelfile: string): Promise<void> {
    try {
      this.logger.info(`Creating custom model: ${name}`);
      
      await this.makeRequest('/api/create', 'POST', {
        name,
        modelfile,
        stream: false
      });
      
      this.logger.info(`Custom model created: ${name}`);
      this.emit('model-created', name);
    } catch (error) {
      this.logger.error(`Failed to create model ${name}:`, error);
      throw error;
    }
  }

  /**
   * Show model information
   */
  async showModel(modelName: string): Promise<OllamaModelDetails> {
    try {
      const response = await this.makeRequest('/api/show', 'POST', { name: modelName });
      const data = await response.json() as any;
      
      return {
        format: data.details?.format || '',
        family: data.details?.family || '',
        families: data.details?.families || [],
        parameter_size: data.details?.parameter_size || '',
        quantization_level: data.details?.quantization_level || '',
        license: data.license,
        modelfile: data.modelfile,
        template: data.template,
        system: data.system
      };
    } catch (error) {
      this.logger.error(`Failed to show model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Get model benchmarks
   */
  getModelBenchmarks(): ModelBenchmark[] {
    return Array.from(this.modelBenchmarks.values());
  }

  /**
   * Get benchmark for specific model
   */
  getModelBenchmark(modelName: string): ModelBenchmark | null {
    return this.modelBenchmarks.get(modelName) || null;
  }

  /**
   * Generate specialized prompts for different agent types
   */
  generateSystemPrompt(role: string, specializations: string[], context?: Record<string, any>): string {
    const basePrompts: Record<string, string> = {
      developer: "You are a senior software developer with expertise in modern development practices.",
      architect: "You are a software architect focused on system design and technical leadership.",
      reviewer: "You are a code reviewer focused on quality, security, and best practices.",
      tester: "You are a QA engineer specialized in testing strategies and quality assurance.",
      security: "You are a security specialist focused on identifying and mitigating security vulnerabilities.",
      performance: "You are a performance engineer focused on optimization and scalability.",
      documentation: "You are a technical writer specialized in creating clear and comprehensive documentation.",
      analyst: "You are a business analyst focused on requirements analysis and project planning.",
      coordinator: "You are a project coordinator focused on team coordination and workflow management."
    };

    let prompt = basePrompts[role.toLowerCase()] || "You are an AI assistant helping with software development.";
    
    if (specializations.length > 0) {
      prompt += ` Your specializations include: ${specializations.join(', ')}.`;
    }

    prompt += " Always provide accurate, helpful, and actionable responses.";

    if (context) {
      prompt += ` Additional context: ${JSON.stringify(context)}.`;
    }

    return prompt;
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Ollama Service...');
    
    // Clear all intervals and cleanup
    this.isProcessingQueue = false;
    this.requestQueue.length = 0;
    
    this.removeAllListeners();
    this.logger.info('Ollama Service shutdown complete');
  }
}

// Supporting interfaces

interface RequestQueueItem {
  id: string;
  request: GenerateRequest | ChatRequest;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  retries: number;
}

interface CodeIssue {
  type: 'security' | 'performance' | 'maintainability' | 'style' | 'bug';
  severity: 'low' | 'medium' | 'high' | 'critical';
  line?: number;
  message: string;
  suggestion: string;
}

// Export types for external use
export type {
  OllamaModel,
  OllamaModelDetails,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  AgentProfile,
  ModelBenchmark,
  OllamaStats,
  CodeIssue
};