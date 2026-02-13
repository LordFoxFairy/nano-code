/**
 * Plan Mode for NanoCode
 *
 * Implements Claude Code's plan mode approach:
 * - Track proposed changes without executing them
 * - Allow user review before execution
 * - Save/load plans from files
 * - Auto-accept edits toggle
 */

import { randomUUID } from 'crypto';
import { homedir } from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Proposed change types
 */
export type ProposedChangeType =
  | 'file_create'
  | 'file_edit'
  | 'file_delete'
  | 'bash_command'
  | 'tool_call';

/**
 * A single proposed change
 */
export interface ProposedChange {
  id: string;
  type: ProposedChangeType;
  description: string;
  timestamp: number;

  // For file operations
  filePath?: string;
  oldContent?: string;
  newContent?: string;

  // For bash commands
  command?: string;
  workingDir?: string;

  // For tool calls
  toolName?: string;
  toolArgs?: Record<string, unknown>;

  // Review status
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  rejectionReason?: string;
}

/**
 * Plan data structure for persistence
 */
export interface PlanData {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  sessionId: string;
  changes: ProposedChange[];
  status: 'draft' | 'reviewing' | 'approved' | 'executed' | 'rejected';
  autoAccept: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Plan mode configuration
 */
export interface PlanModeConfig {
  /** Auto-accept edits without confirmation */
  autoAccept?: boolean;
  /** Plans storage directory */
  plansDir?: string;
  /** Maximum changes to track before auto-compacting */
  maxChanges?: number;
}

/**
 * Plan mode event types
 */
export type PlanModeEvent =
  | 'enter'
  | 'exit'
  | 'change_added'
  | 'change_approved'
  | 'change_rejected'
  | 'plan_saved'
  | 'plan_loaded'
  | 'plan_executed';

export type PlanModeEventHandler = (event: PlanModeEvent, data?: unknown) => void | Promise<void>;

/**
 * Default plans directory
 */
function getDefaultPlansDir(): string {
  return path.join(homedir(), '.nanocode', 'plans');
}

/**
 * PlanMode class manages the planning state for NanoCode
 *
 * When in plan mode:
 * - Tool calls are intercepted and recorded as proposed changes
 * - No actual file modifications or commands are executed
 * - User can review, approve, reject, or edit proposed changes
 * - Plans can be saved/loaded for later review
 */
export class PlanMode {
  private _isActive: boolean = false;
  private _autoAccept: boolean = false;
  private currentPlan: PlanData | null = null;
  private plansDir: string;
  private maxChanges: number;
  private eventHandlers: PlanModeEventHandler[] = [];

  constructor(config: PlanModeConfig = {}) {
    this._autoAccept = config.autoAccept ?? false;
    this.plansDir = config.plansDir ?? getDefaultPlansDir();
    this.maxChanges = config.maxChanges ?? 100;
  }

  // ============================================
  // State Getters
  // ============================================

  /**
   * Check if plan mode is currently active
   */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Check if auto-accept is enabled
   */
  get autoAccept(): boolean {
    return this._autoAccept;
  }

  /**
   * Get the current plan
   */
  get plan(): PlanData | null {
    return this.currentPlan;
  }

  /**
   * Get all pending changes
   */
  get pendingChanges(): ProposedChange[] {
    return this.currentPlan?.changes.filter((c) => c.status === 'pending') ?? [];
  }

  /**
   * Get approved changes
   */
  get approvedChanges(): ProposedChange[] {
    return this.currentPlan?.changes.filter((c) => c.status === 'approved') ?? [];
  }

  /**
   * Get rejected changes
   */
  get rejectedChanges(): ProposedChange[] {
    return this.currentPlan?.changes.filter((c) => c.status === 'rejected') ?? [];
  }

  // ============================================
  // Event Handling
  // ============================================

