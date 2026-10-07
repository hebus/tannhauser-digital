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
## OQ-MOVE-003 — Activation requise pour se déplacer

- **Rule:** RULE-MOVE-009 (conditions d'une commande de déplacement)
- **Source:** §68, §76.6 ; le système d'activation (`turn/`) n'existe pas encore.
- **Interpretation (actuelle):** `MOVE_CHARACTER`, `OPEN_DOOR`, `CLOSE_DOOR` exigent phase ACTIVATION, joueur actif = émetteur, personnage possédé, vivant et `activated === false` (`activated` = activation déjà terminée). `movementLeft` est la réserve de PM courante ; aucune sélection préalable n'est exigée.
- **Reason:** la sélection/activation n'est pas encore modélisée ; l'initialisation de `movementLeft` appartient à `turn/`.
- **Impact:** si `activated` devient vrai dès la sélection, le contrôle doit changer.
- **Test required:** `movement.spec.ts` (refus ALREADY_ACTIVATED, NOT_ACTIVE_PLAYER, WRONG_PHASE).

## OQ-MOVE-004 — Case occupée par un allié

- **Rule:** RULE-MOVE-006
- **Source:** §68.3 (ne parle que des ennemis).
- **Interpretation (actuelle):** une case occupée par un allié vivant est traversable, mais on ne peut pas y terminer son déplacement (une case = un personnage). Elle est absente de `reachableNodes`.
- **Reason:** la spec ne dit rien sur l'occupation alliée.
- **Impact:** à confirmer ; peut aussi dépendre de la taille des cases.
- **Test required:** `movement.spec.ts` (allié traversé / DESTINATION_OCCUPIED).

## OQ-MOVE-005 — Coût et déclaration d'usage d'un portail (porte secrète)

- **Rule:** RULE-MOVE-007
- **Source:** §76.7
- **Interpretation (actuelle):** traverser un portail coûte comme un pas normal (1 PM + surcoût de la case d'arrivée), dans les deux sens. La déclaration d'intention au début de l'activation et la distance minimale ne sont pas vérifiées ; l'interdiction de quitter le plateau est naturellement respectée (le portail relie deux nœuds).
- **Reason:** la spec ne donne pas de coût explicite.
- **Impact:** coût réel possiblement différent ; déclaration à ajouter avec `turn/`.
- **Test required:** `movement.spec.ts` (portail), à compléter après confirmation.

## OQ-MOVE-006 — Passage en force (§69) non implémenté

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

## OQ-TURN-003 — Refresh du premier tour

- **Rule:** RULE-TURN-001 (§66.1 : « au premier tour, le refresh normal a un traitement spécial »)
- **Source:** §66.1
- **Interpretation (actuelle):** le tour 1 applique le même refresh que les autres (PC = `config.commandPointsPerTurn`, reset des personnages, décrément de la fumée).
- **Reason:** le traitement spécial n'est pas détaillé.
- **Impact:** une fumée placée au setup perdrait un tour de durée dès le tour 1.
- **Test required:** `turn.spec.ts` (refresh) à compléter une fois la règle précisée.

## OQ-TURN-004 — Durée initiale et décrément de la fumée

- **Rule:** RULE-TURN-002 (§66.1, §73.2 : la fumée persiste le tour courant et les suivants)
- **Source:** §66.1, §73.2
- **Interpretation (actuelle):** à chaque refresh, `remainingTurns` est décrémenté ; à 0 l'effet est retiré (SMOKE_EXPIRED). La valeur initiale de `remainingTurns` à la pose est à définir par l'action de grenade (hors périmètre).
- **Reason:** « persiste le tour courant et les suivants » ne chiffre pas la durée.
- **Impact:** une fumée posée avec `remainingTurns = 2` dure le tour de pose et le suivant.
- **Test required:** `turn.spec.ts` (fumée) + test de la grenade.

## OQ-TURN-005 — Sens exact de PASS

- **Rule:** RULE-TURN-006 (§66.3 ne décrit pas de passe)
- **Source:** §66.3, §83 (PLAYER_PASSED)
- **Interpretation (actuelle):** PASS = le joueur actif renonce à toutes ses activations restantes du tour (ses personnages non activés sont marqués `activated`) ; l'adversaire enchaîne seul. END_TURN termine l'activation du personnage en cours ; sans activation en cours il est refusé.
- **Reason:** la source dit seulement que le tour finit quand tous les personnages sont activés ; elle ne dit pas si on peut passer ni si c'est définitif pour le tour.
- **Impact:** alternative possible : passer = céder un seul créneau.
- **Test required:** `turn.spec.ts` (PASS).

## OQ-TURN-006 — Modalités de la relance d'initiative

- **Rule:** RULE-PC-003 (§66.2, §75 : le gagnant peut dépenser 1 PC pour relancer)
- **Source:** §66.2, §75
- **Interpretation (actuelle):** seul le gagnant courant peut relancer, avant la première activation du tour ; la relance refait l'initiative complète (1d10 par joueur, ex æquo relancés) ; le nouveau gagnant (éventuellement l'adversaire) peut à son tour relancer s'il a des PC ; aucune limite de relances hors PC. Pas de bonus d'initiative (« bonus applicables » non définis).
- **Reason:** la source ne précise ni si seul le dé du gagnant est relancé, ni le nombre de relances, ni le sort du nouveau gagnant.
- **Impact:** équilibre de l'initiative.
- **Test required:** `turn.spec.ts` (REROLL_INITIATIVE) ; à ajuster selon la réponse.

## OQ-TURN-007 — Phase Overwatch et premier joueur sans personnage

- **Rule:** RULE-TURN-004 (§66 : Overwatch entre initiative et activations)
- **Source:** §66, §67
- **Interpretation (actuelle):** l'étape Overwatch n'est pas implémentée (hors périmètre) ; la phase passe directement de l'initiative à `ACTIVATION`. Si le gagnant n'a aucun personnage à activer, le joueur suivant commence.
- **Impact:** à insérer quand l'Overwatch sera implémenté (relance d'initiative possible jusqu'à la fin de l'Overwatch ?).
- **Test required:** à ajouter avec l'Overwatch.
