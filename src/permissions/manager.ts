import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PermissionRule } from './rules.js';
import { PermissionConfig, PermissionLevel, PermissionRequest, PermissionRuleConfig } from './types.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.nanocode');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'permissions.json');
const PROJECT_CONFIG_FILE = '.nanocode/permissions.json';

export class PermissionManager {
  private globalRules: PermissionRuleConfig[] = [];
  private projectRules: PermissionRuleConfig[] = [];

  constructor(private projectRoot: string = process.cwd()) {
    this.ensureGlobalConfigDir();
    this.loadRules();
  }

  getPermission(request: PermissionRequest): PermissionLevel {
    // Check project rules first (higher priority)
    for (const ruleConfig of this.projectRules) {
      if (this.evaluateRule(ruleConfig, request)) {
        return ruleConfig.level;
      }
    }

    // Check global rules
    for (const ruleConfig of this.globalRules) {
      if (this.evaluateRule(ruleConfig, request)) {
        return ruleConfig.level;
      }
    }

    // Default permission (usually 'ask')
    return 'ask';
  }

  addGlobalRule(rule: PermissionRuleConfig) {
    // Add to beginning of list for higher precedence within global scope
    this.globalRules.unshift(rule);
    this.saveGlobalRules();
  }

  addProjectRule(rule: PermissionRuleConfig) {
    this.projectRules.unshift(rule);
    this.saveProjectRules();
  }

  removeGlobalRule(index: number) {
    if (index >= 0 && index < this.globalRules.length) {
      this.globalRules.splice(index, 1);
      this.saveGlobalRules();
    }
  }

  listGlobalRules(): PermissionRuleConfig[] {
    return [...this.globalRules];
  }

  listProjectRules(): PermissionRuleConfig[] {
    return [...this.projectRules];
  }

  private evaluateRule(config: PermissionRuleConfig, request: PermissionRequest): boolean {
    const rule = new PermissionRule(config);
    return rule.matches(request);
  }

  private loadRules() {
    // Load global rules
    try {
      if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
        const content = fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf-8');
        const config = JSON.parse(content) as PermissionConfig;
        this.globalRules = config.rules || [];
      }
    } catch (error) {
      console.warn('Failed to load global permissions:', error);
      this.globalRules = [];
    }

    // Load project rules
    try {
      const projectConfigPath = path.join(this.projectRoot, PROJECT_CONFIG_FILE);
      if (fs.existsSync(projectConfigPath)) {
        const content = fs.readFileSync(projectConfigPath, 'utf-8');
        const config = JSON.parse(content) as PermissionConfig;
        this.projectRules = config.rules || [];
      }
    } catch (error) {
      // It's okay if project rules don't exist or fail to load
      this.projectRules = [];
    }
  }

  private ensureGlobalConfigDir() {
    if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
      try {
        fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
      } catch (error) {
        console.warn('Could not create global config directory:', error);
      }
    }
  }

  private saveGlobalRules() {
    try {
      const config: PermissionConfig = { rules: this.globalRules };
      fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save global permissions:', error);
    }
  }

  private saveProjectRules() {
    try {
      const projectConfigPath = path.join(this.projectRoot, PROJECT_CONFIG_FILE);
      const projectConfigDir = path.dirname(projectConfigPath);

      if (!fs.existsSync(projectConfigDir)) {
        fs.mkdirSync(projectConfigDir, { recursive: true });
      }

      const config: PermissionConfig = { rules: this.projectRules };
      fs.writeFileSync(projectConfigPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save project permissions:', error);
    }
  }
}
