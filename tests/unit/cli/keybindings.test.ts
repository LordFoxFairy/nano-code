import { describe, it, expect } from 'vitest';
import { KeybindingManager, KeyAction } from '../../../src/cli/keybindings';

describe('KeybindingManager', () => {
  let manager: KeybindingManager;

  beforeEach(() => {
    manager = new KeybindingManager();
  });

  it('should load default bindings', () => {
    const bindings = manager.getKeybindings();
    expect(bindings).toBeDefined();
    expect(bindings.length).toBeGreaterThan(0);

    const abortBinding = bindings.find(b => b.action === KeyAction.ABORT);
    expect(abortBinding).toBeDefined();
    expect(abortBinding?.name).toBe('c');
    expect(abortBinding?.ctrl).toBe(true);

    const clearScreenBinding = bindings.find(b => b.action === KeyAction.CLEAR_SCREEN);
    expect(clearScreenBinding).toBeDefined();
    expect(clearScreenBinding?.name).toBe('l');
    expect(clearScreenBinding?.ctrl).toBe(true);
  });

  it('should get correct action for a key press', () => {
    // Simulate Ctrl+C
    const ctrlC = { name: 'c', ctrl: true };
    const action = manager.getAction(ctrlC);
    expect(action).toBe(KeyAction.ABORT);

    // Simulate Ctrl+L
    const ctrlL = { name: 'l', ctrl: true };
    const action2 = manager.getAction(ctrlL);
    expect(action2).toBe(KeyAction.CLEAR_SCREEN);

    // Simulate Enter
    const enter = { name: 'return' };
    const action3 = manager.getAction(enter);
    expect(action3).toBe(KeyAction.SUBMIT);
  });

  it('should return NONE for unbound keys', () => {
    const unboundKey = { name: 'x' };
    const action = manager.getAction(unboundKey);
    expect(action).toBe(KeyAction.NONE);
  });

  it('should format keybinding correctly', () => {
    const binding = { name: 'c', ctrl: true };
    const formatted = manager.formatKeybinding(binding);
    expect(formatted).toBe('Ctrl+C');

    const binding2 = { name: 'enter' };
    const formatted2 = manager.formatKeybinding(binding2);
    expect(formatted2).toBe('ENTER');

    const binding3 = { name: 'x', meta: true, shift: true };
    const formatted3 = manager.formatKeybinding(binding3);
    expect(formatted3).toBe('Alt+Shift+X');
  });

  describe('getDefaults', () => {
    it('should have keybindings for all defined actions', () => {
      const bindings = manager.getKeybindings();
      const actions = bindings.map(b => b.action);

      expect(actions).toContain(KeyAction.ABORT);
      expect(actions).toContain(KeyAction.CLEAR_SCREEN);
      // Add other actions as they are implemented
    });
  });
});
