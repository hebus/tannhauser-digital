# Créer une carte (plateau non orthogonal)

Un plateau est un **graphe** (nœuds avec `x`, `y` libres, arêtes, portes, portails) : le moteur (`packages/core`) n'impose aucune grille. Les cartes non orthogonales sont donc de simples **données** : un JSON de plateau, plus une **mise en page** (`layout`) qui ne sert qu'à l'affichage.

Le plateau « Château » (`packages/content/src/data/castle-board.json`) est **généré** par un script ; le plateau de développement (`dev-board.json`) reste écrit à la main et reste sélectionnable à côté.

## Le générateur (`tools/board-generator/`)

| Fichier | Rôle |
|---|---|
| `board-generator.ts` | Bibliothèque pure : `generateBoard(spec)` → JSON de plateau, `serializeBoard(json)` → texte canonique. |
| `castle.map.ts` | Spec de la carte « Château » (`BoardSpec`). Nommé `.map.ts` et non `.spec.ts` pour ne pas être pris pour un test Vitest. |
| `generate.ts` | Commande : écrit (ou vérifie) les JSON dans `packages/content/src/data/`. |
| `board-generator.spec.ts` | Tests : déterminisme, échec sur spec invalide, non-dérive. |

```
npm run generate:boards             # (re)génère castle-board.json
npm run generate:boards -- --check  # n'écrit rien, échoue si le JSON committé a dérivé
```

Le script tourne avec `vite-node` (fourni par Vitest) : aucune dépendance en plus. Après toute modification de `castle.map.ts` : relancer la génération et **committer le JSON** (un test échoue sinon : « sa sortie est IDENTIQUE au JSON committé »).

### Garanties

