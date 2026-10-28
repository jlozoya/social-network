import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'outputs/tests/lib');
mkdirSync(output, { recursive: true });
for (const name of ['data', 'auth', 'social', 'media', 'realtime', 'api']) {
  const source = readFileSync(resolve(root, `lib/${name}.ts`), 'utf8');
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from '(\.\/[a-z-]+)'/g, "from '$1.mjs'");
  writeFileSync(resolve(output, `${name}.mjs`), compiled);
}
const result = spawnSync(process.execPath, ['--test', 'tests/backend.test.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
