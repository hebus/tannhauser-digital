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

## OQ-MOVE-001 — Activation requise pour se déplacer

- **Rule:** RULE-MOVE-009 (conditions d'une commande de déplacement)
- **Source:** §68, §76.6 ; le système d'activation (`turn/`) n'existe pas encore.
- **Interpretation (actuelle):** `MOVE_CHARACTER`, `OPEN_DOOR`, `CLOSE_DOOR` exigent phase ACTIVATION, joueur actif = émetteur, personnage possédé, vivant et `activated === false` (`activated` = activation déjà terminée). `movementLeft` est la réserve de PM courante ; aucune sélection préalable n'est exigée.
- **Reason:** la sélection/activation n'est pas encore modélisée ; l'initialisation de `movementLeft` appartient à `turn/`.
- **Impact:** si `activated` devient vrai dès la sélection, le contrôle doit changer.
- **Test required:** `movement.spec.ts` (refus ALREADY_ACTIVATED, NOT_ACTIVE_PLAYER, WRONG_PHASE).

## OQ-MOVE-002 — Case occupée par un allié

- **Rule:** RULE-MOVE-006
- **Source:** §68.3 (ne parle que des ennemis).
- **Interpretation (actuelle):** une case occupée par un allié vivant est traversable, mais on ne peut pas y terminer son déplacement (une case = un personnage). Elle est absente de `reachableNodes`.
- **Reason:** la spec ne dit rien sur l'occupation alliée.
- **Impact:** à confirmer ; peut aussi dépendre de la taille des cases.
- **Test required:** `movement.spec.ts` (allié traversé / DESTINATION_OCCUPIED).

## OQ-MOVE-003 — Coût et déclaration d'usage d'un portail (porte secrète)

- **Rule:** RULE-MOVE-007
- **Source:** §76.7
- **Interpretation (actuelle):** traverser un portail coûte comme un pas normal (1 PM + surcoût de la case d'arrivée), dans les deux sens. La déclaration d'intention au début de l'activation et la distance minimale ne sont pas vérifiées ; l'interdiction de quitter le plateau est naturellement respectée (le portail relie deux nœuds).
- **Reason:** la spec ne donne pas de coût explicite.
- **Impact:** coût réel possiblement différent ; déclaration à ajouter avec `turn/`.
- **Test required:** `movement.spec.ts` (portail), à compléter après confirmation.

## OQ-MOVE-004 — Passage en force (§69) non implémenté

- **Rule:** RULE-MOVE-008
- **Source:** §68.3, §69
- **Interpretation (actuelle):** une case ennemie est refusée avec le code ENEMY_OCCUPIED. Seul le point d'extension (`movement/force-passage.ts` : `ForcePassageRequest`, `ForcePassageOutcome`, `ForcePassageResolver`) existe.
- **Reason:** le duel physique et les événements FORCE_PASSAGE_* / PHYSICAL_DUEL_STARTED / COUNTER_ATTACK_TRIGGERED n'existent pas encore.
- **Impact:** aucun franchissement d'ennemi possible ; coût en PM de la tentative et contre-attaque à préciser.
- **Test required:** à écrire avec le système de duel (succès, échec, une seule tentative par activation, PM insuffisants).

## OQ-DOOR-001 — Coût et compétence d'ouverture d'une porte

- **Rule:** RULE-DOOR-001
- **Source:** §76.5 (compétence et Test requis selon le type de porte), §76.6 (fermer = 1 PM).
- **Interpretation (actuelle):** `OPEN_DOOR` est possible depuis une case adjacente, coûte 0 PM, sans Test ni compétence ni distinction bois/renforcée. `CLOSE_DOOR` coûte 1 PM.
- **Reason:** la spec ne donne ni coût d'ouverture ni détail des Tests.
- **Impact:** les portes renforcées devraient exiger une compétence ; coût d'ouverture à confirmer.
- **Test required:** `movement.spec.ts` (ouverture), à compléter avec le système de compétences.
