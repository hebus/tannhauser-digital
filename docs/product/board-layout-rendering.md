# Rendu par mise en page (plateaux non orthogonaux)

`BoardView` accepte une `BoardLayout` (`packages/renderer/src/board-layout.ts`) : des **pièces** (polygones, `nameKey`, `fill` optionnel) et des **couloirs** (lignes brisées + largeur), en coordonnées du plateau. C'est de l'affichage pur : les règles (déplacement, vue, portes) viennent toujours du graphe `BoardState`.

Ordre de dessin avec layout : couloirs, pièces (fond, murs, nom au centroïde), arêtes fines, flèches de sens unique, portes, portails, nœuds. Sans layout, le rendu en grille est inchangé.

Portes (barre perpendiculaire à l'arête, au milieu) : fermée = barre pleine ambre ; ouverte = deux montants et trait pointillé ; renforcée = plus épaisse, avec rivets (fermée) ou montants doublés (ouverte). L'état ne repose pas sur la couleur seule.

Fonctions pures testées (`board-layout.spec.ts`) : `polygonCentroid`, `doorGeometry`, `layoutBounds`, `corridorSegments`.

## Plateau de démonstration

`apps/client/src/fixtures/castle-demo.ts` : château d'environ 26 nœuds (3 pièces dont une en L, 3 couloirs, 4 portes, un portail, un sens unique). Outil de débogage activé uniquement en développement : `npm run dev`, puis `?demoBoard=castle`. Absent du build de production (`import.meta.env.DEV`), donc non visible avec `vite preview`.

## Rendu 3D : marques de cases

En 3D, les cases spéciales se lisent même avec un pion dessus (rien ne recouvre la tuile ni le pion) : **objectif** (Capture du drapeau) = bande dorée en pointillés autour de la case + quatre piquets dorés aux angles ; **portail** (porte secrète) = bande violette en pointillés + anneau violet dressé au bord arrière de la case, toujours face à la caméra, et trait violet pointillé jusqu'à l'autre extrémité ; **caisse** = caisse en volume (case impraticable, jamais occupée).
