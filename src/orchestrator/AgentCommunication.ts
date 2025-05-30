/**
 * Agent Communication System
 * Handles inter-agent communication, message routing, and coordination
 */

import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export type AgentId = string;
export type MessageId = string;
export type ChannelId = string;

export interface AgentInfo {
  id: AgentId;
  name: string;
  type: AgentType;
  status: AgentStatus;
  capabilities: string[];
  currentTask?: string;
  lastSeen: Date;
  metadata: Record<string, any>;
}

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
  | 'coordinator';

export type AgentStatus = 
  | 'online'
  | 'busy'
  | 'idle'
  | 'offline'
  | 'error'
  | 'initializing';

export interface Message {
  id: MessageId;
  from: AgentId;
  to: AgentId | AgentId[] | 'broadcast';
  channel?: ChannelId;
  type: MessageType;
  content: any;
  priority: MessagePriority;
  timestamp: Date;
  correlationId?: string;
  replyTo?: MessageId;
  expiresAt?: Date;
  metadata: Record<string, any>;
}

export type MessageType =
  | 'task-assignment'
  | 'task-completion'
  | 'task-update'
  | 'request-assistance'
  | 'provide-assistance'
  | 'status-update'
  | 'error-report'
  | 'coordination'
  | 'broadcast'
  | 'query'
  | 'response'
  | 'notification'
  | 'heartbeat';

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Channel {
  id: ChannelId;
  name: string;
  type: ChannelType;
  participants: AgentId[];
  topic?: string;
  created: Date;
  lastActivity: Date;
  messageHistory: Message[];
  persistent: boolean;
  maxHistory: number;
}

export type ChannelType = 'direct' | 'group' | 'broadcast' | 'task-specific' | 'system';

export interface MessageHandler {
  messageType: MessageType;
  handler: (message: Message) => Promise<Message | void>;
  priority?: number;
}

export interface CommunicationStats {
  totalMessages: number;
  messagesByType: Record<MessageType, number>;
  messagesByPriority: Record<MessagePriority, number>;
  activeAgents: number;
  activeChannels: number;
  averageResponseTime: number;
  errorRate: number;
  lastUpdated: Date;
}

export interface MessageFilter {
  from?: AgentId | AgentId[];
  to?: AgentId | AgentId[];
  type?: MessageType | MessageType[];
  priority?: MessagePriority | MessagePriority[];
  channel?: ChannelId;
  dateRange?: {
    from: Date;
    to: Date;
  };
  correlationId?: string;
}

/**
 * Central communication hub for agent coordination
 */
export class AgentCommunication extends EventEmitter {
  private logger: Logger;
  private agents = new Map<AgentId, AgentInfo>();
  private channels = new Map<ChannelId, Channel>();
  private messageHandlers = new Map<AgentId, MessageHandler[]>();
  private messageQueue = new Map<AgentId, Message[]>();
  private pendingResponses = new Map<MessageId, {
    resolve: (message: Message) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  private stats: CommunicationStats;
  private messageHistory: Message[] = [];
  private maxHistorySize: number = 10000;
  private defaultMessageTimeout: number = 30000; // 30 seconds
  
  // Heartbeat system
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatFrequency: number = 30000; // 30 seconds
  private agentTimeout: number = 120000; // 2 minutes

  constructor() {
    super();
    this.logger = new Logger('AgentCommunication');
    this.stats = this.initializeStats();
    this.startHeartbeatSystem();
    
    this.logger.info('Agent Communication System initialized');
  }

  /**
   * Register an agent in the communication system
   */
  registerAgent(agentInfo: Omit<AgentInfo, 'lastSeen'>): void {
    const agent: AgentInfo = {
      ...agentInfo,
      lastSeen: new Date()
    };
    
    this.agents.set(agent.id, agent);
    this.messageQueue.set(agent.id, []);
    
    this.logger.info(`Agent registered: ${agent.name} (${agent.id})`);
    this.emit('agent-registered', agent);
    this.updateStats();
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: AgentId): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Clean up agent data
    this.agents.delete(agentId);
    this.messageQueue.delete(agentId);
    this.messageHandlers.delete(agentId);
    
    // Remove from channels
    for (const channel of this.channels.values()) {
      const index = channel.participants.indexOf(agentId);
      if (index > -1) {
        channel.participants.splice(index, 1);
      }
    }

    this.logger.info(`Agent unregistered: ${agent.name} (${agentId})`);
    this.emit('agent-unregistered', agent);
    this.updateStats();
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: AgentId, status: AgentStatus, currentTask?: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.logger.warn(`Attempted to update status for unknown agent: ${agentId}`);
      return;
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.lastSeen = new Date();
    
    if (currentTask !== undefined) {
      agent.currentTask = currentTask;
    }

    this.logger.debug(`Agent ${agent.name} status: ${oldStatus} -> ${status}`);
    this.emit('agent-status-changed', agent, oldStatus);
  }

