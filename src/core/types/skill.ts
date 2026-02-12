/**
 * Skill System Types
 *
 * NOTE: Most skill types are provided by deepagents framework.
 * This file only contains types that are specific to NanoCode's extensions.
 *
 * For deepagents skill types, see:
 * - SkillMetadata (from deepagents)
 * - SkillsMiddlewareOptions (from deepagents)
 *
 * @deprecated RouterMode should be imported from '../config/types.js' instead.
 * This re-export is kept for backward compatibility.
 */

// Re-export RouterMode from config for backward compatibility
// TODO: Update loader.ts and agent.ts to import from config/types.ts directly
export { RouterMode } from '../config/types.js';
