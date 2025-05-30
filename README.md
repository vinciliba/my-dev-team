# AI Dev Team - VS Code Extension

🤖 **AI Dev Team** is an advanced VS Code extension that brings an entire AI-powered development team to your IDE. Work with specialized AI agents including Architect, Coder, Tester, Reviewer, and Documenter to accelerate your development workflow.

![AI Dev Team Banner](https://img.shields.io/badge/VS%20Code-Extension-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🌟 Features

### 👥 AI Agent Team
- **🏗️ Architect Agent**: System design, API planning, and database schema creation
- **💻 Coder Agent**: Code generation, refactoring, and feature implementation
- **🧪 Tester Agent**: Unit tests, integration tests, and test coverage analysis
- **🔍 Reviewer Agent**: Code reviews, best practices enforcement, and security analysis
- **📚 Documenter Agent**: API documentation, code comments, and user guides

### 🎯 Key Capabilities
- **Team Collaboration Mode**: Agents work together on complex tasks
- **Individual Agent Mode**: Direct interaction with specific agents
- **Real-time Progress Tracking**: Monitor active tasks and agent status
- **Intelligent Code Analysis**: Context-aware suggestions based on your project
- **File System Watching**: Automatic detection of changes and updates
- **Multi-language Support**: TypeScript, JavaScript, Python, Java, and more

## 📋 Requirements

- VS Code version 1.74.0 or higher
- Node.js 16.x or higher
- [Ollama](https://ollama.ai/) installed and running locally
- At least one Ollama model installed (e.g., `codellama`, `llama2`, `mistral`)

## 🚀 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "AI Dev Team"
4. Click Install

### From Source
```bash
# Clone the repository
git clone https://github.com/yourusername/ai-dev-team.git
cd ai-dev-team

# Install dependencies
npm install

# Build the extension
npm run compile

# Package the extension
npm run package
```

## 🔧 Configuration

### Setting up Ollama
1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Pull a model:
   ```bash
   ollama pull codellama
   ```
3. Ensure Ollama is running:
   ```bash
   ollama serve
   ```

### Extension Settings
Configure the extension in VS Code settings:

```json
{
  "aiDevTeam.ollamaUrl": "http://localhost:11434",
  "aiDevTeam.defaultModel": "codellama",
  "aiDevTeam.maxConcurrentAgents": 3,
  "aiDevTeam.enableFileWatcher": true,
  "aiDevTeam.autoSaveGenerated": true
}
```

## 📖 Usage

### Opening the AI Dev Team Panel
1. Press `Ctrl+Shift+P` to open command palette
2. Type "AI Dev Team: Open Dashboard"
3. Or click the AI Dev Team icon in the activity bar

### Creating a Task
1. In the dashboard, describe your task in the input area
2. Choose between Team Mode or Individual Agent
3. Click "Start Task" or press `Ctrl+Enter`

### Example Tasks
```
// Team Mode Example
"Create a REST API for a todo application with authentication"

// Individual Agent Examples
Architect: "Design a microservices architecture for an e-commerce platform"
Coder: "Implement a binary search tree with insert and delete methods"
Tester: "Generate unit tests for the UserService class"
Reviewer: "Review the authentication module for security vulnerabilities"
Documenter: "Create API documentation for the payment endpoints"
```

### Chat Interface
- Switch between Individual Chat and Team Mode
- Select specific agents for focused conversations
- View typing indicators and real-time responses
- Access chat history and export conversations

## 🏗️ Architecture

```
my-dev-team/
├── src/
│   ├── agents/           # AI Agent implementations
│   │   ├── BaseAgent.ts
│   │   ├── ArchitectAgent.ts
│   │   ├── CoderAgent.ts
│   │   ├── TesterAgent.ts
│   │   ├── ReviewerAgent.ts
│   │   └── DocumenterAgent.ts
│   ├── components/       # React UI components
│   │   ├── AgentCard.tsx
│   │   ├── ChatInterface.tsx
│   │   ├── ProjectOverview.tsx
│   │   └── TaskProgress.tsx
│   ├── context/          # Project context and analysis
│   │   ├── ProjectContext.ts
│   │   ├── WorkspaceAnalyzer.ts
│   │   └── FileSystemWatcher.ts
│   ├── orchestrator/     # Task orchestration
│   │   └── ProjectOrchestrator.ts
│   ├── services/         # External services
│   │   ├── OllamaService.ts
│   │   └── FileService.ts
│   ├── styles/           # Component styles
│   ├── types/            # TypeScript definitions
│   └── extension.ts      # Extension entry point
```

## 🛠️ Development

### Building from Source
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test

# Lint code
npm run lint
```

### Debugging
1. Open the project in VS Code
2. Press `F5` to launch a new VS Code window with the extension
3. Set breakpoints in the source code
4. Check the Debug Console for logs

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --testNamePattern="AgentTests"
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai/) for providing local LLM capabilities
- [VS Code Extension API](https://code.visualstudio.com/api) documentation
- All contributors and testers

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/ai-dev-team/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/ai-dev-team/discussions)
- **Email**: support@aidevteam.dev

## 🗺️ Roadmap

- [ ] Support for more LLM providers (OpenAI, Anthropic, Google)
- [ ] Enhanced team collaboration features
- [ ] Visual workflow designer
- [ ] Integration with popular CI/CD tools
- [ ] Plugin system for custom agents
- [ ] Multi-workspace support
- [ ] Cloud sync for settings and history

---

Made with ❤️ by the AI Dev Team Community