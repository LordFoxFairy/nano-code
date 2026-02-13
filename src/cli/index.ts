import { Command } from 'commander';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import { loadConfig } from '../core/config/loader.js';
import { AgentFactory } from '../agent/factory.js';
import { Session } from './session.js';
import { App } from './ui/App.js';

export async function main() {
  const program = new Command();

  program
    .name('minicode')
    .description('AI Coding Agent CLI')
    .version('0.1.0')
    .option('--resume <id>', 'Resume a specific session')
    .option('--new', 'Start a new session')
    .option('--mode <mode>', 'Router mode (opus, sonnet, haiku)')
    .parse(process.argv);

  const options = program.opts();

  try {
    // 1. Load Config
    const config = await loadConfig();

    // 2. Initialize Session
    let session: Session | null = null;
    if (options.resume) {
      session = await Session.load(options.resume);
      if (!session) {
        console.error(chalk.red(`Session ${options.resume} not found.`));
        process.exit(1);
      }
    } else {
      // New session
      session = new Session();
    }

    // Determine mode
    let mode = session!.mode; // Default to session mode (which defaults to 'sonnet')

    if (options.mode) {
      mode = options.mode;
    } else if (config.settings?.defaultMode) {
      if (!options.resume && !options.mode) {
        mode = config.settings.defaultMode;
      }
    }

    // Update session mode
    session!.setMode(mode);

    // 3. Create Agent
    const factory = new AgentFactory({
      config,
      mode: mode as import('../core/config/types.js').RouterMode,
      cwd: process.cwd(),
      hitl: config.settings?.interruptOn ? true : true, // Default to true if not specified
    });
    const agent = await factory.build();

    // 4. Start UI
    const { waitUntilExit } = render(React.createElement(App, { agent, session }));
    await waitUntilExit();
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red('Fatal Error:'), error.message);
    process.exit(1);
  }
}
