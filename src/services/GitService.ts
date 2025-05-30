/**
 * Git Service
 * Comprehensive Git operations for AI agent development workflows
 */

import { execSync, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

const exec = promisify(require('child_process').exec);

export interface GitConfig {
  repositoryPath: string;
  userName?: string;
  userEmail?: string;
  defaultBranch?: string;
  remoteUrl?: string;
  sshKeyPath?: string;
  gpgSigningKey?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface GitState {
  currentBranch: string;
  isClean: boolean;
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
  ahead: number;
  behind: number;
  lastCommit: GitCommit;
  remotes: GitRemote[];
  branches: GitBranch[];
  tags: GitTag[];
  stashes: GitStash[];
  status: GitFileStatus[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: GitAuthor;
  committer: GitAuthor;
  message: string;
  subject: string;
  body?: string;
  date: Date;
  files: GitCommitFile[];
  stats: GitCommitStats;
  parents: string[];
  refs: string[];
}

export interface GitAuthor {
  name: string;
  email: string;
  date: Date;
}

export interface GitCommitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  additions: number;
  deletions: number;
  binary: boolean;
  oldPath?: string; // For renamed files
}

export interface GitCommitStats {
  files: number;
  insertions: number;
  deletions: number;
}

export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommit: string;
}

export interface GitTag {
  name: string;
  commit: string;
  message?: string;
  date: Date;
  annotated: boolean;
}

export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: Date;
  files: string[];
}

export interface GitFileStatus {
  path: string;
  workingTree: GitFileState;
  index: GitFileState;
  originalPath?: string; // For renamed files
}

export type GitFileState = 
  | 'unmodified'
  | 'modified' 
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'unmerged';

export interface GitDiff {
  files: GitDiffFile[];
  stats: GitCommitStats;
  patch: string;
}

export interface GitDiffFile {
  path: string;
  oldPath?: string;
  status: GitFileState;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: GitDiffHunk[];
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  context: string;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface GitMergeResult {
  success: boolean;
  conflicts: GitConflict[];
  mergedFiles: string[];
  conflictedFiles: string[];
  message?: string;
}

export interface GitConflict {
  path: string;
  type: 'content' | 'delete/modify' | 'modify/delete' | 'both_added' | 'both_modified';
  markers: GitConflictMarker[];
  resolved: boolean;
}

export interface GitConflictMarker {
  type: 'ours' | 'theirs' | 'base';
  startLine: number;
  endLine: number;
  content: string;
}

export interface GitWorkflow {
  id: string;
  name: string;
  description: string;
  steps: GitWorkflowStep[];
  triggers: GitWorkflowTrigger[];
  conditions: GitWorkflowCondition[];
}

export interface GitWorkflowStep {
  id: string;
  name: string;
  action: GitWorkflowAction;
  parameters: Record<string, any>;
  continueOnError?: boolean;
  timeout?: number;
}

export type GitWorkflowAction =
  | 'checkout'
  | 'pull'
  | 'commit'
  | 'push'
  | 'merge'
  | 'rebase'
  | 'tag'
  | 'stash'
  | 'reset'
  | 'clean';

export interface GitWorkflowTrigger {
  type: 'file_change' | 'branch_change' | 'commit' | 'manual';
  pattern?: string;
  branches?: string[];
}

export interface GitWorkflowCondition {
  type: 'branch_exists' | 'clean_working_tree' | 'no_conflicts' | 'custom';
  parameters?: Record<string, any>;
}

export interface GitHook {
  name: string;
  script: string;
  enabled: boolean;
  language: 'bash' | 'node' | 'python';
}

export interface GitOperationOptions {
  force?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  timeout?: number;
  workingDirectory?: string;
  environment?: Record<string, string>;
}

/**
 * Comprehensive Git service for AI agent development workflows
 */
export class GitService extends EventEmitter {
  private logger: Logger;
  private config: GitConfig;
  private workflows: Map<string, GitWorkflow> = new Map();
  private hooks: Map<string, GitHook> = new Map();
  private operationQueue: GitOperation[] = [];
  private isProcessingQueue: boolean = false;

  constructor(config: GitConfig) {
    super();
    this.config = {
      defaultBranch: 'main',
      timeout: 30000,
      maxRetries: 3,
      ...config
    };
    this.logger = new Logger('GitService');
    
    this.logger.info(`Git Service initialized for repository: ${config.repositoryPath}`);
  }

  /**
   * Initialize Git repository
   */
  async initialize(bare: boolean = false): Promise<void> {
    try {
      const command = bare ? 'git init --bare' : 'git init';
      await this.executeGitCommand(command);
      
      if (!bare && this.config.userName && this.config.userEmail) {
        await this.setConfig('user.name', this.config.userName);
        await this.setConfig('user.email', this.config.userEmail);
      }
      
      if (this.config.defaultBranch) {
        await this.setConfig('init.defaultBranch', this.config.defaultBranch);
      }
      
      this.logger.info('Git repository initialized');
      this.emit('repository-initialized', { bare });
      
    } catch (error) {
      this.logger.error('Failed to initialize Git repository:', error);
      throw error;
    }
  }

