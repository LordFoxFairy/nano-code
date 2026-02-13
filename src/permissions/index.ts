import { PermissionManager } from './manager.js';

let permissionManagerInstance: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager();
  }
  return permissionManagerInstance;
}

export * from './types.js';
export * from './rules.js';
export * from './manager.js';
export * from './command-handler.js';