- **Déterministe** : aucun aléa ; nœuds triés par id, arêtes triées, ids stables (`<pièce>-NN` triés par `(y, x)` pour le pavage, `<couloir>-NN` dans l'ordre de la ligne brisée), clés JSON dans un ordre fixe, coordonnées arrondies à 0,01.
- **Échoue si le plateau est invalide** : le JSON passe par `loadBoard` (schéma ArkType, `validateBoard` du moteur, cohérence de la mise en page). Erreurs aussi détectées par le générateur : pièce ou porte inconnue, porte inutilisée, nombre de couleurs de couloir incohérent, couloir trop éloigné de sa pièce, case spéciale/portail/sens unique introuvable.

### Décrire une carte (`BoardSpec`)

- **Pièce** (`rooms`) : `id`, `nameKey` (clé i18n `room.<id>`), `polygon` (affichage et pavage), `color` (couleur de TOUS ses nœuds), `fill` (`#rrggbb`). Cases : soit **pavage** (`pitch`, `origin`, `margin` : points d'un réseau régulier strictement dans le polygone, reliés aux voisins à ≤ 1,5 × pas dont le milieu est dans la pièce), soit **liste explicite** (`cells`).
- **Couloir** (`corridors`) : `points` (ligne brisée, diagonales permises), `width`, `colors` (une par segment), `from` / `to` (`{ room, door? }` ou `{ free: true }` pour un cul-de-sac / l'extérieur), `spacing`. Un nœud est posé à chaque sommet et à intervalle régulier sur chaque segment. Chaque extrémité est reliée au nœud de la pièce le plus proche (le **seuil**) ; la porte, si elle existe, est portée par cette arête.
- **Portes** (`doors`) : `id`, `type` (`WOODEN` / `REINFORCED`), `state` (`OPEN` / `CLOSED`). Une porte est une arête avec `doorId`.
- **Cases spéciales** (`marks`) : nœud le plus proche d'un point (tolérance 30) → `kind` (`ENTRY_POINT`, `OBJECTIVE`, `ACTION`), `passable: false`, `movementCostModifier` (+1, +2…).
- **Portails** (`portals`) : deux points → deux nœuds, `SECRET_DOOR` (1 PM, ne donne pas de ligne de vue).
- **Sens uniques** (`oneWays`) : deux points d'une arête existante → déplacement autorisé de `from` vers `to` seulement.

Pour ajouter une carte : créer `<nom>.map.ts`, l'ajouter au tableau `BOARDS` de `generate.ts`, importer son JSON dans `packages/content/src/index.ts` (`loadDevContent().boards`), ajouter `board.<nom>.name` et les `room.*` dans `apps/client/src/ui/i18n.ts` (fr et en), puis écrire les tests (modèle : `packages/content/src/castle.spec.ts`).

## Convention de couleurs (« château »)

La ligne de vue ne dépend **que des couleurs** (voir `rules/line-of-sight.md`) ; les arêtes n'ont aucun effet sur elle.

1. **Chaque pièce a sa couleur** (`r.<pièce>`), portée par tous ses nœuds : toute la pièce est visible depuis n'importe lequel de ses nœuds.
2. **Chaque segment de couloir a sa couleur** (`c.<couloir>-a`, `-b`…).
3. **Le seuil** (case de la pièce côté couloir, reliée au couloir par l'arête de porte) porte **les deux couleurs** : pièce + premier segment. On voit donc le long du couloir depuis le seuil, mais pas depuis le reste de la pièce.
4. **Les coudes** portent les couleurs des deux segments voisins ; changer de couleur au coude coupe la vue vers la suite du couloir : jamais de vue d'une pièce à l'autre à travers un couloir coudé.
5. Un nœud a **1 à 3 couleurs** (`validateBoard`) ; le plateau peut en compter davantage au total (le château en a 18).
6. **Porte** : une porte fermée coupe la vue (et le déplacement) ; ouverte, elle ne change rien ; elle ne coûte aucun PM. Un portail coûte 1 PM et ne donne aucune vue. Un sens unique ne concerne que le déplacement.

Les tests `packages/content/src/castle.spec.ts` vérifient cette convention (vue de pièce entière, pas de vue pièce → pièce, vue le long d'un seuil, porte fermée, réciprocité exhaustive).

## Schéma de mise en page (`layout`)

Données d'**affichage uniquement** (contrat `BoardLayout` de `packages/renderer/src/board-layout.ts`, validé par `layoutSchema` dans `packages/content/src/schemas.ts`). Coordonnées = celles des nœuds (monde du plateau).

```json
"layout": {
  "rooms": [
    { "id": "hall", "nameKey": "room.hall", "fill": "#5b4a3a", "polygon": [{ "x": 470, "y": 360 }, "..."] }
  ],
  "corridors": [
    { "id": "cor-sud", "width": 60, "points": [{ "x": 600, "y": 610 }, "..."] }
  ]
}
```

- `rooms[].polygon` : contour fermé d'au moins 3 points, aire non nulle ; `nameKey` traduit côté client ; `fill` optionnel.
- `corridors[].points` : ligne brisée d'au moins 2 points ; le générateur la prolonge jusqu'aux seuils des pièces.
- Les `id` de pièces et de couloirs sont uniques et égaux aux `zoneId` des nœuds correspondants.
- `layout` est facultatif (le plateau de dev n'en a pas) ; `createGameFromSetup` le transmet à `GameFacade.layout`.

## Plateaux disponibles

| id | Nom | Nœuds | Particularités |
|---|---|---|---|
| `dev-board` | Plateau de développement | 16 | grille 4×4, cas spéciaux de test, sans mise en page |
| `castle` | Château | 50 | 6 pièces, 6 couloirs diagonaux, 2 entrées (grande porte au sud dans la cour, poterne au nord-est), portail bibliothèque ↔ chapelle, porte renforcée fermée sur la salle d'armes, porte de bois fermée vers la chapelle, puits (impraticable), gravats (+1) dans la cuisine, escalier à sens unique bibliothèque → hall |
| `manoir` | Manoir | 270 | plateau carré inspiré du plateau d'origine : 15 pièces (rangée nord, grand hall, chambre, salle carrelée, couloir central, salon, salle à manger, cabinets, cave, rotonde) reliées par 20 passages (3 portes de bois, 1 porte renforcée fermée, 1 porte de bois fermée), 2 points d'entrée (ouest / est), 8 cases d'objectif, table impraticable, gravats (+1) et passage secret salle carrelée ↔ cave. Spec : `tools/board-generator/manoir.map.ts` |

Le lien de rejeu `#board=castle&seed=…` fonctionne comme pour le plateau de dev.
