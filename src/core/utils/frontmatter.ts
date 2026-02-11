/**
 * Frontmatter Parser
 *
 * Parses YAML frontmatter from Markdown files.
 * Used by skill-loader, command-loader, and agent-loader.
 */

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Check if content has YAML frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  if (!content || !content.startsWith('---')) {
    return false;
  }
  return FRONTMATTER_REGEX.test(content);
}

/**
 * Parse YAML frontmatter from content
 *
 * @returns Object with frontmatter (parsed YAML) and content (remaining text)
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  if (!hasFrontmatter(content)) {
    return { frontmatter: {}, content };
  }

  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatter: {}, content };
  }

  const [, yamlContent, remainingContent] = match;

  try {
    const frontmatter = parseSimpleYaml(yamlContent ?? '');
    return {
      frontmatter,
      content: remainingContent ?? '',
    };
  } catch {
    // Invalid YAML, return empty frontmatter
    return { frontmatter: {}, content };
  }
}

/**
 * Simple YAML parser for frontmatter
 *
 * Handles basic key-value pairs, booleans, and multiline strings.
 * For complex YAML, consider using a full YAML library.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let multilineValue: string[] = [];
  let inMultiline = false;

  for (const line of lines) {
    // Detect obviously invalid YAML (unbalanced brackets, etc.)
    if (line.includes('[') && !line.includes(']')) {
      throw new Error('Invalid YAML: unbalanced brackets');
    }
    // Check for multiline continuation
    if (inMultiline) {
      if (line.startsWith('  ') || line.trim() === '') {
        multilineValue.push(line.replace(/^ {2}/, ''));
        continue;
      } else {
        // End of multiline
        if (currentKey) {
          result[currentKey] = multilineValue.join('\n').trim();
        }
        inMultiline = false;
        multilineValue = [];
      }
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    // Check for multiline indicator
    if (rawValue === '|' || rawValue === '>') {
      currentKey = key;
      inMultiline = true;
      multilineValue = [];
      continue;
    }

    // Parse value
    result[key] = parseValue(rawValue);
  }

  // Handle trailing multiline
  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.join('\n').trim();
  }

  return result;
}

/**
 * Parse a YAML value string into appropriate type
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // Null
  if (value === 'null' || value === '~' || value === '') {
    return null;
  }

  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Array (simple inline)
  if (value.startsWith('[') && value.endsWith(']')) {
    // Invalid array format for simple parser
    return null;
  }

  // Plain string
  return value;
}