  /**
   * Register an event handler
   */
  on(handler: PlanModeEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  off(handler: PlanModeEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  private async emit(event: PlanModeEvent, data?: unknown): Promise<void> {
    for (const handler of this.eventHandlers) {
      await handler(event, data);
    }
  }

  // ============================================
  // Plan Mode Control
  // ============================================

  /**
   * Enter plan mode
   */
  async enter(sessionId: string, planName?: string): Promise<void> {
    if (this._isActive) {
      return; // Already in plan mode
    }

    this._isActive = true;

    // Create a new plan
    this.currentPlan = {
      id: randomUUID(),
      name: planName || `Plan ${new Date().toISOString().split('T')[0]}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionId,
      changes: [],
      status: 'draft',
      autoAccept: this._autoAccept,
    };

    await this.emit('enter', this.currentPlan);
  }

  /**
   * Exit plan mode without executing
   */
  async exit(): Promise<void> {
    if (!this._isActive) {
      return;
    }

    this._isActive = false;
    await this.emit('exit', this.currentPlan);
  }

  /**
   * Toggle auto-accept mode
   */
  setAutoAccept(value: boolean): void {
    this._autoAccept = value;
    if (this.currentPlan) {
      this.currentPlan.autoAccept = value;
      this.currentPlan.updatedAt = Date.now();
    }
  }

  // ============================================
  // Change Management
  // ============================================

  /**
   * Add a proposed change to the plan
   */
  async addChange(change: Omit<ProposedChange, 'id' | 'timestamp' | 'status'>): Promise<ProposedChange> {
    if (!this._isActive || !this.currentPlan) {
      throw new Error('Plan mode is not active');
    }

    const proposedChange: ProposedChange = {
      ...change,
      id: randomUUID(),
      timestamp: Date.now(),
      status: 'pending',
    };

    this.currentPlan.changes.push(proposedChange);
    this.currentPlan.updatedAt = Date.now();

    // Auto-compact if too many changes
    if (this.currentPlan.changes.length > this.maxChanges) {
      this.compactChanges();
    }

    await this.emit('change_added', proposedChange);

    return proposedChange;
  }

  /**
   * Add a file creation change
   */
  async addFileCreate(filePath: string, content: string, description?: string): Promise<ProposedChange> {
    return this.addChange({
      type: 'file_create',
      description: description || `Create file: ${filePath}`,
      filePath,
      newContent: content,
    });
  }

  /**
   * Add a file edit change
   */
  async addFileEdit(
    filePath: string,
    oldContent: string,
    newContent: string,
    description?: string,
  ): Promise<ProposedChange> {
    return this.addChange({
      type: 'file_edit',
      description: description || `Edit file: ${filePath}`,
      filePath,
      oldContent,
      newContent,
    });
  }

  /**
   * Add a file delete change
   */
  async addFileDelete(filePath: string, oldContent?: string, description?: string): Promise<ProposedChange> {
    return this.addChange({
      type: 'file_delete',
      description: description || `Delete file: ${filePath}`,
      filePath,
      oldContent,
    });
  }

  /**
   * Add a bash command change
   */
  async addBashCommand(command: string, workingDir?: string, description?: string): Promise<ProposedChange> {
    return this.addChange({
      type: 'bash_command',
      description: description || `Run command: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`,
      command,
      workingDir,
    });
  }

  /**
   * Add a generic tool call change
   */
  async addToolCall(
    toolName: string,
    toolArgs: Record<string, unknown>,
    description?: string,
  ): Promise<ProposedChange> {
    return this.addChange({
      type: 'tool_call',
      description: description || `Call tool: ${toolName}`,
      toolName,
      toolArgs,
    });
  }

  /**
   * Approve a specific change
   */
  async approveChange(changeId: string): Promise<boolean> {
    if (!this.currentPlan) return false;

    const change = this.currentPlan.changes.find((c) => c.id === changeId);
    if (!change || change.status !== 'pending') return false;

    change.status = 'approved';
    this.currentPlan.updatedAt = Date.now();

    await this.emit('change_approved', change);
    return true;
  }

  /**
   * Reject a specific change
   */
  async rejectChange(changeId: string, reason?: string): Promise<boolean> {
    if (!this.currentPlan) return false;

    const change = this.currentPlan.changes.find((c) => c.id === changeId);
    if (!change || change.status !== 'pending') return false;

    change.status = 'rejected';
    change.rejectionReason = reason;
    this.currentPlan.updatedAt = Date.now();

    await this.emit('change_rejected', change);
    return true;
  }

  /**
   * Approve all pending changes
   */
  async approveAll(): Promise<number> {
    if (!this.currentPlan) return 0;

    let count = 0;
    for (const change of this.currentPlan.changes) {
      if (change.status === 'pending') {
        change.status = 'approved';
        count++;
        await this.emit('change_approved', change);
      }
    }

    this.currentPlan.updatedAt = Date.now();
    this.currentPlan.status = 'approved';

    return count;
  }

  /**
   * Reject all pending changes
   */
  async rejectAll(reason?: string): Promise<number> {
    if (!this.currentPlan) return 0;

    let count = 0;
    for (const change of this.currentPlan.changes) {
      if (change.status === 'pending') {
        change.status = 'rejected';
        change.rejectionReason = reason;
        count++;
        await this.emit('change_rejected', change);
      }
    }

    this.currentPlan.updatedAt = Date.now();
    this.currentPlan.status = 'rejected';

    return count;
  }

  /**
   * Compact changes by removing executed and some rejected changes
   */
  private compactChanges(): void {
    if (!this.currentPlan) return;

    // Keep pending and approved, remove old executed/rejected
    const cutoff = Date.now() - 3600000; // 1 hour ago
    this.currentPlan.changes = this.currentPlan.changes.filter(
      (c) => c.status === 'pending' || c.status === 'approved' || c.timestamp > cutoff,
    );
  }

  // ============================================
  // Plan Execution
  // ============================================

  /**
   * Execute all approved changes
   * Returns execution results for each change
   */
  async execute(
    executor: (change: ProposedChange) => Promise<{ success: boolean; result?: string; error?: string }>,
  ): Promise<Array<{ change: ProposedChange; success: boolean; result?: string; error?: string }>> {
    if (!this.currentPlan) {
      return [];
    }

    const results: Array<{ change: ProposedChange; success: boolean; result?: string; error?: string }> = [];

    for (const change of this.currentPlan.changes) {
      if (change.status === 'approved') {
        try {
          const result = await executor(change);
          change.status = 'executed';
          results.push({ change, ...result });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ change, success: false, error });
        }
      }
    }

    this.currentPlan.status = 'executed';
    this.currentPlan.updatedAt = Date.now();

    await this.emit('plan_executed', results);

    return results;
  }

  // ============================================
  // Persistence
  // ============================================

  /**
   * Save the current plan to disk
   */
  async save(name?: string): Promise<string> {
    if (!this.currentPlan) {
      throw new Error('No active plan to save');
    }

    if (name) {
      this.currentPlan.name = name;
    }

    await fs.ensureDir(this.plansDir);

    const planPath = path.join(this.plansDir, `${this.currentPlan.id}.json`);
    await fs.writeJSON(planPath, this.currentPlan, { spaces: 2 });

    await this.emit('plan_saved', this.currentPlan);

    return planPath;
  }

  /**
   * Load a plan from disk
   */
  async load(planId: string): Promise<PlanData | null> {
    const planPath = path.join(this.plansDir, `${planId}.json`);

    try {
      if (await fs.pathExists(planPath)) {
        const planData = await fs.readJSON(planPath);
        this.currentPlan = planData;
        this._isActive = true;
        this._autoAccept = planData.autoAccept ?? false;

        await this.emit('plan_loaded', this.currentPlan);

        return this.currentPlan;
      }
    } catch {
      // Failed to load
    }

    return null;
  }

  /**
   * List all saved plans
   */
  async listPlans(): Promise<Array<{ id: string; name: string; updatedAt: number; changesCount: number }>> {
    await fs.ensureDir(this.plansDir);

    const files = await fs.readdir(this.plansDir);
    const plans: Array<{ id: string; name: string; updatedAt: number; changesCount: number }> = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const planData = await fs.readJSON(path.join(this.plansDir, file));
          plans.push({
            id: planData.id,
            name: planData.name,
            updatedAt: planData.updatedAt,
            changesCount: planData.changes?.length ?? 0,
          });
        } catch {
          // Skip invalid files
        }
      }
    }

    // Sort by updatedAt descending
    plans.sort((a, b) => b.updatedAt - a.updatedAt);

    return plans;
  }

  /**
   * Delete a saved plan
   */
  async deletePlan(planId: string): Promise<boolean> {
    const planPath = path.join(this.plansDir, `${planId}.json`);

    try {
      if (await fs.pathExists(planPath)) {
        await fs.remove(planPath);
        return true;
      }
    } catch {
      // Failed to delete
    }

    return false;
  }

  // ============================================
  // Summary & Display
  // ============================================

  /**
   * Get a summary of the current plan
   */
  getSummary(): {
    isActive: boolean;
    planId: string | null;
    planName: string | null;
    totalChanges: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    executedCount: number;
    autoAccept: boolean;
  } {
    return {
      isActive: this._isActive,
      planId: this.currentPlan?.id ?? null,
      planName: this.currentPlan?.name ?? null,
      totalChanges: this.currentPlan?.changes.length ?? 0,
      pendingCount: this.pendingChanges.length,
      approvedCount: this.approvedChanges.length,
      rejectedCount: this.rejectedChanges.length,
      executedCount: this.currentPlan?.changes.filter((c) => c.status === 'executed').length ?? 0,
      autoAccept: this._autoAccept,
    };
  }

  /**
   * Format changes for display
   */
  formatChanges(changes?: ProposedChange[]): string {
    const list = changes ?? this.currentPlan?.changes ?? [];

    if (list.length === 0) {
      return 'No changes in plan.';
    }

    const lines: string[] = [];

    for (let i = 0; i < list.length; i++) {
      const change = list[i]!;
      const statusIcon = this.getStatusIcon(change.status);
      const typeIcon = this.getTypeIcon(change.type);

      lines.push(`${i + 1}. ${statusIcon} ${typeIcon} ${change.description}`);

      if (change.filePath) {
        lines.push(`     Path: ${change.filePath}`);
      }
      if (change.command) {
        lines.push(`     Command: ${change.command.substring(0, 60)}${change.command.length > 60 ? '...' : ''}`);
      }
      if (change.rejectionReason) {
        lines.push(`     Reason: ${change.rejectionReason}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get status icon for display
   */
  private getStatusIcon(status: ProposedChange['status']): string {
    switch (status) {
      case 'pending':
        return '[?]';
      case 'approved':
        return '[+]';
      case 'rejected':
        return '[-]';
      case 'executed':
        return '[*]';
      default:
        return '[ ]';
    }
  }

  /**
   * Get type icon for display
   */
  private getTypeIcon(type: ProposedChangeType): string {
    switch (type) {
      case 'file_create':
        return 'CREATE';
      case 'file_edit':
        return 'EDIT';
      case 'file_delete':
        return 'DELETE';
      case 'bash_command':
        return 'BASH';
      case 'tool_call':
        return 'TOOL';
      default:
        return 'UNKNOWN';
    }
  }
}

// ============================================
// Global Instance Management
// ============================================

let globalPlanMode: PlanMode | null = null;

/**
 * Get or create the global PlanMode instance
 */
export function getPlanMode(config?: PlanModeConfig): PlanMode {
  if (!globalPlanMode) {
    globalPlanMode = new PlanMode(config);
  }
  return globalPlanMode;
}

/**
 * Reset the global PlanMode instance
 */
export function resetPlanMode(): void {
  globalPlanMode = null;
}