  /**
   * Clone repository
   */
  async clone(remoteUrl: string, targetPath?: string, options: GitOperationOptions = {}): Promise<void> {
    try {
      const clonePath = targetPath || this.config.repositoryPath;
      const command = `git clone ${remoteUrl} ${clonePath}`;
      
      if (options.quiet) command += ' --quiet';
      if (options.verbose) command += ' --verbose';
      
      await this.executeGitCommand(command, { timeout: 120000 }); // 2 minutes for clone
      
      this.logger.info(`Repository cloned: ${remoteUrl} -> ${clonePath}`);
      this.emit('repository-cloned', { remoteUrl, targetPath: clonePath });
      
    } catch (error) {
      this.logger.error(`Failed to clone repository ${remoteUrl}:`, error);
      throw error;
    }
  }

  /**
   * Get current Git state
   */
  async getGitState(): Promise<GitState> {
    try {
      const [
        currentBranch,
        status,
        remotes,
        branches,
        tags,
        stashes,
        lastCommit,
        aheadBehind
      ] = await Promise.all([
        this.getCurrentBranch(),
        this.getStatus(),
        this.getRemotes(),
        this.getBranches(),
        this.getTags(),
        this.getStashes(),
        this.getLastCommit(),
        this.getAheadBehind()
      ]);

      const gitState: GitState = {
        currentBranch,
        isClean: status.length === 0,
        hasUncommittedChanges: status.some(s => s.workingTree !== 'unmodified'),
        hasUnpushedCommits: aheadBehind.ahead > 0,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        lastCommit,
        remotes,
        branches,
        tags,
        stashes,
        status
      };

      return gitState;
    } catch (error) {
      this.logger.error('Failed to get Git state:', error);
      throw error;
    }
  }

  /**
   * Stage files
   */
  async add(files: string | string[], options: GitOperationOptions = {}): Promise<void> {
    try {
      const fileList = Array.isArray(files) ? files.join(' ') : files;
      let command = `git add ${fileList}`;
      
      if (options.force) command += ' --force';
      if (options.dryRun) command += ' --dry-run';
      if (options.verbose) command += ' --verbose';
      
      await this.executeGitCommand(command);
      
      this.logger.debug(`Files staged: ${fileList}`);
      this.emit('files-staged', { files: Array.isArray(files) ? files : [files] });
      
    } catch (error) {
      this.logger.error(`Failed to stage files: ${files}`, error);
      throw error;
    }
  }

  /**
   * Unstage files
   */
  async reset(files?: string | string[], options: GitOperationOptions = {}): Promise<void> {
    try {
      let command = 'git reset';
      
      if (files) {
        const fileList = Array.isArray(files) ? files.join(' ') : files;
        command += ` HEAD -- ${fileList}`;
      }
      
      if (options.force) command += ' --hard';
      if (options.quiet) command += ' --quiet';
      
      await this.executeGitCommand(command);
      
      this.logger.debug(`Files unstaged: ${files || 'all'}`);
      this.emit('files-unstaged', { files });
      
    } catch (error) {
      this.logger.error(`Failed to unstage files: ${files}`, error);
      throw error;
    }
  }

  /**
   * Commit changes
   */
  async commit(message: string, options: GitOperationOptions & {
    amend?: boolean;
    noEdit?: boolean;
    signOff?: boolean;
    author?: string;
    date?: Date;
  } = {}): Promise<GitCommit> {
    try {
      let command = `git commit -m "${message.replace(/"/g, '\\"')}"`;
      
      if (options.amend) command += ' --amend';
      if (options.noEdit) command += ' --no-edit';
      if (options.signOff) command += ' --signoff';
      if (options.author) command += ` --author="${options.author}"`;
      if (options.date) command += ` --date="${options.date.toISOString()}"`;
      if (this.config.gpgSigningKey) command += ' --gpg-sign';
      
      await this.executeGitCommand(command);
      
      const commit = await this.getLastCommit();
      this.logger.info(`Commit created: ${commit.shortHash} - ${commit.subject}`);
      this.emit('commit-created', commit);
      
      return commit;
    } catch (error) {
      this.logger.error(`Failed to commit: ${message}`, error);
      throw error;
    }
  }

