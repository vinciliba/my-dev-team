import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import './ChatInterface.css';

interface Message {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: Date;
  type: 'user' | 'agent' | 'system';
  avatar?: string;
}

interface ChatInterfaceProps {
  agents: Array<{
    id: string;
    name: string;
    avatar?: string;
    status: string;
  }>;
  selectedAgent: string | null;
  onAgentSelect: (agentId: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  agents, 
  selectedAgent, 
  onAgentSelect 
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      agentId: 'system',
      agentName: 'System',
      content: 'Welcome to AI Dev Team Chat! Select an agent to start a conversation or use Team Mode to collaborate with all agents.',
      timestamp: new Date(),
      type: 'system',
      avatar: '🌟'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [isTyping, setIsTyping] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const vscode = acquireVsCodeApi();

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Listen for messages from agents
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'agentMessage') {
        addAgentMessage(message.agentId, message.content);
        setIsTyping(prev => prev.filter(id => id !== message.agentId));
      } else if (message.type === 'agentTyping') {
        setIsTyping(prev => [...prev.filter(id => id !== message.agentId), message.agentId]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addAgentMessage = (agentId: string, content: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      agentId: agent.id,
      agentName: agent.name,
      content,
      timestamp: new Date(),
      type: 'agent',
      avatar: agent.avatar
    };

    setMessages(prev => [...prev, newMessage]);
  };

  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      agentId: 'user',
      agentName: 'You',
      content: inputMessage,
      timestamp: new Date(),
      type: 'user'
    };

    setMessages(prev => [...prev, userMessage]);

    // Send to VS Code extension
    vscode.postMessage({
      type: 'chatMessage',
      content: inputMessage,
      target: isTeamMode ? 'team' : selectedAgent,
      isTeamMode
    });

    setInputMessage('');

    // Simulate agents typing
    if (isTeamMode) {
      agents.forEach(agent => {
        if (agent.status !== 'error') {
          setTimeout(() => setIsTyping(prev => [...prev, agent.id]), Math.random() * 1000);
        }
      });
    } else if (selectedAgent) {
      setIsTyping([selectedAgent]);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="chat-mode-selector">
          <button
            className={`mode-button ${!isTeamMode ? 'active' : ''}`}
            onClick={() => setIsTeamMode(false)}
          >
            Individual Chat
          </button>
          <button
            className={`mode-button ${isTeamMode ? 'active' : ''}`}
            onClick={() => setIsTeamMode(true)}
          >
            Team Mode
          </button>
        </div>
        {!isTeamMode && (
          <div className="agent-selector">
            <select 
              value={selectedAgent || ''} 
              onChange={(e) => onAgentSelect(e.target.value)}
              className="agent-select"
            >
              <option value="">Select an agent...</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar} {agent.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.type}`}>
            <div className="message-avatar">
              {message.avatar || (message.type === 'user' ? '👤' : '🤖')}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-sender">{message.agentName}</span>
                <span className="message-time">{formatTime(message.timestamp)}</span>
              </div>
              <div className="message-text">{message.content}</div>
            </div>
          </div>
        ))}
        
        {isTyping.length > 0 && (
          <div className="typing-indicators">
            {isTyping.map(agentId => {
              const agent = agents.find(a => a.id === agentId);
              return agent ? (
                <div key={agentId} className="typing-indicator">
                  <span className="typing-avatar">{agent.avatar || '🤖'}</span>
                  <span className="typing-text">{agent.name} is typing</span>
                  <span className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </div>
              ) : null;
            })}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          placeholder={
            isTeamMode 
              ? "Message the entire AI team..." 
              : selectedAgent 
                ? `Message ${agents.find(a => a.id === selectedAgent)?.name}...`
                : "Select an agent to start chatting..."
          }
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          disabled={!isTeamMode && !selectedAgent}
        />
        <button 
          className="send-button" 
          onClick={sendMessage}
          disabled={!inputMessage.trim() || (!isTeamMode && !selectedAgent)}
        >
          <span>Send</span>
          <span className="send-icon">→</span>
        </button>
      </div>
    </div>
  );
};