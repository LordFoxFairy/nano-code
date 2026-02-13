import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanMode, ProposedChange } from '../../../src/cli/plan-mode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { homedir } from 'os';

// Mock fs-extra to avoid writing to disk during tests
vi.mock('fs-extra');

describe('PlanMode', () => {
  let planMode: PlanMode;
  const mockSessionId = 'test-session-id';
  const tempDir = path.join(homedir(), '.nanocode', 'plans');

  beforeEach(() => {
    vi.clearAllMocks();
    planMode = new PlanMode({ plansDir: tempDir });
  });

  afterEach(() => {
    // Clean up if necessary
  });

  describe('State Management', () => {
    it('should start with isActive as false', () => {
      expect(planMode.isActive).toBe(false);
      expect(planMode.plan).toBeNull();
    });

    it('should activate when entering plan mode', async () => {
      await planMode.enter(mockSessionId);
      expect(planMode.isActive).toBe(true);
      expect(planMode.plan).not.toBeNull();
      expect(planMode.plan?.sessionId).toBe(mockSessionId);
      expect(planMode.plan?.status).toBe('draft');
    });

    it('should deactivate when exiting plan mode', async () => {
      await planMode.enter(mockSessionId);
      await planMode.exit();
      expect(planMode.isActive).toBe(false);
    });

    it('should not allow entering plan mode if already active', async () => {
      await planMode.enter(mockSessionId);
      const firstPlanId = planMode.plan?.id;

      await planMode.enter('another-session');
      expect(planMode.plan?.id).toBe(firstPlanId);
    });
  });

  describe('Change Management', () => {
    beforeEach(async () => {
      await planMode.enter(mockSessionId);
    });

    it('should record tool calls as changes', async () => {
      const toolName = 'read_file';
      const toolArgs = { path: 'test.ts' };

      const change = await planMode.addToolCall(toolName, toolArgs);

      expect(change).toBeDefined();
      expect(change.type).toBe('tool_call');
      expect(change.toolName).toBe(toolName);
      expect(change.toolArgs).toEqual(toolArgs);
      expect(change.status).toBe('pending');

      expect(planMode.pendingChanges).toHaveLength(1);
      expect(planMode.pendingChanges[0].id).toBe(change.id);
    });

    it('should record other change types correctly', async () => {
      await planMode.addFileCreate('new.ts', 'content');
      await planMode.addFileEdit('edit.ts', 'old', 'new');
      await planMode.addFileDelete('del.ts');
      await planMode.addBashCommand('ls');

      expect(planMode.pendingChanges).toHaveLength(4);

      const createChange = planMode.pendingChanges.find(c => c.type === 'file_create');
      expect(createChange?.filePath).toBe('new.ts');

      const editChange = planMode.pendingChanges.find(c => c.type === 'file_edit');
      expect(editChange?.filePath).toBe('edit.ts');

      const deleteChange = planMode.pendingChanges.find(c => c.type === 'file_delete');
      expect(deleteChange?.filePath).toBe('del.ts');

      const commandChange = planMode.pendingChanges.find(c => c.type === 'bash_command');
      expect(commandChange?.command).toBe('ls');
    });

    it('should throw error when adding change if not active', async () => {
      await planMode.exit();
      await expect(planMode.addToolCall('tool', {})).rejects.toThrow('Plan mode is not active');
    });
  });

  describe('Approval and Rejection', () => {
    beforeEach(async () => {
      await planMode.enter(mockSessionId);
      await planMode.addToolCall('tool1', {});
      await planMode.addToolCall('tool2', {});
      await planMode.addToolCall('tool3', {});
    });

    it('should approve a single change', async () => {
      const changeId = planMode.pendingChanges[0].id;
      const success = await planMode.approveChange(changeId);

      expect(success).toBe(true);
      expect(planMode.approvedChanges).toHaveLength(1);
      expect(planMode.pendingChanges).toHaveLength(2);
      expect(planMode.approvedChanges[0].id).toBe(changeId);
    });

    it('should reject a single change', async () => {
      const changeId = planMode.pendingChanges[0].id;
      const success = await planMode.rejectChange(changeId, 'Not needed');

      expect(success).toBe(true);
      expect(planMode.rejectedChanges).toHaveLength(1);
      expect(planMode.pendingChanges).toHaveLength(2);
      expect(planMode.rejectedChanges[0].rejectionReason).toBe('Not needed');
    });

    it('should approve all pending changes', async () => {
      const count = await planMode.approveAll();

      expect(count).toBe(3);
      expect(planMode.pendingChanges).toHaveLength(0);
      expect(planMode.approvedChanges).toHaveLength(3);
      expect(planMode.plan?.status).toBe('approved');
    });

    it('should reject all pending changes', async () => {
      const count = await planMode.rejectAll('Bad plan');

      expect(count).toBe(3);
      expect(planMode.pendingChanges).toHaveLength(0);
      expect(planMode.rejectedChanges).toHaveLength(3);
      expect(planMode.plan?.status).toBe('rejected');
      expect(planMode.rejectedChanges[0].rejectionReason).toBe('Bad plan');
    });
  });

  describe('Summary', () => {
    it('should return correct statistics', async () => {
      await planMode.enter(mockSessionId, 'Test Plan');

      // Add 4 changes
      const c1 = await planMode.addToolCall('t1', {});
      const c2 = await planMode.addToolCall('t2', {});
      const c3 = await planMode.addToolCall('t3', {});
      await planMode.addToolCall('t4', {});

      // Approve 1, reject 1, execute 1 (simulation)
      await planMode.approveChange(c1.id);
      await planMode.rejectChange(c2.id);

      // Simulate execution
      await planMode.approveChange(c3.id);
      // Manually setting status for test as execute() involves execution logic
      const changeToExecute = planMode.plan!.changes.find(c => c.id === c3.id)!;
      changeToExecute.status = 'executed';

      const summary = planMode.getSummary();

      expect(summary.isActive).toBe(true);
      expect(summary.planName).toBe('Test Plan');
      expect(summary.totalChanges).toBe(4);
      expect(summary.pendingCount).toBe(1);
      expect(summary.approvedCount).toBe(1); // One approved but not executed
      expect(summary.rejectedCount).toBe(1);
      expect(summary.executedCount).toBe(1);
    });
  });
});