  /**
   * Push changes
   */
  async push(remote: string = 'origin', branch?: string, options: GitOperationOptions & {
    setUpstream?: boolean;
    force?: boolean;
    tags?: boolean;
  } = {}): Promise<void> {
    try {
      let command = `git push ${remote}`;
      
      if (branch) command += ` ${branch}`;
      if (options.setUpstream) command += ' --set-upstream';
      if (options.force) command += ' --force';
      if (options.tags) command += ' --tags';
      if (options.quiet) command += ' --quiet';
      if (options.verbose) command += ' --verbose';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Changes pushed to ${remote}${branch ? `/${branch}` : ''}`);
      this.emit('changes-pushed', { remote, branch });
      
    } catch (error) {
      this.logger.error(`Failed to push to ${remote}:`, error);
      throw error;
    }
  }

  /**
   * Pull changes
   */
  async pull(remote: string = 'origin', branch?: string, options: GitOperationOptions & {
    rebase?: boolean;
    noCommit?: boolean;
    strategy?: 'ours' | 'theirs' | 'recursive';
  } = {}): Promise<void> {
    try {
      let command = `git pull ${remote}`;
      
      if (branch) command += ` ${branch}`;
      if (options.rebase) command += ' --rebase';
      if (options.noCommit) command += ' --no-commit';
      if (options.strategy) command += ` --strategy=${options.strategy}`;
      if (options.quiet) command += ' --quiet';
      if (options.verbose) command += ' --verbose';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Changes pulled from ${remote}${branch ? `/${branch}` : ''}`);
      this.emit('changes-pulled', { remote, branch });
      
    } catch (error) {
      this.logger.error(`Failed to pull from ${remote}:`, error);
      throw error;
    }
  }

  /**
   * Fetch changes
   */
  async fetch(remote: string = 'origin', options: GitOperationOptions & {
    all?: boolean;
    prune?: boolean;
    tags?: boolean;
  } = {}): Promise<void> {
    try {
      let command = `git fetch ${remote}`;
      
      if (options.all) command = 'git fetch --all';
      if (options.prune) command += ' --prune';
      if (options.tags) command += ' --tags';
      if (options.quiet) command += ' --quiet';
      if (options.verbose) command += ' --verbose';
      
      await this.executeGitCommand(command);
      
      this.logger.debug(`Fetched from ${remote}`);
      this.emit('changes-fetched', { remote });
      
    } catch (error) {
      this.logger.error(`Failed to fetch from ${remote}:`, error);
      throw error;
    }
  }

  /**
   * Create branch
   */
  async createBranch(branchName: string, startPoint?: string, options: GitOperationOptions & {
    checkout?: boolean;
    force?: boolean;
  } = {}): Promise<void> {
    try {
      let command = `git branch ${branchName}`;
      
      if (startPoint) command += ` ${startPoint}`;
      if (options.force) command += ' --force';
      
      await this.executeGitCommand(command);
      
      if (options.checkout) {
        await this.checkout(branchName);
      }
      
      this.logger.info(`Branch created: ${branchName}`);
      this.emit('branch-created', { branchName, startPoint, checkout: options.checkout });
      
    } catch (error) {
      this.logger.error(`Failed to create branch ${branchName}:`, error);
      throw error;
    }
  }

