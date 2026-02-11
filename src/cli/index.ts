// src/cli/index.ts
import { Command } from 'commander';
// import { loadConfig } from '../config/loader';
// import { LLMResolver } from '../llm/resolver';
import { Session } from './session';
import { REPL } from './repl';
import chalk from 'chalk';
// import { createNanoCodeAgent } from '../agent/factory'; // This will be implemented in Phase 3

export async function main() {
  const program = new Command();

  program
    .name('nanocode')
    .description('AI Coding Agent CLI')
    .version('0.1.0')
    .option('--resume <id>', 'Resume a specific session')
    .option('--new', 'Start a new session')
    .parse(process.argv);

  const options = program.opts();

  try {
    // 1. Load Config
    // const config = await loadConfig();

    // 2. Initialize Session
    let session: Session | null = null;
    if (options.resume) {
        session = await Session.load(options.resume);
        if (!session) {
            console.error(chalk.red(`Session ${options.resume} not found.`));
            process.exit(1);
        }
    } else if (!options.new) {
        // Try to load latest session (implementation details for "latest" would be in Session manager)
        // For now, just create new
        session = new Session();
    } else {
        session = new Session();
    }

    // 3. Resolve LLM
    // const resolver = new LLMResolver();
    // const model = resolver.resolveByMode(config, session.mode);

    // 4. Create Agent (Mock for now until Phase 3)
    const agent = {
        stream: async function* (input: any) {
             // Simulate small delay
             await new Promise(resolve => setTimeout(resolve, 100));
            yield { content: 'Echo: ' + input.messages[0].content };
        },
        invoke: async (input: any) => {
            return { content: 'Echo: ' + input.messages[0].content };
        }
    };

    // 5. Start REPL
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
