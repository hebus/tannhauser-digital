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
