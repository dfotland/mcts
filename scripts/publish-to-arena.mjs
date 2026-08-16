#!/usr/bin/env node
/**
 * Build current @smart-games/mcts and copy artifacts into sibling arena/library/<id>.
 *
 * Usage:
 *   npm run publish:arena
 *   npm run publish:arena -- --id mcts@2026-08-14 --notes "after speedup"
 *   npm run publish:arena -- --force --allow-dirty
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mctsRoot = resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    id: null,
    notes: '',
    arena: process.env.ARENA_ROOT ?? join(mctsRoot, '..', 'arena'),
    force: false,
    allowDirty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id') out.id = argv[++i];
    else if (a === '--notes') out.notes = argv[++i] ?? '';
    else if (a === '--arena') out.arena = resolve(argv[++i] ?? out.arena);
    else if (a === '--force') out.force = true;
    else if (a === '--allow-dirty') out.allowDirty = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: publish:arena [--id <id>] [--notes <text>] [--arena <path>] [--force] [--allow-dirty]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: mctsRoot, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return (r.stdout || '').trim();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const arenaRoot = resolve(opts.arena);
  const libraryRoot = join(arenaRoot, 'library');

  if (!existsSync(arenaRoot)) {
    console.error(`Arena root not found: ${arenaRoot}`);
    process.exit(2);
  }

  const dirty = git(['status', '--porcelain']).length > 0;
  if (dirty && !opts.allowDirty) {
    console.error('Working tree is dirty. Commit first, or pass --allow-dirty.');
    process.exit(2);
  }

  const gitSha = git(['rev-parse', 'HEAD']);
  const gitShaShort = git(['rev-parse', '--short', 'HEAD']);
  const gitCommitMessage = git(['log', '-1', '--pretty=%s']);
  const gitCommitAuthor = git(['log', '-1', '--pretty=%an']);
  const gitCommitDate = git(['log', '-1', '--pretty=%cI']);

  const today = new Date().toISOString().slice(0, 10);
  const id = opts.id ?? `mcts@${today}-${gitShaShort}`;
  const dest = join(libraryRoot, id);

  if (existsSync(dest)) {
    if (!opts.force) {
      console.error(`Library entry already exists: ${dest} (use --force to replace)`);
      process.exit(2);
    }
    rmSync(dest, { recursive: true, force: true });
  }

  console.log(`Building mcts…`);
  const build = spawnSync('npm', ['run', 'build'], { cwd: mctsRoot, stdio: 'inherit' });
  if (build.status !== 0) {
    process.exit(build.status ?? 2);
  }

  const distDir = join(mctsRoot, 'dist');
  if (!existsSync(distDir)) {
    console.error('dist/ missing after build');
    process.exit(2);
  }

  mkdirSync(dest, { recursive: true });
  copyFileSync(join(mctsRoot, 'package.json'), join(dest, 'package.json'));
  cpSync(distDir, join(dest, 'dist'), { recursive: true });
  const workerHostDts = join(mctsRoot, 'worker-host.d.ts');
  if (existsSync(workerHostDts)) {
    copyFileSync(workerHostDts, join(dest, 'worker-host.d.ts'));
  }

  const pkg = JSON.parse(readFileSync(join(mctsRoot, 'package.json'), 'utf8'));
  const manifest = {
    id,
    gitSha,
    gitShaShort,
    gitCommitMessage,
    gitCommitAuthor,
    gitCommitDate,
    dirty,
    packageVersion: pkg.version ?? '0.0.0',
    createdAt: new Date().toISOString(),
    notes: opts.notes || undefined,
  };
  writeFileSync(join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Published ${id}`);
  console.log(`  sha=${gitShaShort}  ${gitCommitMessage}`);
  console.log(`  path=${dest}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
}
