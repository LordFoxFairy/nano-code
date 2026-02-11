// src/index.ts is the main entry point to run CLI
import { Command } from 'commander';

const program = new Command();

program
  .name('nanocode')
  .description('AI Coding Agent')
  .version('0.1.0')
  .action(() => {
    import('./cli/index').then(({ main }) => main());
  });

program.parse(process.argv);
