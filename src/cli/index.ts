import { Command } from 'commander';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import { loadConfig } from '../core/config/loader.js';
import { AgentFactory } from '../agent/factory.js';
import { Session } from './session.js';
import { App } from './ui/App.js';
import { getPlanMode } from './plan-mode.js';

export async function main() {
  const program = new Command();

  program
    .name('minicode')
    .description('AI Coding Agent CLI')
    .version('0.1.0')
    .option('--resume <id>', 'Resume a specific session')
    .option('--new', 'Start a new session')
    .option('--mode <mode>', 'Router mode (opus, sonnet, haiku)')
    .option('--plan', 'Start in plan mode (track changes without executing)')
    .parse(process.argv);

  const options = program.opts();

  try {
    // 1. Load Config
    const config = await loadConfig();

    // 2. Initialize Session
    let session: Session | null = null;
    if (options.resume) {
      // Try loading by ID or partial ID
      session = await Session.load(options.resume);
      if (!session) {
        // Try finding by partial ID or name
        const sessionData = await Session.find(options.resume);
        if (sessionData) {
          session = await Session.load(sessionData.id);
        }
      }
      if (!session) {
        console.error(chalk.red(`Session ${options.resume} not found.`));
        console.error(chalk.dim('Use /sessions to list available sessions.'));
        process.exit(1);
      }
      console.log(chalk.green(`Resumed session: ${session.getMetadata('name') || session.id.substring(0, 8)}`));
    } else if (!options.new) {
      // Try to resume most recent session unless --new flag is set
      const latestSession = await Session.loadLatest();
      if (latestSession && latestSession.messages.length > 0) {
        // Only auto-resume if there's actual conversation history
        session = latestSession;
        const name = session.getMetadata<string>('name') || `Session ${session.id.substring(0, 8)}`;
        console.log(chalk.dim(`Resuming: ${name} (use --new to start fresh)`));
      } else {
        session = new Session();
      }
    } else {
      // --new flag: explicitly start a new session
      session = new Session();
    }

    // Start auto-save (every 5 minutes)
    session!.startAutoSave();

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

    // Initialize plan mode if --plan flag is set
    if (options.plan) {
      const planMode = getPlanMode();
      await planMode.enter(session!.id);
      console.log(chalk.yellow('Starting in plan mode. Changes will be tracked but not executed.'));
      console.log(chalk.dim('Use /plan:accept to execute changes, /plan:reject to discard.'));
    }

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

    // 5. Cleanup: Save session on exit
    await session!.end();
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(chalk.red('Fatal Error:'), error.message);
    process.exit(1);
  }
}
