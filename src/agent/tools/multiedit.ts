import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Single edit operation within a file
 */
const EditOperationSchema = z.object({
  old_string: z.string().describe('The exact text to find and replace'),
  new_string: z.string().describe('The replacement text'),
  replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
});

/**
 * File edit specification
 */
const FileEditSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to edit'),
  edits: z
    .array(EditOperationSchema)
    .min(1)
    .describe('List of edit operations to apply to this file'),
});

export type EditOperation = z.infer<typeof EditOperationSchema>;
export type FileEdit = z.infer<typeof FileEditSchema>;

/**
 * Result of a single edit operation
 */
export interface EditResult {
  file_path: string;
  success: boolean;
  edits_applied: number;
  error?: string;
  changes?: {
    old_string: string;
    new_string: string;
    occurrences: number;
  }[];
}

/**
 * MultiEdit tool for batch file editing
 * Allows applying multiple edits across multiple files in a single operation
 */
export class MultiEditTool extends StructuredTool {
  name = 'multi_edit';
  description = `Apply multiple edits across multiple files in a single operation.
Use this when you need to make consistent changes across several files,
such as renaming a variable, updating imports, or applying a pattern fix.
Each file can have multiple edit operations, and edits are applied in order.`;

  schema = z.object({
    files: z
      .array(FileEditSchema)
      .min(1)
      .describe('List of files with their edit operations'),
    dry_run: z
      .boolean()
      .optional()
      .describe('If true, validate edits without applying them (default: false)'),
  });

  private cwd: string;

  constructor(options?: { cwd?: string }) {
    super();
    this.cwd = options?.cwd || process.cwd();
  }

  async _call(input: {
    files: FileEdit[];
    dry_run?: boolean;
  }): Promise<string> {
    const results: EditResult[] = [];
    const dryRun = input.dry_run ?? false;

    for (const fileEdit of input.files) {
      const result = await this.processFileEdit(fileEdit, dryRun);
      results.push(result);
    }

    // Format results
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    const totalEdits = results.reduce((acc, r) => acc + r.edits_applied, 0);

    let output = dryRun ? '=== DRY RUN ===\n\n' : '';

    if (successCount === results.length) {
      output += `✅ Successfully ${dryRun ? 'validated' : 'applied'} ${totalEdits} edit(s) across ${successCount} file(s).\n\n`;
    } else {
      output += `⚠️ ${successCount} file(s) succeeded, ${failCount} file(s) failed.\n\n`;
    }

    for (const result of results) {
      if (result.success) {
        output += `✓ ${result.file_path}: ${result.edits_applied} edit(s)\n`;
        if (result.changes) {
          for (const change of result.changes) {
            const preview =
              change.old_string.length > 50
                ? change.old_string.substring(0, 50) + '...'
                : change.old_string;
            output += `  - Replaced "${preview}" (${change.occurrences} occurrence(s))\n`;
          }
        }
      } else {
        output += `✗ ${result.file_path}: ${result.error}\n`;
      }
    }

    return output;
  }

  private async processFileEdit(fileEdit: FileEdit, dryRun: boolean): Promise<EditResult> {
    const filePath = path.isAbsolute(fileEdit.file_path)
      ? fileEdit.file_path
      : path.join(this.cwd, fileEdit.file_path);

    try {
      // Read file content
      let content = await fs.readFile(filePath, 'utf-8');
      const changes: EditResult['changes'] = [];
      let editsApplied = 0;

      // Apply each edit in order
      for (const edit of fileEdit.edits) {
        const replaceAll = edit.replace_all ?? false;

        // Check if old_string exists
        if (!content.includes(edit.old_string)) {
          return {
            file_path: fileEdit.file_path,
            success: false,
            edits_applied: editsApplied,
            error: `String not found: "${edit.old_string.substring(0, 50)}${edit.old_string.length > 50 ? '...' : ''}"`,
          };
        }

        // Count occurrences
        const regex = new RegExp(this.escapeRegex(edit.old_string), 'g');
        const occurrences = (content.match(regex) || []).length;

        if (!replaceAll && occurrences > 1) {
          return {
            file_path: fileEdit.file_path,
            success: false,
            edits_applied: editsApplied,
            error: `Ambiguous edit: "${edit.old_string.substring(0, 50)}..." found ${occurrences} times. Use replace_all: true or provide a more specific string.`,
          };
        }

        // Apply the edit
        if (replaceAll) {
          content = content.replace(regex, edit.new_string);
        } else {
          content = content.replace(edit.old_string, edit.new_string);
        }

        changes.push({
          old_string: edit.old_string,
          new_string: edit.new_string,
          occurrences: replaceAll ? occurrences : 1,
        });
        editsApplied++;
      }

      // Write file if not dry run
      if (!dryRun) {
        await fs.writeFile(filePath, content, 'utf-8');
      }

      return {
        file_path: fileEdit.file_path,
        success: true,
        edits_applied: editsApplied,
        changes,
      };
    } catch (error: any) {
      return {
        file_path: fileEdit.file_path,
        success: false,
        edits_applied: 0,
        error: error.message || String(error),
      };
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Create a MultiEdit tool instance
 */
export function createMultiEditTool(options?: { cwd?: string }): MultiEditTool {
  return new MultiEditTool(options);
}
