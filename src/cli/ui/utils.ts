export const formatToolArgs = (toolName: string, args: any): string => {
  if (!args) return '';

  // Handle specific common tools for cleaner output
  if (toolName === 'Bash' && args.command) {
    return args.command;
  }

  if (toolName === 'Read' && args.file_path) {
    return args.file_path;
  }

  if (toolName === 'Write' && args.file_path) {
    return args.file_path;
  }

  if (toolName === 'Glob' && args.pattern) {
    return args.pattern;
  }

  if (toolName === 'Grep' && args.pattern) {
    // pattern and path
    return `"${args.pattern}" ${args.path || ''}`;
  }

  // Default: compact JSON-like representation
  try {
    if (typeof args === 'string') return args;
    return JSON.stringify(args)
      .replace(/^{|}$/g, '') // Remove outer braces
      .replace(/"([^"]+)":/g, '$1:') // Remove quotes from keys
      .replace(/,"/g, ', '); // Add space after comma
  } catch (e) {
    return '';
  }
};

export const formatLineCount = (text: string): string => {
  const lines = text.split('\n').length;
  return `${lines} lines`;
};
