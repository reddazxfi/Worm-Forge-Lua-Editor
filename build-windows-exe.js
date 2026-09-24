#!/usr/bin/env node

/**
 * WormForge Code Editor - Automated Cross-Platform .EXE Builder
 * Can be run with: node scripts/build-windows-exe.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function run(command, desc) {
  console.log(`\n\x1b[36m▶ ${desc}...\x1b[0m`);
  console.log(`\x1b[90m$ ${command}\x1b[0m\n`);
  try {
    execSync(command, { cwd: rootDir, stdio: 'inherit' });
  } catch (err) {
    console.error(`\x1b[31m✖ Failed during: ${desc}\x1b[0m`);
    process.exit(1);
  }
}

console.log(`\x1b[33m=======================================================`);
console.log(`  WormForge Editor - Windows .EXE Packaging Pipeline`);
console.log(`=======================================================\x1b[0m`);

// Step 1: Ensure Vite distribution is built
run('npm run build', '1/3 Building React/Vite assets');

// Step 2: Ensure output dir exists
const outputDir = path.join(rootDir, 'dist_exe');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Step 3: Run electron-builder targeting Windows portable x64
run('npx electron-builder --win portable --x64', '2/3 Compiling Windows Standalone Executable');

console.log(`\n\x1b[32m✔ SUCCESS: Windows executable packaged in ./dist_exe/\x1b[0m\n`);