  /**
   * Delete branch
   */
  async deleteBranch(branchName: string, options: GitOperationOptions & {
    force?: boolean;
    remote?: boolean;
  } = {}): Promise<void> {
    try {
      let command = options.remote 
        ? `git push origin --delete ${branchName}`
        : `git branch ${options.force ? '-D' : '-d'} ${branchName}`;
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Branch deleted: ${branchName} (${options.remote ? 'remote' : 'local'})`);
      this.emit('branch-deleted', { branchName, remote: options.remote });
      
    } catch (error) {
      this.logger.error(`Failed to delete branch ${branchName}:`, error);
      throw error;
    }
  }

  /**
   * Checkout branch or commit
   */
  async checkout(target: string, options: GitOperationOptions & {
    createBranch?: boolean;
    force?: boolean;
    track?: boolean;
  } = {}): Promise<void> {
    try {
      let command = `git checkout ${target}`;
      
      if (options.createBranch) command += ' -b';
      if (options.force) command += ' --force';
      if (options.track) command += ' --track';
      if (options.quiet) command += ' --quiet';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Checked out: ${target}`);
      this.emit('checked-out', { target, options });
      
    } catch (error) {
      this.logger.error(`Failed to checkout ${target}:`, error);
      throw error;
    }
  }

  /**
   * Merge branch
   */
  async merge(branch: string, options: GitOperationOptions & {
    noCommit?: boolean;
    noFastForward?: boolean;
    strategy?: 'ours' | 'theirs' | 'recursive';
    message?: string;
  } = {}): Promise<GitMergeResult> {
    try {
      let command = `git merge ${branch}`;
      
      if (options.noCommit) command += ' --no-commit';
      if (options.noFastForward) command += ' --no-ff';
      if (options.strategy) command += ` --strategy=${options.strategy}`;
      if (options.message) command += ` -m "${options.message.replace(/"/g, '\\"')}"`;
      if (options.quiet) command += ' --quiet';
      
      try {
        await this.executeGitCommand(command);
        
        const result: GitMergeResult = {
          success: true,
          conflicts: [],
          mergedFiles: await this.getMergedFiles(),
          conflictedFiles: [],
          message: 'Merge completed successfully'
        };
        
        this.logger.info(`Merged branch: ${branch}`);
        this.emit('merge-completed', { branch, result });
        
        return result;
      } catch (error) {
        // Check if it's a merge conflict
        const conflicts = await this.getConflicts();
        
        const result: GitMergeResult = {
          success: false,
          conflicts,
          mergedFiles: [],
          conflictedFiles: conflicts.map(c => c.path),
          message: `Merge conflicts detected in ${conflicts.length} files`
        };
        
        this.logger.warn(`Merge conflicts detected: ${branch}`);
        this.emit('merge-conflicts', { branch, conflicts });
        
        return result;
      }
    } catch (error) {
      this.logger.error(`Failed to merge branch ${branch}:`, error);
      throw error;
    }
  }

  /**
   * Rebase branch
   */
  async rebase(upstream: string, options: GitOperationOptions & {
    interactive?: boolean;
    preserve?: boolean;
    continue?: boolean;
    abort?: boolean;
    skip?: boolean;
  } = {}): Promise<void> {
    try {
      let command = `git rebase ${upstream}`;
      
      if (options.interactive) command += ' --interactive';
      if (options.preserve) command += ' --preserve-merges';
      if (options.continue) command = 'git rebase --continue';
      if (options.abort) command = 'git rebase --abort';
      if (options.skip) command = 'git rebase --skip';
      if (options.quiet) command += ' --quiet';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Rebased onto: ${upstream}`);
      this.emit('rebase-completed', { upstream });
      
    } catch (error) {
      this.logger.error(`Failed to rebase onto ${upstream}:`, error);
      throw error;
    }
  }

  /**
   * Create tag
   */
  async createTag(tagName: string, options: GitOperationOptions & {
    message?: string;
    annotated?: boolean;
    commit?: string;
    force?: boolean;
  } = {}): Promise<void> {
    try {
      let command = `git tag`;
      
      if (options.annotated && options.message) {
        command += ` -a ${tagName} -m "${options.message.replace(/"/g, '\\"')}"`;
      } else {
        command += ` ${tagName}`;
      }
      
      if (options.commit) command += ` ${options.commit}`;
      if (options.force) command += ' --force';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Tag created: ${tagName}`);
      this.emit('tag-created', { tagName, message: options.message });
      
    } catch (error) {
      this.logger.error(`Failed to create tag ${tagName}:`, error);
      throw error;
    }
  }

  /**
   * Delete tag
   */
  async deleteTag(tagName: string, options: GitOperationOptions & {
    remote?: boolean;
  } = {}): Promise<void> {
    try {
      const command = options.remote 
        ? `git push origin --delete tag ${tagName}`
        : `git tag -d ${tagName}`;
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Tag deleted: ${tagName} (${options.remote ? 'remote' : 'local'})`);
      this.emit('tag-deleted', { tagName, remote: options.remote });
      
    } catch (error) {
      this.logger.error(`Failed to delete tag ${tagName}:`, error);
      throw error;
    }
  }

  /**
   * Create stash
   */
  async stash(message?: string, options: GitOperationOptions & {
    includeUntracked?: boolean;
    keepIndex?: boolean;
    patch?: boolean;
  } = {}): Promise<void> {
    try {
      let command = 'git stash push';
      
      if (message) command += ` -m "${message.replace(/"/g, '\\"')}"`;
      if (options.includeUntracked) command += ' --include-untracked';
      if (options.keepIndex) command += ' --keep-index';
      if (options.patch) command += ' --patch';
      if (options.quiet) command += ' --quiet';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Stash created: ${message || 'WIP'}`);
      this.emit('stash-created', { message });
      
    } catch (error) {
      this.logger.error('Failed to create stash:', error);
      throw error;
    }
  }

  /**
   * Apply stash
   */
  async applyStash(stashIndex: number = 0, options: GitOperationOptions & {
    pop?: boolean;
    keepIndex?: boolean;
  } = {}): Promise<void> {
    try {
      const stashRef = `stash@{${stashIndex}}`;
      let command = options.pop ? `git stash pop ${stashRef}` : `git stash apply ${stashRef}`;
      
      if (options.keepIndex) command += ' --keep-index';
      if (options.quiet) command += ' --quiet';
      
      await this.executeGitCommand(command);
      
      this.logger.info(`Stash ${options.pop ? 'popped' : 'applied'}: ${stashRef}`);
      this.emit('stash-applied', { stashIndex, pop: options.pop });
      
    } catch (error) {
      this.logger.error(`Failed to apply stash ${stashIndex}:`, error);
      throw error;
    }
  }

  /**
   * Get commit log
   */
  async getLog(options: {
    maxCount?: number;
    since?: Date;
    until?: Date;
    author?: string;
    grep?: string;
    oneline?: boolean;
  } = {}): Promise<GitCommit[]> {
    try {
      let command = 'git log --pretty=format:"%H|%h|%an|%ae|%ad|%cn|%ce|%cd|%s|%b" --date=iso';
      
      if (options.maxCount) command += ` -n ${options.maxCount}`;
      if (options.since) command += ` --since="${options.since.toISOString()}"`;
      if (options.until) command += ` --until="${options.until.toISOString()}"`;
      if (options.author) command += ` --author="${options.author}"`;
      if (options.grep) command += ` --grep="${options.grep}"`;
      if (options.oneline) command += ' --oneline';
      
      const { stdout } = await this.executeGitCommand(command);
      return this.parseCommitLog(stdout);
    } catch (error) {
      this.logger.error('Failed to get commit log:', error);
      throw error;
    }
  }

  /**
   * Get diff
   */
  async getDiff(options: {
    staged?: boolean;
    commit1?: string;
    commit2?: string;
    files?: string[];
    contextLines?: number;
  } = {}): Promise<GitDiff> {
    try {
      let command = 'git diff';
      
      if (options.staged) command += ' --staged';
      if (options.commit1 && options.commit2) {
        command += ` ${options.commit1}..${options.commit2}`;
      } else if (options.commit1) {
        command += ` ${options.commit1}`;
      }
      
      if (options.contextLines) command += ` --context=${options.contextLines}`;
      if (options.files) command += ` -- ${options.files.join(' ')}`;
      
      const { stdout } = await this.executeGitCommand(command);
      return this.parseDiff(stdout);
    } catch (error) {
      this.logger.error('Failed to get diff:', error);
      throw error;
    }
  }

  /**
   * Resolve merge conflicts
   */
  async resolveConflict(filePath: string, resolution: 'ours' | 'theirs' | 'custom', customContent?: string): Promise<void> {
    try {
      if (resolution === 'custom' && customContent !== undefined) {
        // Write custom resolution
        await fs.writeFile(path.join(this.config.repositoryPath, filePath), customContent, 'utf8');
      } else {
        // Use Git's conflict resolution
        const strategy = resolution === 'ours' ? '--ours' : '--theirs';
        await this.executeGitCommand(`git checkout ${strategy} -- ${filePath}`);
      }
      
      // Stage the resolved file
      await this.add(filePath);
      
      this.logger.info(`Conflict resolved: ${filePath} (${resolution})`);
      this.emit('conflict-resolved', { filePath, resolution });
      
    } catch (error) {
      this.logger.error(`Failed to resolve conflict in ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get file blame/annotate
   */
  async blame(filePath: string, options: {
    startLine?: number;
    endLine?: number;
    revision?: string;
  } = {}): Promise<GitBlameResult[]> {
    try {
      let command = `git blame ${filePath}`;
      
      if (options.startLine && options.endLine) {
        command += ` -L ${options.startLine},${options.endLine}`;
      }
      if (options.revision) command += ` ${options.revision}`;
      
      const { stdout } = await this.executeGitCommand(command);
      return this.parseBlame(stdout);
    } catch (error) {
      this.logger.error(`Failed to get blame for ${filePath}:`, error);
      throw error;
    }
  }

  // Private helper methods

  private async executeGitCommand(command: string, options: {
    timeout?: number;
    retries?: number;
  } = {}): Promise<{ stdout: string; stderr: string }> {
    const timeout = options.timeout || this.config.timeout || 30000;
    const maxRetries = options.retries || this.config.maxRetries || 3;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Executing Git command (attempt ${attempt}): ${command}`);
        
        const result = await exec(command, {
          cwd: this.config.repositoryPath,
          timeout,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: this.config.userName,
            GIT_AUTHOR_EMAIL: this.config.userEmail,
            GIT_COMMITTER_NAME: this.config.userName,
            GIT_COMMITTER_EMAIL: this.config.userEmail
          }
        });
        
        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.debug(`Git command failed (attempt ${attempt}): ${error}`);
        
        if (attempt < maxRetries) {
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  private async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await this.executeGitCommand('git branch --show-current');
      return stdout.trim();
    } catch (error) {
      // Fallback for older Git versions
      const { stdout } = await this.executeGitCommand('git rev-parse --abbrev-ref HEAD');
      return stdout.trim();
    }
  }

  private async getStatus(): Promise<GitFileStatus[]> {
    try {
      const { stdout } = await this.executeGitCommand('git status --porcelain=v1');
      return this.parseStatus(stdout);
    } catch (error) {
      this.logger.error('Failed to get status:', error);
      return [];
    }
  }

  private async getRemotes(): Promise<GitRemote[]> {
    try {
      const { stdout } = await this.executeGitCommand('git remote -v');
      return this.parseRemotes(stdout);
    } catch (error) {
      this.logger.error('Failed to get remotes:', error);
      return [];
    }
  }

  private async getBranches(): Promise<GitBranch[]> {
    try {
      const { stdout } = await this.executeGitCommand('git branch -vv');
      return this.parseBranches(stdout);
    } catch (error) {
      this.logger.error('Failed to get branches:', error);
      return [];
    }
  }

  private async getTags(): Promise<GitTag[]> {
    try {
      const { stdout } = await this.executeGitCommand('git tag -l --format="%(refname:short)|%(objectname)|%(contents)|%(creatordate)"');
      return this.parseTags(stdout);
    } catch (error) {
      this.logger.error('Failed to get tags:', error);
      return [];
    }
  }

  private async getStashes(): Promise<GitStash[]> {
    try {
      const { stdout } = await this.executeGitCommand('git stash list --format="%gd|%s|%gD"');
      return this.parseStashes(stdout);
    } catch (error) {
      this.logger.error('Failed to get stashes:', error);
      return [];
    }
  }

  private async getLastCommit(): Promise<GitCommit> {
    try {
      const commits = await this.getLog({ maxCount: 1 });
      return commits[0];
    } catch (error) {
      this.logger.error('Failed to get last commit:', error);
      throw error;
    }
  }

  private async getAheadBehind(): Promise<{ ahead: number; behind: number }> {
    try {
      const { stdout } = await this.executeGitCommand('git rev-list --count --left-right @{upstream}...HEAD');
      const [behind, ahead] = stdout.trim().split('\t').map(Number);
      return { ahead: ahead || 0, behind: behind || 0 };
    } catch (error) {
      // No upstream branch set
      return { ahead: 0, behind: 0 };
    }
  }

  private async getMergedFiles(): Promise<string[]> {
    try {
      const { stdout } = await this.executeGitCommand('git diff --name-only HEAD~1 HEAD');
      return stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  private async getConflicts(): Promise<GitConflict[]> {
    try {
      const { stdout } = await this.executeGitCommand('git diff --name-only --diff-filter=U');
      const conflictedFiles = stdout.trim().split('\n').filter(Boolean);
      
      const conflicts: GitConflict[] = [];
      for (const filePath of conflictedFiles) {
        const conflict = await this.parseConflictFile(filePath);
        conflicts.push(conflict);
      }
      
      return conflicts;
    } catch (error) {
      this.logger.error('Failed to get conflicts:', error);
      return [];
    }
  }

  private async parseConflictFile(filePath: string): Promise<GitConflict> {
    try {
      const fullPath = path.join(this.config.repositoryPath, filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      const lines = content.split('\n');
      
      const markers: GitConflictMarker[] = [];
      let currentMarker: Partial<GitConflictMarker> | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('<<<<<<<')) {
          currentMarker = { type: 'ours', startLine: i + 1, content: '' };
        } else if (line.startsWith('=======')) {
          if (currentMarker) {
            markers.push(currentMarker as GitConflictMarker);
            currentMarker = { type: 'theirs', startLine: i + 1, content: '' };
          }
        } else if (line.startsWith('>>>>>>>')) {
          if (currentMarker) {
            currentMarker.endLine = i;
            markers.push(currentMarker as GitConflictMarker);
            currentMarker = null;
          }
        } else if (currentMarker) {
          currentMarker.content += line + '\n';
        }
      }
      
      return {
        path: filePath,
        type: 'content',
        markers,
        resolved: false
      };
    } catch (error) {
      this.logger.error(`Failed to parse conflict file ${filePath}:`, error);
      return {
        path: filePath,
        type: 'content',
        markers: [],
        resolved: false
      };
    }
  }

  private parseStatus(output: string): GitFileStatus[] {
    const status: GitFileStatus[] = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      if (line.length < 3) continue;
      
      const indexStatus = line[0];
      const workingTreeStatus = line[1];
      const filePath = line.substring(3);
      
      let originalPath: string | undefined;
      let currentPath = filePath;
      
      // Handle renamed files
      if (filePath.includes(' -> ')) {
        const [oldPath, newPath] = filePath.split(' -> ');
        originalPath = oldPath;
        currentPath = newPath;
      }
      
      status.push({
        path: currentPath,
        workingTree: this.mapFileState(workingTreeStatus),
        index: this.mapFileState(indexStatus),
        originalPath
      });
    }
    
    return status;
  }

  private mapFileState(status: string): GitFileState {
    switch (status) {
      case 'M': return 'modified';
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case '?': return 'untracked';
      case '!': return 'ignored';
      case 'U': return 'unmerged';
      case ' ': return 'unmodified';
      default: return 'unmodified';
    }
  }

  private parseRemotes(output: string): GitRemote[] {
    const remotes: GitRemote[] = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const match = line.match(/^(\w+)\s+(.+)\s+\((\w+)\)$/);
      if (match) {
        const [, name, url, type] = match;
        remotes.push({
          name,
          url,
          type: type as 'fetch' | 'push'
        });
      }
    }
    
    return remotes;
  }

  private parseBranches(output: string): GitBranch[] {
    const branches: GitBranch[] = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const current = line.startsWith('*');
      const cleanLine = line.replace(/^\*?\s+/, '');
      const parts = cleanLine.split(/\s+/);
      
      if (parts.length >= 2) {
        const name = parts[0];
        const lastCommit = parts[1];
        
        // Parse upstream information
        const upstreamMatch = cleanLine.match(/\[([^\]]+)\]/);
        let upstream: string | undefined;
        let ahead = 0;
        let behind = 0;
        
        if (upstreamMatch) {
          const upstreamInfo = upstreamMatch[1];
          const aheadMatch = upstreamInfo.match(/ahead (\d+)/);
          const behindMatch = upstreamInfo.match(/behind (\d+)/);
          
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
          
          upstream = upstreamInfo.split(':')[0];
        }
        
        branches.push({
          name,
          current,
          lastCommit,
          upstream,
          ahead,
          behind
        });
      }
    }
    
    return branches;
  }

  private parseTags(output: string): GitTag[] {
    const tags: GitTag[] = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        const [name, commit, message, dateStr] = parts;
        tags.push({
          name,
          commit,
          message: message || undefined,
          date: new Date(dateStr),
          annotated: !!message
        });
      }
    }
    
    return tags;
  }

  private parseStashes(output: string): GitStash[] {
    const stashes: GitStash[] = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const [indexStr, message, dateStr] = parts;
        const indexMatch = indexStr.match(/stash@\{(\d+)\}/);
        
        if (indexMatch) {
          stashes.push({
            index: parseInt(indexMatch[1], 10),
            message,
            branch: '', // Would need additional parsing
            date: new Date(dateStr),
            files: [] // Would need additional command
          });
        }
      }
    }
    
    return stashes;
  }

  private parseCommitLog(output: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const entries = output.trim().split('\n\n').filter(Boolean);
    
    for (const entry of entries) {
      const lines = entry.split('\n');
      const mainLine = lines[0];
      const body = lines.slice(1).join('\n').trim();
      
      const parts = mainLine.split('|');
      if (parts.length >= 9) {
        const [hash, shortHash, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, subject] = parts;
        
        commits.push({
          hash,
          shortHash,
          author: {
            name: authorName,
            email: authorEmail,
            date: new Date(authorDate)
          },
          committer: {
            name: committerName,
            email: committerEmail,
            date: new Date(committerDate)
          },
          message: subject + (body ? '\n\n' + body : ''),
          subject,
          body: body || undefined,
          date: new Date(authorDate),
          files: [], // Would need additional parsing with --name-status
          stats: { files: 0, insertions: 0, deletions: 0 },
          parents: [], // Would need additional parsing
          refs: [] // Would need additional parsing
        });
      }
    }
    
    return commits;
  }

  private parseDiff(output: string): GitDiff {
    // Simplified diff parsing - in production, use a proper diff parser
    const lines = output.split('\n');
    const files: GitDiffFile[] = [];
    let stats = { files: 0, insertions: 0, deletions: 0 };
    
    // Parse stats line if present
    const statsLine = lines.find(line => line.includes('file') && line.includes('changed'));
    if (statsLine) {
      const filesMatch = statsLine.match(/(\d+) files? changed/);
      const insertionsMatch = statsLine.match(/(\d+) insertions?/);
      const deletionsMatch = statsLine.match(/(\d+) deletions?/);
      
      stats = {
        files: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        insertions: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
        deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0
      };
    }
    
    return {
      files,
      stats,
      patch: output
    };
  }

  private parseBlame(output: string): GitBlameResult[] {
    const results: GitBlameResult[] = [];
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([a-f0-9]+)\s+\((.+?)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+[+-]\d{4}\s+(\d+)\)\s*(.*)$/);
      if (match) {
        const [, commit, author, date, lineNumber, content] = match;
        results.push({
          commit: commit.substring(0, 8),
          author: author.trim(),
          date: new Date(date),
          lineNumber: parseInt(lineNumber, 10),
          content
        });
      }
    }
    
    return results;
  }

  private async setConfig(key: string, value: string): Promise<void> {
    await this.executeGitCommand(`git config ${key} "${value.replace(/"/g, '\\"')}"`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register Git workflow
   */
  registerWorkflow(workflow: GitWorkflow): void {
    this.workflows.set(workflow.id, workflow);
    this.logger.info(`Workflow registered: ${workflow.name}`);
    this.emit('workflow-registered', workflow);
  }

  /**
   * Execute Git workflow
   */
  async executeWorkflow(workflowId: string, context: Record<string, any> = {}): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    this.logger.info(`Executing workflow: ${workflow.name}`);
    this.emit('workflow-started', workflow);

    try {
      // Check conditions
      for (const condition of workflow.conditions) {
        if (!await this.checkWorkflowCondition(condition, context)) {
          throw new Error(`Workflow condition failed: ${condition.type}`);
        }
      }

      // Execute steps
      for (const step of workflow.steps) {
        try {
          await this.executeWorkflowStep(step, context);
          this.emit('workflow-step-completed', workflow, step);
        } catch (error) {
          this.emit('workflow-step-failed', workflow, step, error);
          
          if (!step.continueOnError) {
            throw error;
          }
        }
      }

      this.logger.info(`Workflow completed: ${workflow.name}`);
      this.emit('workflow-completed', workflow);

    } catch (error) {
      this.logger.error(`Workflow failed: ${workflow.name}`, error);
      this.emit('workflow-failed', workflow, error);
      throw error;
    }
  }

  /**
   * Install Git hook
   */
  async installHook(hook: GitHook): Promise<void> {
    try {
      const hooksDir = path.join(this.config.repositoryPath, '.git', 'hooks');
      const hookPath = path.join(hooksDir, hook.name);
      
      // Ensure hooks directory exists
      await fs.mkdir(hooksDir, { recursive: true });
      
      // Write hook script
      let script = hook.script;
      if (hook.language === 'node') {
        script = `#!/usr/bin/env node\n${script}`;
      } else if (hook.language === 'python') {
        script = `#!/usr/bin/env python3\n${script}`;
      } else {
        script = `#!/bin/bash\n${script}`;
      }
      
      await fs.writeFile(hookPath, script, { mode: 0o755 });
      
      this.hooks.set(hook.name, hook);
      this.logger.info(`Git hook installed: ${hook.name}`);
      this.emit('hook-installed', hook);
      
    } catch (error) {
      this.logger.error(`Failed to install hook ${hook.name}:`, error);
      throw error;
    }
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats(): Promise<GitRepositoryStats> {
    try {
      const [commits, contributors, branches, tags] = await Promise.all([
        this.executeGitCommand('git rev-list --count HEAD').then(r => parseInt(r.stdout.trim(), 10)),
        this.executeGitCommand('git shortlog -sn').then(r => r.stdout.trim().split('\n').length),
        this.executeGitCommand('git branch -r').then(r => r.stdout.trim().split('\n').filter(Boolean).length),
        this.executeGitCommand('git tag').then(r => r.stdout.trim().split('\n').filter(Boolean).length)
      ]);

      return {
        totalCommits: commits,
        totalContributors: contributors,
        totalBranches: branches,
        totalTags: tags,
        repositorySize: await this.getRepositorySize(),
        lastActivity: await this.getLastActivity()
      };
    } catch (error) {
      this.logger.error('Failed to get repository stats:', error);
      throw error;
    }
  }

  private async checkWorkflowCondition(condition: GitWorkflowCondition, context: Record<string, any>): Promise<boolean> {
    switch (condition.type) {
      case 'branch_exists':
        const branchName = condition.parameters?.branch || context.branch;
        const branches = await this.getBranches();
        return branches.some(b => b.name === branchName);
        
      case 'clean_working_tree':
        const status = await this.getStatus();
        return status.length === 0;
        
      case 'no_conflicts':
        const conflicts = await this.getConflicts();
        return conflicts.length === 0;
        
      default:
        return true;
    }
  }

  private async executeWorkflowStep(step: GitWorkflowStep, context: Record<string, any>): Promise<void> {
    const timeout = step.timeout || 30000;
    
    switch (step.action) {
      case 'checkout':
        await this.checkout(step.parameters.target || context.branch);
        break;
        
      case 'pull':
        await this.pull(step.parameters.remote, step.parameters.branch);
        break;
        
      case 'commit':
        await this.commit(step.parameters.message || context.message);
        break;
        
      case 'push':
        await this.push(step.parameters.remote, step.parameters.branch);
        break;
        
      case 'merge':
        await this.merge(step.parameters.branch);
        break;
        
      case 'tag':
        await this.createTag(step.parameters.name, step.parameters);
        break;
        
      default:
        throw new Error(`Unknown workflow action: ${step.action}`);
    }
  }

  private async getRepositorySize(): Promise<number> {
    try {
      const { stdout } = await this.executeGitCommand('git count-objects -vH');
      const sizeMatch = stdout.match(/size-pack (\d+)/);
      return sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  private async getLastActivity(): Promise<Date> {
    try {
      const { stdout } = await this.executeGitCommand('git log -1 --format=%cd --date=iso');
      return new Date(stdout.trim());
    } catch {
      return new Date();
    }
  }
}

// Supporting interfaces
interface GitOperation {
  id: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: Error;
}

interface GitBlameResult {
  commit: string;
  author: string;
  date: Date;
  lineNumber: number;
  content: string;
}

interface GitRepositoryStats {
  totalCommits: number;
  totalContributors: number;
  totalBranches: number;
  totalTags: number;
  repositorySize: number;
  lastActivity: Date;
}