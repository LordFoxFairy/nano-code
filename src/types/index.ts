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
// Loader Result Types
export interface SkillLoaderResult {
  skills: Skill[];
  commands: Map<string, Command[]>;
  agents: Map<string, Agent[]>;
  hooks: Map<string, HooksJson>;
}

// Preprocessor Types (Phase 1.1)
export interface CommandInstruction {
  /** skill name or shell command */
  name: string;
  /** parsed arguments */
  args: string[];
  /** instruction type */
  type: 'skill' | 'shell';
  /** original string before parsing */
  originalString: string;
}

export interface FileReference {
  /** original @path token */
  token: string;
  /** resolved file path */
  path: string;
  /** file content (null if not yet loaded) */
  content: string | null;
}

export interface PreprocessingResult {
  /** original text with instructions removed */
  cleanedContent: string;
  /** extracted command instructions */
  commands: CommandInstruction[];
  /** extracted file references */
  fileReferences: FileReference[];
  /** true if input consists entirely of commands */
  shouldHaltConversation: boolean;
}

// SkillsContext Types (Phase 1.1)
export interface SkillsContextConfig {
  /** Base directory for skills discovery */
  skillsDir?: string;
  /** Whether to use L1 (metadata only) or L2 (full content) injection */
  injectionLevel?: 'L1' | 'L2';
}

export interface SkillMatch {
  /** Matched skill */
  skill: Skill;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for match */
  reason?: string;
}

// SemanticRouter Types (Phase 1.1)

/**
 * LLM Provider interface for semantic routing
 * This allows pluggable LLM backends (Claude, OpenAI, local models, etc.)
 */
export interface LLMProvider {
  /**
   * Generate a completion from the LLM
   * @param prompt The prompt to send
   * @param options Optional configuration
   * @returns The LLM response text
   */
  complete(prompt: string, options?: LLMCompletionOptions): Promise<string>;
}

export interface LLMCompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

export interface SemanticRouterConfig {
  /** LLM provider for intent recognition */
  llmProvider?: LLMProvider;
  /** Minimum confidence threshold (0-1) for skill activation */
  confidenceThreshold?: number;
  /** Whether to allow multiple skill matches */
  allowMultipleMatches?: boolean;
}

export interface RouterDecision {
  /** Whether a skill should be activated */
  shouldActivate: boolean;
  /** Matched skill (if any) */
  match: SkillMatch | null;
  /** All candidate matches above threshold */
  candidates?: SkillMatch[];
  /** Raw LLM reasoning (for debugging) */
  reasoning?: string;
}
