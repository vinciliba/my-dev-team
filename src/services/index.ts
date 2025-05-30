// Service exports (da implementare)
export { OllamaService } from './OllamaService';
export { FileService } from './FileService';
export { GitService } from './GitService';

// Service factory
export class ServiceFactory {
  static createOllamaService() {
    return new OllamaService();
  }

  static createFileService() {
    return new FileService();
  }

  static createGitService() {
    return new GitService();
  }

  static createAllServices() {
    return {
      ollama: new OllamaService(),
      file: new FileService(),
      git: new GitService()
    };
  }
}