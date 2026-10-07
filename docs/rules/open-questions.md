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

## OQ-TURN-001 — Refresh du premier tour

- **Rule:** RULE-TURN-001 (§66.1 : « au premier tour, le refresh normal a un traitement spécial »)
- **Source:** §66.1
- **Interpretation (actuelle):** le tour 1 applique le même refresh que les autres (PC = `config.commandPointsPerTurn`, reset des personnages, décrément de la fumée).
- **Reason:** le traitement spécial n'est pas détaillé.
- **Impact:** une fumée placée au setup perdrait un tour de durée dès le tour 1.
- **Test required:** `turn.spec.ts` (refresh) à compléter une fois la règle précisée.

## OQ-TURN-002 — Durée initiale et décrément de la fumée

- **Rule:** RULE-TURN-002 (§66.1, §73.2 : la fumée persiste le tour courant et les suivants)
- **Source:** §66.1, §73.2
- **Interpretation (actuelle):** à chaque refresh, `remainingTurns` est décrémenté ; à 0 l'effet est retiré (SMOKE_EXPIRED). La valeur initiale de `remainingTurns` à la pose est à définir par l'action de grenade (hors périmètre).
- **Reason:** « persiste le tour courant et les suivants » ne chiffre pas la durée.
- **Impact:** une fumée posée avec `remainingTurns = 2` dure le tour de pose et le suivant.
- **Test required:** `turn.spec.ts` (fumée) + test de la grenade.

## OQ-TURN-003 — Sens exact de PASS

- **Rule:** RULE-TURN-006 (§66.3 ne décrit pas de passe)
- **Source:** §66.3, §83 (PLAYER_PASSED)
- **Interpretation (actuelle):** PASS = le joueur actif renonce à toutes ses activations restantes du tour (ses personnages non activés sont marqués `activated`) ; l'adversaire enchaîne seul. END_TURN termine l'activation du personnage en cours ; sans activation en cours il est refusé.
- **Reason:** la source dit seulement que le tour finit quand tous les personnages sont activés ; elle ne dit pas si on peut passer ni si c'est définitif pour le tour.
- **Impact:** alternative possible : passer = céder un seul créneau.
- **Test required:** `turn.spec.ts` (PASS).

## OQ-TURN-004 — Modalités de la relance d'initiative

- **Rule:** RULE-PC-003 (§66.2, §75 : le gagnant peut dépenser 1 PC pour relancer)
- **Source:** §66.2, §75
- **Interpretation (actuelle):** seul le gagnant courant peut relancer, avant la première activation du tour ; la relance refait l'initiative complète (1d10 par joueur, ex æquo relancés) ; le nouveau gagnant (éventuellement l'adversaire) peut à son tour relancer s'il a des PC ; aucune limite de relances hors PC. Pas de bonus d'initiative (« bonus applicables » non définis).
- **Reason:** la source ne précise ni si seul le dé du gagnant est relancé, ni le nombre de relances, ni le sort du nouveau gagnant.
- **Impact:** équilibre de l'initiative.
- **Test required:** `turn.spec.ts` (REROLL_INITIATIVE) ; à ajuster selon la réponse.

## OQ-TURN-005 — Phase Overwatch et premier joueur sans personnage

- **Rule:** RULE-TURN-004 (§66 : Overwatch entre initiative et activations)
- **Source:** §66, §67
- **Interpretation (actuelle):** l'étape Overwatch n'est pas implémentée (hors périmètre) ; la phase passe directement de l'initiative à `ACTIVATION`. Si le gagnant n'a aucun personnage à activer, le joueur suivant commence.
- **Impact:** à insérer quand l'Overwatch sera implémenté (relance d'initiative possible jusqu'à la fin de l'Overwatch ?).
- **Test required:** à ajouter avec l'Overwatch.
