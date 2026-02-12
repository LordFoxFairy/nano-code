import type { RouterMode } from './skill.js';

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string | string[];
  model?: RouterMode | 'inherit';
  color?: string;
}

export interface SubAgent {
  name: string;
  description: string;
  path: string;
  tools: string[];
  model?: RouterMode;
  color?: string;
  systemPrompt: string;
}
