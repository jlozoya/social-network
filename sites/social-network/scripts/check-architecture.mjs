import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
if (configFile.error)
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const local = (file) => file.startsWith(root + sep) && !file.includes(`${sep}node_modules${sep}`);

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : /\.(?:ts|tsx)$/.test(file) ? [file] : [];
  });
}

function inspect(entries, pureTransport = false) {
  const visited = new Set();
  const pending = [...entries];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const imports = ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles;
    for (const { fileName: specifier } of imports) {
      if (/^(?:node:|cloudflare:|server-only$)/.test(specifier)) {
        throw new Error(`Código de servidor en el cliente: ${file} -> ${specifier}`);
      }
      if (pureTransport && !specifier.startsWith('.')) {
        throw new Error(
          `El transporte HTTP debe ser independiente de React y de la UI: ${specifier}`,
        );
      }
      const dependency = ts.resolveModuleName(
        specifier,
        file,
        config.options,
        ts.sys,
      ).resolvedModule;
      if (!dependency) continue; // Typecheck reports unresolved imports separately.
      const target = resolve(dependency.resolvedFileName);
      if (!local(target)) continue;
      if (
        target.startsWith(resolve(root, 'lib') + sep) ||
        target.startsWith(resolve(root, 'worker') + sep)
      ) {
        throw new Error(`El cliente no puede importar el servidor: ${file} -> ${target}`);
      }
      pending.push(target);
    }
  }
}

inspect([
  ...filesIn(resolve(root, 'app/client')),
  resolve(root, 'app/social-app.tsx'),
  resolve(root, 'mobile/main.tsx'),
]);
inspect([resolve(root, 'app/client/api-client.ts')], true);
console.log('Arquitectura: cliente sin dependencias del servidor y transporte HTTP independiente.');
