/**
 * NanoCode Type Definitions
 */

// Skill Types
export interface SkillFrontmatter {
  name: string;
  description: string;
  'allowed-tools'?: string;
  'disable-model-invocation'?: boolean;
}

export interface Skill {
  name: string;
  path: string;
  frontmatter: SkillFrontmatter;
  content: string;
}

// Command Types
export interface CommandFrontmatter {
  name?: string;
  description: string;
  'allowed-tools'?: string;
}

export interface Command {
  name: string;
  path: string;
  frontmatter: CommandFrontmatter;
  content: string;
}

// Agent Types
export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string;
  model?: 'haiku' | 'sonnet' | 'opus' | 'inherit';
  color?: string;
}

export interface Agent {
  name: string;
  path: string;
  skillName: string; // For namespace isolation
  frontmatter: AgentFrontmatter;
  content: string;
}

// Hook Types
export interface HookConfig {
  type: 'command';
  command: string;
}

export interface HookMatcher {
  hooks: HookConfig[];
  matcher: string;
}

export interface HooksJson {
  description?: string;
  hooks: {
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
    Stop?: HookMatcher[];
    UserPromptSubmit?: HookMatcher[];
    SessionStart?: HookMatcher[];
  };
}

// Hook Execution
export interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface HookResult {
  allowed: boolean;
  message?: string;
}

// Loader Result Types
export interface SkillLoaderResult {
  skills: Skill[];
  commands: Map<string, Command[]>;
  agents: Map<string, Agent[]>;
  hooks: Map<string, HooksJson>;
}
