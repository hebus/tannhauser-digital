import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { normalizePath, type Plugin, type ViteDevServer } from 'vite';

/**
 * Éditeur de plateaux (outil de développement) : sert `/__board-editor/*` et écrit les plateaux dans
 * `packages/content/src/data/`. Actif seulement avec `vite` (jamais dans le build). La logique est dans
 * `src/board-editor/server/api.ts` (pure, testée) ; ce fichier ne fait que le lien avec Node et Vite.
 *
 * Écrire un plateau ne doit recharger AUCUN onglet (l'éditeur perdrait son état) : les fichiers écrits ici sont
 * retirés de la mise à jour à chaud, et seuls les modules qui en dépendent sont invalidés côté serveur (le registre
 * `import.meta.glob` de `@tannhauser/content` voit donc le nouveau plateau au prochain chargement de page).
 */

const PREFIX = '/__board-editor';
const MAX_BYTES = 2 * 1024 * 1024;
/** Durée pendant laquelle un fichier qu'on vient d'écrire est tenu à l'écart de la mise à jour à chaud. */
const QUIET_MS = 3000;

interface Handler {
  (req: { method: string; path: string; query: URLSearchParams; headers: Record<string, string | undefined>; body?: string }): Promise<{ status: number; body: unknown }>;
}

export function boardEditorPlugin(dataDir: string): Plugin {
  const dir = resolve(dataDir);
  const written = new Map<string, number>();
  const inside = (file: string): string => {
    const path = resolve(dir, file);
    if (!path.startsWith(dir + sep) || !/^[a-z0-9-]+-board\.json$/.test(file)) throw new Error(`Fichier refusé : ${file}`);
    return path;
  };
  let devServer: ViteDevServer | null = null;
  const registryFile = normalizePath(resolve(dir, '../index.ts'));
  // Le registre (`import.meta.glob` de `@tannhauser/content`) liste les fichiers à sa transformation : on l'invalide
  // nous-mêmes, car un fichier CRÉÉ hors de la racine du client n'est pas surveillé par Vite.
  const invalidateRegistry = (timestamp: number): void => {
    for (const env of Object.values(devServer?.environments ?? {})) {
      for (const m of env.moduleGraph.getModulesByFile(registryFile) ?? []) env.moduleGraph.invalidateModule(m, new Set(), timestamp, true);
    }
  };
  const store = {
    list: async () => (await readdir(dir)).filter((f) => /^[a-z0-9-]+-board\.json$/.test(f)),
    read: async (file: string) => readFile(inside(file), 'utf8').catch(() => null),
    write: async (file: string, text: string) => {
      const path = inside(file);
      written.set(normalizePath(path), Date.now());
      await writeFile(path, text, 'utf8');
      invalidateRegistry(Date.now());
    },
  };
  const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

  // Rechargé à chaque requête (le module est mis en cache par Vite, et suit les modifications de l'API).
  const load = async (server: ViteDevServer): Promise<Handler> => {
    const mod = (await server.ssrLoadModule('/src/board-editor/server/deps.ts')) as { createBoardEditorHandler: (s: typeof store, h: typeof hash) => Handler };
    return mod.createBoardEditorHandler(store, hash);
  };
  // Serveur exposé sur le réseau (`--host`) : l'écriture reste réservée à la machine locale.
  const loopback = (address: string | undefined): boolean => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

  return {
    name: 'tannhauser-board-editor',
    apply: 'serve',
    configureServer(server) {
      devServer = server;
      server.middlewares.use(PREFIX, (req, res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) tooLarge = true;
          else chunks.push(chunk);
        });
        req.on('end', () => {
          const send = (status: number, body: unknown): void => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(body));
          };
          if (tooLarge) return send(413, { error: 'too-large' });
          if (!loopback(req.socket.remoteAddress)) return send(403, { error: 'remote' });
          const url = new URL(req.url ?? '/', 'http://localhost');
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
          load(server)
            .then((handle) => handle({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers, body: Buffer.concat(chunks).toString('utf8') }))
            .then((r) => send(r.status, r.body))
            .catch((error: unknown) => send(500, { error: 'server', message: String(error) }));
        });
      });
    },
    hotUpdate({ file, modules, timestamp }) {
      const at = written.get(file);
      if (at === undefined || Date.now() - at > QUIET_MS) return;
      // Un plateau qu'on vient d'écrire : son module est relu au prochain chargement de page, mais aucun onglet ouvert
      // n'est rechargé (sans module qui l'accepte à chaud, Vite rechargerait toutes les pages, éditeur compris).
      for (const m of modules) this.environment.moduleGraph.invalidateModule(m, new Set(), timestamp, true);
      return [];
    },
  };
}
