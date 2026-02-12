import fs from 'fs-extra';
import { glob } from 'glob';
import matter from 'gray-matter';
import path from 'path';
import { SubAgent, AgentFrontmatter } from '../types/agent.js';
import { RouterMode } from '../types/skill.js';

export class AgentLoaderError extends Error {
  constructor(
    message: string,
    public filePath?: string,
  ) {
    super(filePath ? `${message} in ${filePath}` : message);
    this.name = 'AgentLoaderError';
  }
}

export function parseSubAgent(content: string, filePath: string): SubAgent {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (e) {
    throw new AgentLoaderError(`Invalid YAML in frontmatter: ${(e as Error).message}`, filePath);
  }

  const { data, content: body } = parsed;

  if (!data || Object.keys(data).length === 0) {
    throw new AgentLoaderError('Empty frontmatter', filePath);
  }

  // Type assertion for better type safety, though we still need runtime checks
  const frontmatter = data as Partial<AgentFrontmatter>;

  if (!frontmatter.name) {
    throw new AgentLoaderError('Missing "name" in frontmatter', filePath);
  }
  if (!frontmatter.description) {
    throw new AgentLoaderError('Missing "description" in frontmatter', filePath);
  }

  // Parse tools
  let tools: string[] = [];
  if (data.tools) {
    if (typeof data.tools === 'string') {
      tools = data.tools
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);
    } else if (Array.isArray(data.tools)) {
      tools = data.tools;
    }
  }

  // Parse model
  let model: RouterMode | undefined = undefined;
  if (frontmatter.model) {
    if (frontmatter.model === 'inherit') {
      model = undefined;
    } else {
      model = frontmatter.model as RouterMode;
    }
  }

  return {
    name: frontmatter.name!,
    description: frontmatter.description!,
    path: filePath,
    tools,
    model: model,
    color: frontmatter.color,
    systemPrompt: body.trim(),
  };
}

export interface AgentLoaderOptions {
  allowDuplicates?: boolean;
}

export async function loadSubAgents(
  directory: string,
  options: AgentLoaderOptions = {},
): Promise<SubAgent[]> {
  if (!fs.existsSync(directory)) {
    return [];
  }

  // Find files. We want files in 'agents' directories if searching recursively,
  // or all md files if we are pointing directly to an agents directory.
  const files = await glob('**/*.md', {
    cwd: directory,
    absolute: true,
  });

  const agents: SubAgent[] = [];
  const seenNames = new Set<string>();

  for (const file of files) {
    // Basic filter: must be in an 'agents' directory OR the root directory used MUST be an agents directory.
    // Logic: check if path segments include 'agents'.
    const normalizedPath = path.normalize(file);
    const hasAgentsInPath = normalizedPath.split(path.sep).includes('agents');

    if (!hasAgentsInPath) {
      continue;
    }

    // Skip README.md
    if (path.basename(file).toLowerCase() === 'readme.md') {
      continue;
    }

    const content = await fs.readFile(file, 'utf-8');
    try {
      const agent = parseSubAgent(content, file);

      // Check duplicate names
      if (seenNames.has(agent.name)) {
        if (!options.allowDuplicates) {
          throw new AgentLoaderError(`Duplicate agent name: "${agent.name}"`, file);
        }
        // If allowing duplicates, we continue to add it.
      } else {
        seenNames.add(agent.name);
      }

      agents.push(agent);
    } catch (e) {
      // Rethrow explicitly to fail fast on invalid agent files
      throw e;
    }
  }

  return agents;
}

/**
 * Alias for loadSubAgents (camelCase compatibility)
 */
export const loadSubagents = loadSubAgents;
