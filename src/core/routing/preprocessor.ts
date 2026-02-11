/**
 * Preprocessor (Phase 1.1)
 *
 * Parses user input to extract special syntax:
 * - Shell commands: !command or !`command`
 * - Skill invocation: /skillName [args]
 * - File references: @path/to/file
 *
 * Design aligned with Claude Code conventions.
 */

import type { CommandInstruction, FileReference, PreprocessingResult } from '../../types';

export class Preprocessor {
  /**
   * Process input string and extract commands/references
   */
  async execute(content: string): Promise<PreprocessingResult> {
    if (!content) {
      return {
        cleanedContent: '',
        commands: [],
        fileReferences: [],
        shouldHaltConversation: false,
      };
    }

    const commands: CommandInstruction[] = [];
    const fileReferences: FileReference[] = [];

    // Extract slash commands (at start of line or string)
    this.extractSlashCommands(content, commands);

    // Extract shell commands
    this.extractShellCommands(content, commands);

    // Extract file references
    this.extractFileReferences(content, fileReferences);

    return {
      cleanedContent: content,
      commands,
      fileReferences,
      shouldHaltConversation: commands.length > 0 && this.hasNoMeaningfulContent(content, commands, fileReferences),
    };
  }

  /**
   * Extract /command [args] patterns
   */
  private extractSlashCommands(
    content: string,
    commands: CommandInstruction[],
  ): void {
    // Match slash commands at start of line or string
    // Pattern: starts with / followed by word characters (and hyphens), optional args
    const slashPattern = /^(\/[\w-]+)(\s+.*)?$/gm;

    let match;
    while ((match = slashPattern.exec(content)) !== null) {
      const fullMatch = match[0];
      const commandPart = match[1];
      const argsPart = match[2]?.trim() || '';

      if (commandPart) {
        const name = commandPart.slice(1); // Remove leading /
        const args = this.parseArgs(argsPart);

        commands.push({
          name,
          args,
          type: 'skill',
          originalString: fullMatch.trim(),
        });
      }
    }
  }

  /**
   * Extract !command or !`command` patterns
   */
  private extractShellCommands(
    content: string,
    commands: CommandInstruction[],
  ): void {
    // Pattern 1: !`command` (backtick-wrapped)
    const backtickPattern = /^!`([^`]+)`/gm;
    let match;

    while ((match = backtickPattern.exec(content)) !== null) {
      const cmdName = match[1];
      if (cmdName) {
        commands.push({
          name: cmdName,
          args: [],
          type: 'shell',
          originalString: match[0],
        });
      }
    }

    // Pattern 2: !command (at start of line, not followed by a word char immediately after !)
    // Avoid matching exclamations in the middle of text like "wow!"
    const simplePattern = /^!([a-zA-Z][\w\s\-./|>]+)$/gm;

    while ((match = simplePattern.exec(content)) !== null) {
      const cmdName = match[1];
      if (cmdName) {
        // Skip if already captured by backtick pattern
        const alreadyCaptured = commands.some(
          (cmd) => cmd.type === 'shell' && content.includes(cmd.originalString),
        );
        if (!alreadyCaptured || !content.includes('`')) {
          commands.push({
            name: cmdName.trim(),
            args: [],
            type: 'shell',
            originalString: match[0],
          });
        }
      }
    }
  }

  /**
   * Extract @file references
   */
  private extractFileReferences(
    content: string,
    fileReferences: FileReference[],
  ): void {
    // Pattern: @path/to/file.ext
    // Avoid matching emails (character before @ is a word character)
    // Must be: start of string, whitespace, or certain punctuation before @
    const filePattern = /(?:^|[\s,;:])(@(?:\.\.\/|\/)?[\w\-./\u4e00-\u9fa5]+)/g;

    let match;
    while ((match = filePattern.exec(content)) !== null) {
      const token = match[1];
      if (token) {
        const path = token.slice(1); // Remove leading @

        // Skip if looks like email (word char before @)
        const idx = content.indexOf(token);
        const charBefore = idx > 0 ? content[idx - 1] : '';
        if (idx > 0 && charBefore && /\w/.test(charBefore)) {
          continue;
        }

        fileReferences.push({
          token,
          path,
          content: null, // Will be loaded later
        });
      }
    }
  }

  /**
   * Parse argument string into array, handling quotes
   */
  private parseArgs(argsString: string): string[] {
    if (!argsString) {
      return [];
    }

    const args: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (inQuote) {
        if (char === inQuote) {
          // End of quoted section
          if (current) {
            args.push(current);
            current = '';
          }
          inQuote = null;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        // Start of quoted section
        if (current) {
          args.push(current);
          current = '';
        }
        inQuote = char;
      } else if (char === ' ' || char === '\t') {
        // Whitespace separator
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    // Don't forget the last argument
    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Check if there's no meaningful content besides commands and file refs
   */
  private hasNoMeaningfulContent(
    content: string,
    commands: CommandInstruction[],
    fileRefs: FileReference[],
  ): boolean {
    let remaining = content;

    // Remove commands
    for (const cmd of commands) {
      remaining = remaining.replace(cmd.originalString, '');
    }

    // Remove file references
    for (const ref of fileRefs) {
      remaining = remaining.replace(ref.token, '');
    }

    // Check if anything meaningful remains
    return remaining.trim() === '';
  }
}
