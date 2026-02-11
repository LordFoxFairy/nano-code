import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../core/config/loader.js';
import { createNanoCodeAgent } from '../agent/factory.js';
import { Session } from './session.js';
import { REPL } from './repl.js';

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

    // Determine mode: CLI > Session > Config Default > Hardcoded fallback
    let mode = session!.mode; // Default to session mode (which defaults to 'sonnet')

    if (options.mode) {
      mode = options.mode;
    } else if (config.settings?.defaultMode) {
      // Only override if session is new or user didn't specify?
      // Actually, if session is resumed, we stick to its mode unless CLI overrides.
      // If session is new, we use config default.
      if (!options.resume && !options.mode) {
        mode = config.settings.defaultMode;
      }
    }

    // Update session mode
    session!.setMode(mode);

    console.log(chalk.blue(`Starting NanoCode in ${mode} mode...`));

    // 3. Create Agent
    const agent = await createNanoCodeAgent({
      config,
      mode,
      cwd: process.cwd(),
      hitl: config.settings?.interruptOn ? true : true, // Default to true if not specified
    });

    // 4. Start REPL
    const repl = new REPL(agent, session!);
    await repl.start();
  } catch (error: any) {
    console.error(chalk.red('Fatal Error:'), error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
