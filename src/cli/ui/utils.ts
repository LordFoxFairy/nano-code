export const formatToolArgs = (toolName: string, args: unknown): string => {
  if (!args) return '';

  if (typeof args === 'string') return args;

  const argObj = args as Record<string, unknown>;

  // Handle specific common tools for cleaner output
  if (toolName === 'Bash' && typeof argObj.command === 'string') {
    return argObj.command;
  }

  if (toolName === 'Read' && typeof argObj.file_path === 'string') {
    return argObj.file_path;
  }

  if (toolName === 'Write' && typeof argObj.file_path === 'string') {
    return argObj.file_path;
  }

  if (toolName === 'Glob' && typeof argObj.pattern === 'string') {
    return argObj.pattern;
  }

  if (toolName === 'Grep' && typeof argObj.pattern === 'string') {
    // pattern and path
    return `"${argObj.pattern}" ${argObj.path || ''}`;
  }

  // Default: compact JSON-like representation
  try {
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