  /**
   * Send a message to one or more agents
   */
  async sendMessage(message: Omit<Message, 'id' | 'timestamp'>): Promise<MessageId> {
    const fullMessage: Message = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date()
    };

    this.logger.debug(`Sending message: ${fullMessage.type} from ${fullMessage.from} to ${fullMessage.to}`);
    
    // Validate message
    this.validateMessage(fullMessage);
    
    // Add to history
    this.addToHistory(fullMessage);
    
    // Route message
    await this.routeMessage(fullMessage);
    
    // Update statistics
    this.updateMessageStats(fullMessage);
    
    this.emit('message-sent', fullMessage);
    return fullMessage.id;
  }

  /**
   * Send a message and wait for a response
   */
  async sendMessageAndWait(
    message: Omit<Message, 'id' | 'timestamp'>,
    timeout: number = this.defaultMessageTimeout
  ): Promise<Message> {
    const messageId = await this.sendMessage(message);
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error(`Message timeout: ${messageId}`));
      }, timeout);

      this.pendingResponses.set(messageId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });
    });
  }

  /**
   * Reply to a message
   */
  async replyToMessage(
    originalMessage: Message,
    replyContent: any,
    messageType: MessageType = 'response'
  ): Promise<MessageId> {
    return await this.sendMessage({
      from: originalMessage.to as AgentId,
      to: originalMessage.from,
      channel: originalMessage.channel,
      type: messageType,
      content: replyContent,
      priority: originalMessage.priority,
      replyTo: originalMessage.id,
      correlationId: originalMessage.correlationId,
      metadata: {}
    });
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(
    from: AgentId,
    content: any,
    messageType: MessageType = 'broadcast',
    priority: MessagePriority = 'normal'
  ): Promise<MessageId> {
    return await this.sendMessage({
      from,
      to: 'broadcast',
      type: messageType,
      content,
      priority,
      metadata: {}
    });
  }

  /**
   * Register a message handler for an agent
   */
  registerMessageHandler(agentId: AgentId, handler: MessageHandler): void {
    if (!this.messageHandlers.has(agentId)) {
      this.messageHandlers.set(agentId, []);
    }
    
    const handlers = this.messageHandlers.get(agentId)!;
    handlers.push(handler);
    
    // Sort by priority (higher number = higher priority)
    handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    this.logger.debug(`Message handler registered for ${agentId}: ${handler.messageType}`);
  }

  /**
   * Unregister a message handler
   */
  unregisterMessageHandler(agentId: AgentId, messageType: MessageType): void {
    const handlers = this.messageHandlers.get(agentId);
    if (!handlers) return;

    const index = handlers.findIndex(h => h.messageType === messageType);
    if (index > -1) {
      handlers.splice(index, 1);
      this.logger.debug(`Message handler unregistered for ${agentId}: ${messageType}`);
    }
  }

  /**
   * Create a communication channel
   */
  createChannel(
    id: ChannelId,
    name: string,
    type: ChannelType,
    participants: AgentId[],
    options: {
      topic?: string;
      persistent?: boolean;
      maxHistory?: number;
    } = {}
  ): Channel {
    const channel: Channel = {
      id,
      name,
      type,
      participants: [...participants],
      topic: options.topic,
      created: new Date(),
      lastActivity: new Date(),
      messageHistory: [],
      persistent: options.persistent ?? true,
      maxHistory: options.maxHistory ?? 100
    };

    this.channels.set(id, channel);
    this.logger.info(`Channel created: ${name} (${id}) with ${participants.length} participants`);
    this.emit('channel-created', channel);
    
    return channel;
  }

  /**
   * Join an agent to a channel
   */
  joinChannel(channelId: ChannelId, agentId: AgentId): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) {
      this.logger.warn(`Attempted to join non-existent channel: ${channelId}`);
      return false;
    }

    if (!channel.participants.includes(agentId)) {
      channel.participants.push(agentId);
      channel.lastActivity = new Date();
      
      this.logger.debug(`Agent ${agentId} joined channel ${channelId}`);
      this.emit('agent-joined-channel', channel, agentId);
      return true;
    }
    
    return false;
  }

  /**
   * Remove an agent from a channel
   */
  leaveChannel(channelId: ChannelId, agentId: AgentId): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const index = channel.participants.indexOf(agentId);
    if (index > -1) {
      channel.participants.splice(index, 1);
      channel.lastActivity = new Date();
      
      this.logger.debug(`Agent ${agentId} left channel ${channelId}`);
      this.emit('agent-left-channel', channel, agentId);
      return true;
    }
    
    return false;
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: AgentId): AgentInfo | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: AgentType): AgentInfo[] {
    return Array.from(this.agents.values()).filter(agent => agent.type === type);
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status: AgentStatus): AgentInfo[] {
    return Array.from(this.agents.values()).filter(agent => agent.status === status);
  }

  /**
   * Get channel by ID
   */
  getChannel(channelId: ChannelId): Channel | null {
    return this.channels.get(channelId) || null;
  }

  /**
   * Get all channels
   */
  getChannels(): Channel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Get channels for an agent
   */
  getAgentChannels(agentId: AgentId): Channel[] {
    return Array.from(this.channels.values()).filter(
      channel => channel.participants.includes(agentId)
    );
  }

  /**
   * Get message history with optional filtering
   */
  getMessageHistory(filter?: MessageFilter, limit?: number): Message[] {
    let messages = [...this.messageHistory];

    if (filter) {
      messages = this.filterMessages(messages, filter);
    }

    if (limit) {
      messages = messages.slice(-limit);
    }

    return messages;
  }

  /**
   * Get communication statistics
   */
  getStats(): CommunicationStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get pending messages for an agent
   */
  getPendingMessages(agentId: AgentId): Message[] {
    return this.messageQueue.get(agentId) || [];
  }

  /**
   * Clear pending messages for an agent
   */
  clearPendingMessages(agentId: AgentId): number {
    const queue = this.messageQueue.get(agentId);
    if (!queue) return 0;

    const count = queue.length;
    queue.length = 0;
    
    this.logger.debug(`Cleared ${count} pending messages for agent ${agentId}`);
    return count;
  }

  /**
   * Shutdown the communication system
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Agent Communication System...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear pending response timeouts
    for (const pending of this.pendingResponses.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('System shutdown'));
    }
    this.pendingResponses.clear();

    // Notify all agents of shutdown
    await this.broadcast('system', { type: 'shutdown' }, 'system');
    
    this.removeAllListeners();
    this.logger.info('Agent Communication System shutdown complete');
  }

  // Private methods

  private generateMessageId(): MessageId {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateMessage(message: Message): void {
    if (!message.from) {
      throw new Error('Message must have a sender');
    }
    
    if (!message.to) {
      throw new Error('Message must have a recipient');
    }
    
    if (!message.type) {
      throw new Error('Message must have a type');
    }

    // Check if sender exists (except for system messages)
    if (message.from !== 'system' && !this.agents.has(message.from)) {
      throw new Error(`Unknown sender agent: ${message.from}`);
    }

    // Check expiration
    if (message.expiresAt && message.expiresAt < new Date()) {
      throw new Error('Message has expired');
    }
  }

  private async routeMessage(message: Message): Promise<void> {
    if (message.to === 'broadcast') {
      await this.routeBroadcastMessage(message);
    } else if (Array.isArray(message.to)) {
      await this.routeMulticastMessage(message);
    } else {
      await this.routeUnicastMessage(message);
    }
  }

  private async routeUnicastMessage(message: Message): Promise<void> {
    const recipientId = message.to as AgentId;
    const recipient = this.agents.get(recipientId);
    
    if (!recipient) {
      this.logger.warn(`Message sent to unknown agent: ${recipientId}`);
      return;
    }

    await this.deliverMessage(message, recipientId);
  }

  private async routeMulticastMessage(message: Message): Promise<void> {
    const recipients = message.to as AgentId[];
    
    for (const recipientId of recipients) {
      const recipient = this.agents.get(recipientId);
      if (recipient) {
        await this.deliverMessage(message, recipientId);
      } else {
        this.logger.warn(`Message sent to unknown agent: ${recipientId}`);
      }
    }
  }

  private async routeBroadcastMessage(message: Message): Promise<void> {
    for (const agentId of this.agents.keys()) {
      if (agentId !== message.from) {
        await this.deliverMessage(message, agentId);
      }
    }
  }

  private async deliverMessage(message: Message, recipientId: AgentId): Promise<void> {
    const handlers = this.messageHandlers.get(recipientId) || [];
    const relevantHandlers = handlers.filter(h => h.messageType === message.type);
    
    if (relevantHandlers.length === 0) {
      // Queue message if no handlers
      const queue = this.messageQueue.get(recipientId);
      if (queue) {
        queue.push(message);
        this.logger.debug(`Message queued for ${recipientId}: ${message.type}`);
      }
      return;
    }

    // Try to handle the message
    for (const handler of relevantHandlers) {
      try {
        const response = await handler.handler(message);
        
        if (response) {
          // Handle response if provided
          if (message.replyTo && this.pendingResponses.has(message.replyTo)) {
            const pending = this.pendingResponses.get(message.replyTo)!;
            clearTimeout(pending.timeout);
            pending.resolve(response);
            this.pendingResponses.delete(message.replyTo);
          }
        }
        
        this.emit('message-delivered', message, recipientId);
        break; // Message handled successfully
        
      } catch (error) {
        this.logger.error(`Error handling message ${message.id} for ${recipientId}:`, error);
        this.emit('message-error', message, recipientId, error);
      }
    }

    // Update recipient's last seen
    const recipient = this.agents.get(recipientId);
    if (recipient) {
      recipient.lastSeen = new Date();
    }

    // Add to channel history if applicable
    if (message.channel) {
      this.addToChannelHistory(message);
    }
  }

  private addToHistory(message: Message): void {
    this.messageHistory.push(message);
    
    // Trim history if too large
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }
  }

  private addToChannelHistory(message: Message): void {
    if (!message.channel) return;
    
    const channel = this.channels.get(message.channel);
    if (!channel) return;

    channel.messageHistory.push(message);
    channel.lastActivity = new Date();
    
    // Trim channel history
    if (channel.messageHistory.length > channel.maxHistory) {
      channel.messageHistory = channel.messageHistory.slice(-channel.maxHistory);
    }
  }

  private filterMessages(messages: Message[], filter: MessageFilter): Message[] {
    return messages.filter(message => {
      // Filter by sender
      if (filter.from) {
        const senders = Array.isArray(filter.from) ? filter.from : [filter.from];
        if (!senders.includes(message.from)) return false;
      }

      // Filter by recipient
      if (filter.to) {
        const recipients = Array.isArray(filter.to) ? filter.to : [filter.to];
        if (Array.isArray(message.to)) {
          if (!message.to.some(to => recipients.includes(to))) return false;
        } else if (message.to !== 'broadcast') {
          if (!recipients.includes(message.to as AgentId)) return false;
        }
      }

      // Filter by type
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(message.type)) return false;
      }

      // Filter by priority
      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        if (!priorities.includes(message.priority)) return false;
      }

      // Filter by channel
      if (filter.channel && message.channel !== filter.channel) return false;

      // Filter by date range
      if (filter.dateRange) {
        if (message.timestamp < filter.dateRange.from || message.timestamp > filter.dateRange.to) {
          return false;
        }
      }

      // Filter by correlation ID
      if (filter.correlationId && message.correlationId !== filter.correlationId) return false;

      return true;
    });
  }

  private initializeStats(): CommunicationStats {
    return {
      totalMessages: 0,
      messagesByType: {} as Record<MessageType, number>,
      messagesByPriority: {} as Record<MessagePriority, number>,
      activeAgents: 0,
      activeChannels: 0,
      averageResponseTime: 0,
      errorRate: 0,
      lastUpdated: new Date()
    };
  }

  private updateStats(): void {
    this.stats.activeAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'online' || agent.status === 'busy').length;
    this.stats.activeChannels = this.channels.size;
    this.stats.lastUpdated = new Date();
  }

  private updateMessageStats(message: Message): void {
    this.stats.totalMessages++;
    this.stats.messagesByType[message.type] = (this.stats.messagesByType[message.type] || 0) + 1;
    this.stats.messagesByPriority[message.priority] = (this.stats.messagesByPriority[message.priority] || 0) + 1;
  }

  private startHeartbeatSystem(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
      this.checkAgentTimeouts();
    }, this.heartbeatFrequency);
  }

  private async sendHeartbeats(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.status === 'online' || agent.status === 'busy') {
        try {
          await this.sendMessage({
            from: 'system',
            to: agent.id,
            type: 'heartbeat',
            content: { timestamp: new Date() },
            priority: 'low',
            metadata: {}
          });
        } catch (error) {
          this.logger.debug(`Failed to send heartbeat to ${agent.id}:`, error);
        }
      }
    }
  }

  private checkAgentTimeouts(): void {
    const now = new Date();
    
    for (const agent of this.agents.values()) {
      const timeSinceLastSeen = now.getTime() - agent.lastSeen.getTime();
      
      if (timeSinceLastSeen > this.agentTimeout && agent.status !== 'offline') {
        this.logger.warn(`Agent ${agent.name} (${agent.id}) timed out`);
        this.updateAgentStatus(agent.id, 'offline');
      }
    }
  }
}