# Créer une carte (plateau non orthogonal)

Un plateau est un **graphe** (nœuds avec `x`, `y` libres, arêtes, portes, portails) : le moteur (`packages/core`) n'impose aucune grille. Les cartes non orthogonales sont donc de simples **données** : un JSON de plateau, plus une **mise en page** (`layout`) qui ne sert qu'à l'affichage.

Le plateau « Château » (`packages/content/src/data/castle-board.json`) est **généré** par un script ; le plateau de développement (`dev-board.json`) reste écrit à la main et reste sélectionnable à côté.

Deux façons de créer une carte :

- **l'éditeur de plateaux** (outil interne, ci-dessous) : on dessine directement cases, arêtes, portes, portails, pièces et couloirs ;
- **le générateur** : on décrit des pièces et des couloirs dans un `.map.ts`, les cases sont pavées automatiquement (castle, manoir).

Tout fichier `packages/content/src/data/*-board.json` valide est chargé automatiquement (`import.meta.glob` dans `packages/content/src/index.ts`) : dev, château et manoir en tête, puis les autres par identifiant.

## L'éditeur de plateaux (outil de développement)

Outil **interne** (voir `docs/product/non-goals.md` : pas d'éditeur grand public), absent du build de production.

```
npm run dev
```

puis ouvrir `http://localhost:5173/?editor` (liste des plateaux, nouveau plateau, import d'un JSON) ou `/?editor=<id>` pour ouvrir directement un plateau.

**Outils** (barre du haut ou touche) :

| Touche | Outil | Usage |
|---|---|---|
| `V` | Sélection | clic, glisser pour déplacer, cadre ; `Maj` ajoute à la sélection ; glisser l'intérieur d'une pièce sélectionnée la déplace avec ses cases |
| `N` | Case | clic pour poser une case (alignée sur la grille) ; dans une pièce ou un couloir, elle prend sa zone, son id (`<zone>-NN`) et sa couleur de convention |
| `C` | Relier | cliquer des cases à la suite ; re-cliquer une arête existante la retire ; `Échap` arrête la chaîne |
| `D` | Porte | clic sur une arête : pose (bois, fermée) ou retire une porte ; type et état dans le panneau |
| `P` | Portail | deux cases : pose ou retire une porte secrète |
| `R` | Pièce | cliquer les sommets ; cliquer le premier, `Entrée` ou double-clic ferme le polygone |
| `L` | Couloir | cliquer les points ; `Entrée` ou double-clic termine |

Autres raccourcis : `Suppr` supprime la sélection (avec arêtes et portails attachés), `O` sens unique de l'arête sélectionnée, `K` type suivant des cases sélectionnées, `G` grille, `I` identifiants, `F` cadrer, `W` aperçu 3D, `Ctrl+Z` / `Ctrl+Y` annuler / rétablir, `Ctrl+S` enregistrer, `Espace` + glisser ou molette pressée pour déplacer la vue, molette pour zoomer. Sur une pièce ou un couloir sélectionné : glisser un sommet, `Alt` + clic pour le retirer, glisser un carré (milieu de côté) pour en insérer un. `Alt` pendant un glisser : sans grille.

**Panneau** : propriétés de la sélection (id, position, type, praticable, coût, couleurs — les puces de couleurs du plateau s'ajoutent ou se retirent d'un clic —, zone ; sens unique et porte d'une arête ; nom, teinte, largeur, identifiant d'une pièce ou d'un couloir) et **problèmes** en direct : les erreurs du chargement du jeu (`diagnoseBoard` : schéma + `validateBoard`) bloquent l'enregistrement ; les avertissements (moins de 10 cases praticables, moins de 2 entrées, Capture du drapeau impossible, case hors des pièces et couloirs, porte inutilisée, nom sans traduction…) ne le bloquent pas. Un clic sur un problème sélectionne les cases concernées.

**Enregistrer** écrit `packages/content/src/data/<id>-board.json` (ou le fichier existant du plateau) au format canonique (`serializeBoard(normalizeBoardJson(…))` : relire puis réécrire un plateau ne change rien). Le serveur de dev revalide le plateau, refuse les plateaux générés (castle, manoir : modifier leur `.map.ts` puis `npm run generate:boards`) et un fichier modifié ailleurs depuis l'ouverture. **Enregistrer sous** crée une copie modifiable (utile pour partir du château). **Exporter** / **Importer** passent par un fichier `.json`. **Tester** enregistre puis ouvre une partie avec le plateau présélectionné (`?board=<id>`). **Aperçu 3D** (`W`) montre le plateau en cours, même non enregistré, dans le rendu 3D du jeu (lecture seule, sans pions ; `W` ou `Échap` pour revenir) : pratique pour vérifier les murs autour des cases. Un plateau en erreur ne s'affiche pas. Un brouillon est gardé dans le navigateur tant que le plateau n'est pas enregistré.

Après un enregistrement, aucun onglet n'est rechargé ; le nouveau plateau apparaît au prochain chargement de la mise en place. Pour lui donner un vrai nom, ajouter `board.<id>.name` (et les `room.*` de ses pièces) dans `apps/client/src/ui/i18n.ts`, en français et en anglais ; à défaut, l'écran de mise en place affiche l'identifiant. Committer le JSON comme n'importe quel contenu. L'écriture n'est acceptée que depuis la machine locale (même avec `vite --host`).

Code : `apps/client/src/board-editor/` (cœur pur et testé : `model`, `geometry`, `ops-*`, `history`, `tools`, `diagnostics` ; API du serveur : `server/api.ts`, branchée par `apps/client/board-editor-plugin.ts`).

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

Pour ajouter une carte générée : créer `<nom>.map.ts`, l'ajouter au tableau `BOARDS` de `tools/board-generator/boards.ts` ET à `GENERATED_BOARDS` de `packages/content/src/generated-boards.ts` (l'éditeur refuse alors de l'enregistrer ; un test vérifie que les deux listes coïncident), lancer `npm run generate:boards` (le JSON est chargé automatiquement), ajouter `board.<nom>.name` et les `room.*` dans `apps/client/src/ui/i18n.ts` (fr et en), puis écrire les tests (modèle : `packages/content/src/castle.spec.ts`).

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
