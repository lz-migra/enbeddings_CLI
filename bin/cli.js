#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { installCommand } from '../src/commands/install.js';
import { indexCommand } from '../src/commands/index.js';
import { searchCommand } from '../src/commands/search.js';
import { watcherCommand } from '../src/commands/watcher.js';
import { doctorCommand } from '../src/commands/doctor.js';

const program = new Command();

program
  .name('embeddings-service')
  .description('CLI for semantic code search over your codebase using embeddings + SQLite')
  .version('1.0.0');

program.addCommand(initCommand());
program.addCommand(installCommand());
program.addCommand(indexCommand());
program.addCommand(searchCommand());
program.addCommand(watcherCommand());
program.addCommand(doctorCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
