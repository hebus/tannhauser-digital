# Ligne de vue

Règles confirmées par le product owner. La ligne de vue (LdM) est calculée sur le graphe du plateau à partir des **couleurs** portées par les nœuds.

| ID | Règle testable |
|---|---|
| RULE-LOS-001 | B est visible depuis A s'il existe un chemin A→B dont **tous** les nœuds (extrémités incluses) partagent au moins une couleur commune. La couleur commune doit être la même sur tout le chemin ; deux segments de couleurs différentes ne se combinent pas. |
| RULE-LOS-002 | Une **fumée** sur un nœud coupe la ligne de vue : ce nœud n'est ni visible ni traversable par un rayon de vue (voir OQ-LOS-002 pour la case cible). |
| RULE-LOS-003 | Un **équipement porté** peut ignorer la fumée pour le calcul de vue de son porteur (`ignoresSmoke`). L'asymétrie qui en résulte est possible (voir OQ-LOS-003). |
| RULE-LOS-004 | Une **porte fermée** coupe la ligne de vue ; ouverte, elle n'a aucun effet. |
| RULE-LOS-005 | Les arêtes à **sens unique** n'influencent **pas** la ligne de vue : elles sont traitées comme des arêtes bidirectionnelles pour la visibilité, mais restent orientées pour le déplacement. |
| RULE-LOS-006 | Réciprocité : pour tout A, B, `canSee(A, B) === canSee(B, A)`, sauf le cas d'équipement anti-fumée (RULE-LOS-003). |
| RULE-LOS-007 | Exception de mêlée : une attaque de corps à corps peut viser un personnage derrière une porte selon les règles d'adjacence, indépendamment de la ligne de vue (voir OQ-LOS-005). |
| RULE-LOS-008 | Les nœuds spéciaux (tireur d'élite, couvert) définissent des règles de ciblage explicites hors zone normale (voir `special-rules.md`) ; ils ne modifient pas silencieusement le calcul de couleur. |

## Algorithme de référence (testable)

1. Pour chaque couleur `c` présente sur A, restreindre le graphe aux nœuds portant `c`, en retirant les nœuds sous fumée (sauf exception RULE-LOS-003) et en coupant les arêtes à porte fermée.
2. Traiter toutes les arêtes comme bidirectionnelles (RULE-LOS-005).
3. B est visible s'il est atteignable depuis A dans l'un de ces sous-graphes.

## Tests attendus

- Couleur unique sur le chemin : visible ; changement de couleur à mi-chemin sans couleur commune : non visible.
- Réciprocité exhaustive sur un plateau de test.
- Nœud multi-couleurs : la visibilité passe si l'une des couleurs est commune à tout le chemin.
- Fumée sur un nœud intermédiaire : visibilité coupée ; équipement anti-fumée : visibilité du porteur conservée.
- Porte fermée coupe, porte ouverte non.
- Arête à sens unique : même résultat de visibilité dans les deux directions.

## Cartes non orthogonales (château)

La ligne de vue ne dépend que des couleurs, jamais de la géométrie : une carte aux pièces polygonales et aux couloirs diagonaux obéit aux mêmes règles. Convention de couleurs appliquée par le générateur de cartes (voir `../boards.md`) : une couleur par pièce, une couleur par segment de couloir, seuil de porte bicolore (pièce + couloir), coudes bicolores qui coupent la vue.

Tests (`packages/content/src/castle.spec.ts`) : toute la pièce visible depuis un de ses nœuds ; vue le long d'un couloir depuis son seuil, pas au-delà du coude ni depuis le reste de la pièce ; aucune vue d'une pièce à l'autre ; porte fermée coupe, ouverte non ; sens unique et portail sans effet sur la vue ; réciprocité sur toutes les paires (portes fermées puis toutes ouvertes).
