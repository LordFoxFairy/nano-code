import readline from 'readline';

export enum KeyAction {
  ABORT = 'abort',
  CLEAR_SCREEN = 'clear_screen',
  HISTORY_SEARCH = 'history_search', // Placeholder
  OPEN_EDITOR = 'open_editor',     // Placeholder
  SUBMIT = 'submit',               // Enter
  NEWLINE = 'newline',             // Shift+Enter (if detectable)
  NONE = 'none'
}

export interface KeyDefinition {
  name: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
}

export interface Keybinding extends KeyDefinition {
  action: KeyAction;
  description: string;
}

export class KeybindingManager {
  private bindings: Keybinding[] = [];

  constructor() {
    this.loadDefaults();
  }

  private loadDefaults() {
    this.bindings = [
      {
        name: 'c',
        ctrl: true,
        action: KeyAction.ABORT,
        description: 'Abort current operation or exit'
      },
      {
        name: 'l',
        ctrl: true,
        action: KeyAction.CLEAR_SCREEN,
        description: 'Clear the screen'
      },
      {
        name: 'r',
        ctrl: true,
        action: KeyAction.HISTORY_SEARCH,
        description: 'Search command history (Placeholder)'
      },
      {
        name: 'g',
        ctrl: true,
        action: KeyAction.OPEN_EDITOR,
        description: 'Open in external editor (Placeholder)'
      }
    ];
  }

  public getKeybindings(): Keybinding[] {
    return this.bindings;
  }

  public getBindingForAction(action: KeyAction): Keybinding | undefined {
    return this.bindings.find(b => b.action === action);
  }

  public getAction(key: readline.Key): KeyAction {
    // Normal Enter is usually name='return'
    if (key.name === 'return' && !key.meta && !key.ctrl && !key.shift) {
        return KeyAction.SUBMIT;
    }

    // Check for specific bindings
    for (const binding of this.bindings) {
      if (
        (binding.name === key.name) &&
        (!!binding.ctrl === !!key.ctrl) &&
        (!!binding.meta === !!key.meta) &&
        (!!binding.shift === !!key.shift)
      ) {
        return binding.action;
      }
    }

    return KeyAction.NONE;
  }

  /**
   * Format a keybinding for display
   */
  public formatKeybinding(binding: KeyDefinition): string {
    const parts = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.meta) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    parts.push(binding.name.toUpperCase());
    return parts.join('+');
  }
}
