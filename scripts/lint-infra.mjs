#!/usr/bin/env node
/**
 * Revisa lo que no es código de la aplicación pero rompe igual un despliegue:
 *
 * - actionlint: los flujos de GitHub Actions, incluidos los guiones de sus
 *   pasos `run:` (pasa shellcheck por dentro);
 * - hadolint: los Dockerfile de la API y de la web;
 * - shellcheck: los guiones `.sh` del repositorio.
 *
 * Cada herramienta corre en su imagen oficial de Docker, con la versión fijada,
 * de modo que en el CI y en cualquier máquina se revisa exactamente lo mismo
 * sin instalar nada más que Docker.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ACTIONLINT = 'rhysd/actionlint:1.7.12';
const HADOLINT = 'hadolint/hadolint:v2.15.1';
const SHELLCHECK = 'koalaman/shellcheck:v0.11.0';

/** Los archivos versionados que casan con el patrón, relativos a la raíz. */
function tracked(pattern) {
  return execFileSync('git', ['ls-files', pattern], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function docker(image, args, label) {
  console.log(`\n▶ ${label}`);

  const result = spawnSync(
    'docker',
    ['run', '--rm', '-v', `${ROOT}:/repo`, '-w', '/repo', image, ...args],
    // Git Bash en Windows reescribe las rutas que empiezan por `/`; esto se lo
    // impide, y en el resto de sistemas no hace nada.
    { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
  );

  if (result.error) {
    console.error(`No se pudo lanzar Docker: ${result.error.message}`);

    return false;
  }

  return result.status === 0;
}

const dockerfiles = tracked('**/Dockerfile');
const scripts = tracked('*.sh');
const sitesScripts = scripts.filter((file) => file.startsWith('sites/'));
const appScripts = scripts.filter((file) => !file.startsWith('sites/'));

const results = [
  docker(ACTIONLINT, ['-color'], 'Flujos de GitHub Actions (actionlint)'),
  docker(
    HADOLINT,
    ['hadolint', '--config', '/repo/.hadolint.yaml', ...dockerfiles],
    `Dockerfile (hadolint): ${dockerfiles.join(', ')}`,
  ),
  appScripts.length === 0 ||
    docker(SHELLCHECK, appScripts, `Guiones (shellcheck): ${appScripts.join(', ')}`),
  // Los helpers mantenidos de Sites pasan expresiones literales a otro shell.
  // SC2016 marca esas expansiones diferidas intencionales; conservar las demás reglas.
  sitesScripts.length === 0 ||
    docker(
      SHELLCHECK,
      ['--exclude=SC2016', ...sitesScripts],
      'Helpers mantenidos de Sites (shellcheck)',
    ),
];

if (results.some((ok) => !ok)) {
  process.exit(1);
}

console.log('\nFlujos, Dockerfile y guiones: sin avisos.');
