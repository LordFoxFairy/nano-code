/**
 * NanoCode - Open-source, local-first AI coding agent framework
 */

// Phase 1.0 - Skill Discovery
export { SkillLoader, SkillsContext, PromptInjector } from './core/skills/index.js';
export { parseFrontmatter, hasFrontmatter } from './core/utils/index.js';

// Phase 1.1 - Preprocessing & Routing
export { Preprocessor, SemanticRouter } from './core/routing/index.js';

// Phase 2 - Hook System
export { HookMatcher, HookExecutor, HookRegistry } from './core/hooks/index.js';

export type * from './types/index.js';
