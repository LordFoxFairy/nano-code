export type PermissionLevel = 'ask' | 'allow' | 'deny';

export type PermissionScope = 'global' | 'project';

export interface PermissionRuleConfig {
  tool: string;
  arguments?: string; // glob pattern for arguments
  level: PermissionLevel;
}

export interface PermissionConfig {
  rules: PermissionRuleConfig[];
}

export interface PermissionRequest {
  tool: string;
  arguments: Record<string, unknown>;
}
