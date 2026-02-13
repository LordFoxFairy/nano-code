/**
 * Middleware modules for NanoCode
 *
 * These middlewares integrate with deepagents framework middleware system
 * to provide additional functionality like stop validation and tool restriction.
 */

export {
  StopValidationConfig,
  ValidationResult,
  runStopValidationChecks,
  allValidationsPassed,
  formatValidationResults,
  DEFAULT_STOP_VALIDATION_CONFIG,
} from './stop-validation.js';

export {
  ToolRestrictionConfig,
  ToolRestrictionResult,
  isToolAllowed,
  filterTools,
  createToolRestrictionMiddleware,
  formatAllowedTools,
  parseAllowedTools,
} from './tool-restriction.js';

export {
  ToolCallLogEntry,
  PreToolUseHook,
  PostToolUseHook,
  ToolHooksConfig,
  getToolHooksState,
  createToolHooksMiddleware,
  securityValidationHook,
  createRateLimitHook,
  truncateResultHook,
  addMetadataHook,
  createDefaultToolHooksMiddleware,
} from './tool-hooks.js';
