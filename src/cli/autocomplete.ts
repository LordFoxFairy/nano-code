import fs from 'fs-extra';
import path from 'path';

export class FileAutocomplete {
  constructor(private cwd: string = process.cwd()) {}

  /**
   * Completer function for readline
   * Returns [suggestions, matching_line_segment]
   */
  async complete(line: string): Promise<[string[], string]> {
    // Only capture @ at word boundary (start of line or after space)
    // Matches "@partial/path" at the end of the line
    const match = /(^|\s)@([^\s]*)$/.exec(line);

    if (!match) {
      return [[], line];
    }

    const fullMatch = match[0].trimStart(); // e.g. "@src/cli"
    const inputPath = match[2]; // e.g. "src/cli" without @

    try {
      let searchDir: string;
      let filePrefix: string;
      let dirPartForCompletion: string;

      if (inputPath.endsWith('/')) {
        // User explicitly typed a directory, e.g. "src/"
        searchDir = path.resolve(this.cwd, inputPath);
        filePrefix = '';
        dirPartForCompletion = inputPath;
      } else if (inputPath === '') {
        // User typed just "@"
        searchDir = this.cwd;
        filePrefix = '';
        dirPartForCompletion = '';
      } else {
        // User typed partial file/dir, e.g. "src/cl"
        const dirName = path.dirname(inputPath);
        searchDir = path.resolve(this.cwd, dirName);
        filePrefix = path.basename(inputPath);

        // When constructed back, we need the dir part
        if (dirName === '.') {
           dirPartForCompletion = '';
        } else {
           dirPartForCompletion = dirName + '/';
        }
      }

      // If directory doesn't exist, return empty
      if (!(await fs.pathExists(searchDir))) {
        return [[], fullMatch];
      }

      const stats = await fs.stat(searchDir);
      if (!stats.isDirectory()) {
        return [[], fullMatch];
      }

      const files = await fs.readdir(searchDir);

      // Filter and process files
      const suggestions: string[] = [];

      const isInputAbsolute = path.isAbsolute(inputPath);

      for (const file of files) {
        // Filter by prefix (case-sensitive)
        if (!file.startsWith(filePrefix)) {
          continue;
        }

        const fullPath = path.join(searchDir, file);
        let isDir = false;
        try {
          const fileStats = await fs.stat(fullPath);
          isDir = fileStats.isDirectory();
        } catch {
          continue;
        }

        // Skip hidden files unless prefix starts with dot
        if (file.startsWith('.') && !filePrefix.startsWith('.')) {
          continue;
        }

        // Construct the completed path to show to user
        let completionDesc: string;

        if (isInputAbsolute) {
             completionDesc = path.join(searchDir, file);
        } else {
             // Reconstruct relative path
             if (dirPartForCompletion) {
                completionDesc = dirPartForCompletion + file;
             } else {
                completionDesc = file;
             }
        }

        // Append slash for directories
        if (isDir) {
          completionDesc += '/';
        }

        suggestions.push('@' + completionDesc);
      }

      return [suggestions, fullMatch];
    } catch (error) {
      // Silently fail on error
      return [[], fullMatch];
    }
  }
}
