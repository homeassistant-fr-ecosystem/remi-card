/**
 * Génère src/version.generated.ts à partir de la version de package.json.
 * Ce fichier est regénéré à chaque build (prebuild) et ne doit pas être édité à la main.
 */
import { readFileSync, writeFileSync } from 'fs';

const pkgPath = new URL('../package.json', import.meta.url).pathname;
const outPath = new URL('../src/version.generated.ts', import.meta.url).pathname;

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const version = pkg.version || '0.0.0';

const content = `/**
 * Version de la carte Rémi.
 * Fichier généré automatiquement par scripts/generate-version.js lors du build.
 * Ne pas éditer à la main.
 */
export const VERSION = ${JSON.stringify(version)};
`;

writeFileSync(outPath, content);
console.info(`[generate-version] ${outPath} -> VERSION = ${version}`);
