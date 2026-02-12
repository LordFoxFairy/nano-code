/**
 * Human-in-the-Loop (HITL) Types
 * Defines structures for approval workflows
 */

/**
 * Type of preview content for approval
 */
export type PreviewType = 'diff' | 'command' | 'content' | 'json';

/**
 * Preview data for the approval prompt
 */
export interface ApprovalPreview {
  /** Type of preview */
  type: PreviewType;
  /** Preview content */
  data: string;
  /** Optional file path */
  filePath?: string;
}

/**
 * Request for human approval
 */
export interface ApprovalRequest {
  /** Unique request identifier */
  id: string;
  /** Tool requesting approval */
  toolName: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Request timestamp */
  timestamp: number;
  /** Optional preview of changes */
  preview?: ApprovalPreview;
}

/**
 * User's response to an approval request
 */
export interface ApprovalResult {
  /** Whether the action was approved */
  approved: boolean;
  /** Whether arguments were edited */
  edited?: boolean;
  /** Edited arguments if modified */
  editedArgs?: Record<string, unknown>;
  /** Optional rejection reason */
  reason?: string;
}

/**
 * Tools that require HITL approval by default
 */
export const DEFAULT_HITL_TOOLS = ['write_file', 'edit_file', 'execute', 'delete_file'] as const;

/**
 * Configuration for HITL behavior
 */
export interface HITLConfig {
  /** Enable/disable HITL globally */
  enabled: boolean;
  /** Tools requiring approval (true = require, false = skip) */
  tools: Record<string, boolean>;
  /** Auto-approve certain patterns */
  autoApprovePatterns?: RegExp[];
}
