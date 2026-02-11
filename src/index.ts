#!/usr/bin/env node

// Delegate completely to the CLI module
import('./cli/index.js').then(({ main }) => main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
