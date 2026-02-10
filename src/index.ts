/**
 * NanoCode - Open-source, local-first AI coding agent framework
 */

// Phase 1.0 - Skill Discovery
export { SkillLoader } from './core/skill-loader.js';
export { PromptInjector } from './core/prompt-injector.js';
export { parseFrontmatter, hasFrontmatter } from './core/frontmatter.js';

// Phase 1.1 - Preprocessing & Routing
export { Preprocessor } from './core/preprocessor.js';
export { SkillsContext } from './core/skills-context.js';
export { SemanticRouter } from './core/semantic-router.js';

// Phase 2 - Hook System
export { HookMatcher, HookExecutor, HookRegistry } from './core/hooks/index.js';

export type * from './types/index.js';
