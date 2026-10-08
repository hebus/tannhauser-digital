import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeneratorError, generateBoard, serializeBoard, type BoardSpec } from './board-generator';
import { castleSpec } from './castle.map';
import { manoirSpec } from './manoir.map';

/**
 * `npm run generate:boards` : (re)génère les plateaux dans `packages/content/src/data/`.
 * `npm run generate:boards -- --check` : n'écrit rien, échoue si un JSON committé diffère de la sortie du générateur.
 * Pour ajouter une carte : créer `<nom>.map.ts` (un `BoardSpec`) et l'ajouter à `BOARDS` (voir `docs/boards.md`).
 */
const BOARDS: readonly { readonly spec: BoardSpec; readonly output: string }[] = [
  { spec: castleSpec, output: 'castle-board.json' },
  { spec: manoirSpec, output: 'manoir-board.json' },
];

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/content/src/data');
const check = process.argv.includes('--check');
let failed = false;

for (const { spec, output } of BOARDS) {
  const target = resolve(dataDir, output);
  try {
    const text = serializeBoard(generateBoard(spec));
    if (check) {
      let current = '';
      try {
        current = readFileSync(target, 'utf8');
      } catch {
        // fichier absent : considéré comme différent
      }
      if (current !== text) {
        console.error(`DÉRIVE : ${output} ne correspond plus à la spec ${spec.id} (lancer npm run generate:boards).`);
        failed = true;
      } else {
        console.log(`ok : ${output}`);
      }
    } else {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(target, text, 'utf8');
      console.log(`écrit : ${output}`);
    }
  } catch (error) {
    if (error instanceof GeneratorError) console.error(`ÉCHEC (${spec.id}) : ${error.message}`);
    else console.error(error);
    failed = true;
  }
}
if (failed) process.exit(1);
