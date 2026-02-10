/**
 * Utility Functions
 */

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get environment variable with default value
 */
export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Get SKILL_ROOT path
 */
export function getSkillRoot(): string {
  return getEnv('SKILL_ROOT', '.agents/skills');
}
