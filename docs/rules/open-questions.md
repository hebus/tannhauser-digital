# Questions ouvertes

Format : Rule / Source / Interpretation / Reason / Impact / Test required.

## OQ-LOS-001 — Propagation de la ligne de vue

- **Rule:** RULE-LOS-001 (ligne de vue par couleurs)
- **Source:** précisions du product owner (« tous les nodes dans le path qui contiennent du rouge, du vert ou du bleu sont dans la ligne de vue »)
- **Interpretation (actuelle):** la vue se propage de proche en proche depuis le nœud d'origine, à travers les nœuds contenant au moins une couleur de l'origine (`visibleNodes`).
- **Reason:** formulation littérale ; la variante « couleur commune unique sur tout le chemin » n'est pas retenue sans confirmation.
- **Impact:** la réciprocité `canSee(a,b) === canSee(b,a)` (spec §70) n'est pas garantie quand les ensembles de couleurs diffèrent.
- **Test required:** `board.spec.ts` (3 couleurs / 1 couleur / aucune couleur commune) ; ajouter un test de réciprocité une fois tranché.

## OQ-LOS-002 — Fumée sur la case cible

- **Rule:** RULE-LOS-002 (la fumée coupe la ligne de vue)
- **Interpretation (actuelle):** un nœud sous fumée n'est pas visible et bloque la propagation.
- **Impact:** viser un personnage dans la fumée est impossible. À confirmer.
- **Test required:** `board.spec.ts` (fumée).

## OQ-LOS-003 — Équipement anti-fumée

- **Rule:** RULE-LOS-003
- **Interpretation (actuelle):** l'équipement porté fait ignorer la fumée pour le calcul de vue de son porteur (`ignoresSmoke`).
- **Impact:** asymétrie possible (A voit B, B ne voit pas A). À confirmer.

## OQ-NODE-001 — Catalogue des bonus/malus de case

- **Rule:** RULE-NODE-001
- **Interpretation (actuelle):** schéma générique `NodeModifier` (dés supplémentaires, modificateur de résultat) ; catalogue exact inconnu.
- **Test required:** à ajouter avec le pipeline de combat.
