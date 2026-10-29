import ts from 'typescript';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const suites = {
  backend: { source: 'lib', output: 'lib' },
  client: { source: 'app/client', output: 'client' },
};
const suite = process.argv[2];
if (!Object.hasOwn(suites, suite)) throw new Error('Selecciona backend o client.');
const sourceRoot = resolve(root, suites[suite].source);
const outputRoot = resolve(root, 'outputs/tests', suites[suite].output);

function compileDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      compileDirectory(file);
      continue;
    }
    if (!/\.(?:ts|mts)$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    const compiled = ts
      .transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace(
        /(from\s+|import\s*\(\s*)(['"])(\.[^'"]+)\2/g,
        (match, prefix, quote, specifier) =>
          /\.[a-z]+$/i.test(specifier) ? match : `${prefix}${quote}${specifier}.mjs${quote}`,
      );
    const destination = resolve(
      outputRoot,
      relative(sourceRoot, file).replace(/\.(?:ts|mts)$/, '.mjs'),
    );
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, compiled);
  }
}

compileDirectory(sourceRoot);
const result = spawnSync(process.execPath, ['--test', `tests/${suite}.test.mjs`], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
