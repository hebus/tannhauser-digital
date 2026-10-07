# Questions ouvertes

Format : Rule / Source / Interpretation / Reason / Impact / Test required.

## OQ-LOS-001 — Propagation de la ligne de vue (RÉSOLUE)

- **Rule:** RULE-LOS-001 (ligne de vue par couleurs)
- **Résolution (product owner) :** il faut toujours une couleur commune sur tout le chemin. B est visible depuis A s'il existe une couleur présente sur tous les nœuds d'un chemin A→B. Réciprocité garantie.
- **Test:** `board.spec.ts` (couleur unique sur le chemin, réciprocité exhaustive).

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

## OQ-LOS-004 — Nœud impraticable et ligne de vue

- **Rule:** RULE-NODE-003, RULE-LOS-001
- **Interpretation (actuelle):** un nœud impraticable bloque le déplacement mais pas la ligne de vue (seules les couleurs, la fumée et les portes fermées la coupent).
- **Reason:** la confirmation du product owner ne liste pas l'impraticabilité parmi les coupures de vue.
- **Impact:** murs-obstacles « bas » possibles ; sinon un drapeau `blocksSight` de données serait nécessaire.
- **Test required:** `board.spec.ts` (nœud impraticable sur le chemin de vue).

## OQ-LOS-005 — Mêlée à travers une porte fermée

- **Rule:** RULE-LOS-007, RULE-LOS-004
- **Interpretation (actuelle):** l'exception de mêlée suppose une porte adjacente ouverte ou une règle d'adjacence explicite ; une porte fermée coupe toujours la vue pour les autres armes.
- **Impact:** conflit possible entre « porte fermée coupe la vue » et « mêlée derrière une porte ».
- **Test required:** `combat.spec.ts` (mêlée porte fermée/ouverte).

## OQ-LOS-006 — « Même couleur » avec des nœuds multi-couleurs

- **Rule:** RULE-BOARD-010, RULE-BOARD-011 (couvert, tireur d'élite)
- **Interpretation (actuelle):** « même couleur » signifie qu'il existe au moins une couleur commune entre le nœud du tireur et la cible.
- **Impact:** portée du tireur plus grande avec des nœuds à 2-3 couleurs.
- **Test required:** `board.spec.ts` (tireur, nœud multi-couleurs).

## OQ-MOVE-001 — Arêtes à sens unique et ciblage

- **Rule:** RULE-MOVE-002, RULE-BOARD-013
- **Interpretation (actuelle):** le sens unique ne concerne que le déplacement ; il ne limite pas les attaques (cohérent avec RULE-LOS-005). Le résumé source suggère que certaines attaques respecteraient aussi la direction.
- **Impact:** attaques de mêlée à travers une arête à sens unique.
- **Test required:** `combat.spec.ts`, `movement.spec.ts`.

## OQ-MOVE-002 — Coût d'entrée supérieur aux PM restants

- **Rule:** RULE-MOVE-011, RULE-NODE-004
- **Interpretation (actuelle):** entrée refusée si coût > PM restants (pas de déplacement partiel).
- **Impact:** un surcoût +2 peut bloquer un personnage à 1 PM ; un PC peut ajouter des PM (RULE-PC-003).
- **Test required:** `movement.spec.ts`.

## OQ-TURN-001 — Égalité à l'initiative

- **Rule:** RULE-TURN-005
- **Interpretation (actuelle):** la procédure d'égalité du livret est modélisée en donnée ; à défaut, relance jusqu'à départage.
- **Test required:** `turn.spec.ts` (égalité).

## OQ-TURN-002 — Durée exacte de la fumée

- **Rule:** RULE-EQUIP-013, RULE-FX-001
- **Interpretation (actuelle):** la fumée créée au tour N est active aux tours N et N+1, retirée au refresh du tour N+2.
- **Impact:** les formulations « persiste le tour courant et le suivant » et « retirée au refresh » demandent un compte précis.
- **Test required:** `board.spec.ts`, `turn.spec.ts`.

## OQ-OBJ-001 — Condition de faction pour les objectifs principaux

- **Rule:** RULE-OBJ-003
- **Interpretation (actuelle):** la condition liée à la faction propriétaire est une donnée par objectif ; sa formulation exacte est incomplète dans le résumé.
- **Test required:** `objectives.spec.ts`.

## OQ-OBJ-002 — Portée du suivi « une seule activation »

- **Rule:** RULE-VICT-011
- **Interpretation (actuelle):** une fois par partie et par joueur pour chaque objectif/case d'action/point d'entrée.
- **Test required:** `victory.spec.ts`.

## OQ-VICT-001 — Victoires simultanées

- **Rule:** RULE-VICT-010
- **Interpretation (actuelle):** non spécifié ; le premier prédicat évalué dans l'ordre de résolution des événements l'emporte.
- **Test required:** `victory.spec.ts`.
