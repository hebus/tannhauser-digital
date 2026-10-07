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

- **Mise à jour :** le déplacement reste permis après l'unique action de l'activation (`turn.actionUsed` ne le bloque pas) et `movementLeft` est conservé (voir OQ-COMBAT-007).

- **Rule:** RULE-MOVE-009 (conditions d'une commande de déplacement)
- **Source:** §68, §76.6 ; le système d'activation (`turn/`) n'existe pas encore.
- **Interpretation (actuelle):** `MOVE_CHARACTER`, `OPEN_DOOR`, `CLOSE_DOOR` exigent phase ACTIVATION, joueur actif = émetteur, personnage possédé, vivant et `activated === false` (`activated` = activation déjà terminée). `movementLeft` est la réserve de PM courante ; aucune sélection préalable n'est exigée.
- **Reason:** la sélection/activation n'est pas encore modélisée ; l'initialisation de `movementLeft` appartient à `turn/`.
- **Impact:** si `activated` devient vrai dès la sélection, le contrôle doit changer.
- **Test required:** `movement.spec.ts` (refus ALREADY_ACTIVATED, NOT_ACTIVE_PLAYER, WRONG_PHASE).

## OQ-MOVE-004 — Case occupée par un allié

- **Statut :** toujours ouverte (non couverte par les décisions du product owner).

- **Rule:** RULE-MOVE-006
- **Source:** §68.3 (ne parle que des ennemis).
- **Interpretation (actuelle):** une case occupée par un allié vivant est traversable, mais on ne peut pas y terminer son déplacement (une case = un personnage). Elle est absente de `reachableNodes`.
- **Reason:** la spec ne dit rien sur l'occupation alliée.
- **Impact:** à confirmer ; peut aussi dépendre de la taille des cases.
- **Test required:** `movement.spec.ts` (allié traversé / DESTINATION_OCCUPIED).

## OQ-MOVE-005 — Coût et déclaration d'usage d'un portail (porte secrète) (RÉSOLUE)

- **Résolution (product owner) :** un portail coûte 1 PM, comme un pas normal, dans les deux sens. Implémenté et testé (`movement.spec.ts`, « traverse un portail pour exactement 1 PM »). La déclaration d'intention reste non vérifiée.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-MOVE-007
- **Source:** §76.7
- **Interpretation (actuelle):** traverser un portail coûte comme un pas normal (1 PM + surcoût de la case d'arrivée), dans les deux sens. La déclaration d'intention au début de l'activation et la distance minimale ne sont pas vérifiées ; l'interdiction de quitter le plateau est naturellement respectée (le portail relie deux nœuds).
- **Reason:** la spec ne donne pas de coût explicite.
- **Impact:** coût réel possiblement différent ; déclaration à ajouter avec `turn/`.
- **Test required:** `movement.spec.ts` (portail), à compléter après confirmation.

## OQ-MOVE-006 — Passage en force (§69) non implémenté (RÉSOLUE)

- **Résolution (product owner) :** le passage en force est un duel de Physique ; reporté à plus tard. Seul le point d'extension (`movement/force-passage.ts`) existe ; ENEMY_OCCUPIED reste le comportement actuel. Coût et contre-attaque restent à préciser pour cette future implémentation.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-MOVE-008
- **Source:** §68.3, §69
- **Interpretation (actuelle):** une case ennemie est refusée avec le code ENEMY_OCCUPIED. Seul le point d'extension (`movement/force-passage.ts` : `ForcePassageRequest`, `ForcePassageOutcome`, `ForcePassageResolver`) existe.
- **Reason:** le duel physique et les événements FORCE_PASSAGE_* / PHYSICAL_DUEL_STARTED / COUNTER_ATTACK_TRIGGERED n'existent pas encore.
- **Impact:** aucun franchissement d'ennemi possible ; coût en PM de la tentative et contre-attaque à préciser.
- **Test required:** à écrire avec le système de duel (succès, échec, une seule tentative par activation, PM insuffisants).

## OQ-DOOR-001 — Coût et compétence d'ouverture d'une porte (RÉSOLUE)

- **Résolution (product owner) :** une porte ne coûte rien : ouvrir ET fermer = 0 PM, même avec 0 PM restant (`CLOSE_DOOR_COST = 0`). Les Tests/compétences selon le type de porte restent hors périmètre. Testé (`movement.spec.ts`, « une porte ne coûte rien »).
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-DOOR-001
- **Source:** §76.5 (compétence et Test requis selon le type de porte), §76.6 (fermer = 1 PM).
- **Interpretation (actuelle):** `OPEN_DOOR` est possible depuis une case adjacente, coûte 0 PM, sans Test ni compétence ni distinction bois/renforcée. `CLOSE_DOOR` coûtait 1 PM (ancienne valeur, désormais 0).
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

## OQ-TURN-007 — Phase Overwatch et premier joueur sans personnage (RÉSOLUE pour l'Overwatch)

- **Rule:** RULE-TURN-004 (§66 : Overwatch entre initiative et activations), RULE-OVERWATCH-001…
- **Source:** §66, §67
- **Résolution (product owner) :** l'Overwatch est une ACTION du personnage actif, prise pendant son activation (commande `OVERWATCH`, qui consomme l'unique action), et non une phase dédiée. Quand un adversaire entre ensuite dans sa ligne de vue pendant un déplacement, le joueur en Overwatch a droit à une réaction (voir `traceability-overwatch.md`). La phase passe donc de l'initiative à `ACTIVATION`.
- **Reste ouvert :** si le gagnant n'a aucun personnage à activer, le joueur suivant commence (inchangé) ; jusqu'à quand la relance d'initiative reste-t-elle possible ?
- **Historique (avant décision) :** l'étape Overwatch n'était pas implémentée ; la phase passait directement de l'initiative à `ACTIVATION`.
- **Test:** `overwatch.spec.ts` et tests d'intégration.

## OQ-COMBAT-001 — Corps à corps : adjacence et portes (RÉSOLUE)

- **Résolution (product owner) :** la seule exigence est une arête entre les deux nœuds ; sens unique et porte (ouverte ou fermée) sont ignorés ; la LdM n'est pas requise.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-COMBAT-005 (§70.1 : attaque au corps à corps derrière une porte « là où l'adjacence le permet »)
- **Source:** §70.1, §72.1
- **Interpretation:** une arme `CAC` exige que les deux nœuds soient reliés par une arête (sens et porte ignorés) ; la LdM n'est pas requise. Les armes non-CAC exigent la LdM.
- **Reason:** « adjacency rules » non définies (arêtes à sens unique, portes renforcées, portails secrets ?).
- **Impact:** peut autoriser/interdire des attaques à travers portes fermées ou renforcées.
- **Test required:** `attack.spec.ts` (corps à corps à travers porte fermée) ; à affiner.

## OQ-COMBAT-002 — Défense (Duel) lors d'une attaque (RÉSOLUE)

- **Résolution (product owner) :** la défense est un jet de Physique branché sur ATTACK : réserve `config.defensePoolSize` (défaut 4), difficulté = 10 − Physique du défenseur ; chaque succès annule 1 blessure (événement `DEFENSE_ROLLED`). Taille de la réserve : voir OQ-COMBAT-008.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-DUEL-001 / RULE-COMBAT-006
- **Source:** §71.4, §72.2
- **Interpretation:** §72 ne décrit aucun jet de défense : l'attaque est un Test simple, touchée si au moins 1 succès. `resolveDuel`/`rollDuel` existent mais ne sont pas branchés sur `ATTACK` ; `CombatLog.defense` vaut `null`.
- **Reason:** on ignore quand un Duel s'ouvre (défenseur, réserve, caractéristique opposée).
- **Impact:** aucune réduction des succès côté cible.
- **Test required:** à ajouter quand la règle de défense est précisée.

## OQ-COMBAT-003 — Nombre de blessures par attaque réussie (RÉSOLUE)

- **Résolution (product owner) :** chaque succès du jet d'attaque = 1 blessure ; chaque blessure non parée = 1 dégât (1 niveau de santé). Le plafond « 1 blessure par attaque » (`WOUNDS_PER_HIT`) n'existe plus.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-COMBAT-007
- **Source:** §72.4 (« can cause wounds », « removes one health level »)
- **Interpretation:** 1 blessure par attaque réussie, indépendamment du nombre de succès (`WOUNDS_PER_HIT`).
- **Reason:** la spécification ne dit pas si les succès excédentaires ajoutent des blessures.
- **Impact:** létalité du jeu.
- **Test required:** `attack.spec.ts` (jet maximum = 1 blessure).

## OQ-COMBAT-004 — Composition de la réserve de dés d'attaque

- **Suite :** la dépendance du pool d'attaque à Combat est reprise dans OQ-COMBAT-009.

- **Rule:** RULE-COMBAT-003
- **Source:** §72.2 (« weapon + current Combat + modifiers »)
- **Interpretation:** réserve = dés de l'arme + dés supplémentaires (arme, modificateurs `OCCUPANT`/`ATTACKER` de la case de l'attaquant) ; le Combat courant ne fixe que la difficulté (10 − Combat). Les modificateurs `DEFENDER` de la case de la cible ne sont pas appliqués. Les armes `MENTAL` utilisent aussi Combat. L'échec automatique l'emporte sur les succès automatiques.
- **Reason:** formulation ambiguë (le Combat ajoute-t-il des dés ? l'arme Mental teste-t-elle Mental ? précédence échec/succès automatiques ?).
- **Impact:** équilibrage de toutes les attaques.
- **Test required:** `attack.spec.ts` (dés d'arme, case, difficulté).

## OQ-COMBAT-005 — Portée et zone de fumée

- **Rule:** RULE-COMBAT-004 / RULE-LOS-002
- **Source:** §70.2, §72.1, §73.2
- **Interpretation:** la portée est un champ optionnel `maxRange` de l'arme, en pas sur arêtes non bloquées ; absente, seule la LdM limite. La fumée n'occupe que le nœud `origin` de l'effet (la « zone affectée » n'est pas définie dans l'état).
- **Reason:** unité de portée (« cases ») et rayon de fumée non spécifiés ; cas hors zone/sniper non modélisés.
- **Impact:** attaques longue portée, interactions fumée.
- **Test required:** `attack.spec.ts` (portée, fumée) ; à compléter avec §73.

## OQ-COMBAT-006 — Santé à 0 et ligne de stats d'un mort

- **Rule:** RULE-COMBAT-008
- **Interpretation:** un personnage mort a `health = 0` et `alive = false` ; `currentStats` renvoie alors la dernière ligne (clampée) au lieu de lever une erreur.
- **Reason:** la ligne active d'un mort n'est pas définie ; ajustement minimal de `state/types.ts`.
- **Impact:** lecture sûre des stats d'un cadavre (UI, journaux).
- **Test required:** `attack.spec.ts` (mort, `currentStats` sans erreur).

## OQ-COMBAT-007 — Garde-fous d'activation (RÉSOLUE)

- **Résolution (product owner) :** une attaque ne coûte rien (ni PC ni PM). Chaque activation permet UNE seule action (attaquer, Overwatch, etc.) et autant de déplacement que les PM le permettent : bouger+agir, agir+bouger, bouger+agir+bouger, bouger seul, agir seul. Le moteur suit `turn.actionUsed` (refus `ACTION_ALREADY_USED`) ; ATTACK et OVERWATCH exigent le personnage actif.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-COMBAT-001
- **Interpretation:** `ATTACK` exige `phase = ACTIVATION` et `activePlayerId = playerId` ; elle ne consommait ni PC ni état d'activation (état avant décision).
- **Impact:** à raccorder avec le coût/limite d'actions par activation.
- **Test required:** `attack.spec.ts` (validation).

## OQ-OVERWATCH-001 — Durée de l'Overwatch et réactions multiples

- **Rule:** RULE-OVERWATCH-003, RULE-OVERWATCH-006
- **Interpretation (actuelle) :** l'Overwatch dure jusqu'à la réaction (tir ou renoncement), qui l'efface ; sinon il est effacé au refresh du tour suivant. Une seule réaction par Overwatch : un même adversaire ne peut pas être déclenché plusieurs fois par le même Overwatch.
- **Reason:** hypothèse du moteur, non confirmée par le product owner.
- **Impact:** valeur défensive de l'Overwatch ; un Overwatch inutilisé protège-t-il aussi pendant le tour adverse suivant ?
- **Test required:** `overwatch.spec.ts` (effacement après réaction, effacement au refresh).

## OQ-OVERWATCH-002 — Plusieurs personnages en Overwatch voient le mouvement

- **Rule:** RULE-OVERWATCH-004
- **Interpretation (actuelle) :** le premier personnage en Overwatch, dans l'ordre de l'état, qui voit la case réagit ; un seul déclencheur par pas. Le déplacement s'arrête sur cette case.
- **Reason:** la règle ne précise ni le choix du réagissant (joueur, proximité) ni les réactions en chaîne.
- **Impact:** choix potentiellement arbitraire ; les autres Overwatch restent intacts.
- **Test required:** `overwatch.spec.ts` (deux personnages en Overwatch).

## OQ-OVERWATCH-003 — Déclencheurs de l'Overwatch autres que le déplacement

- **Rule:** RULE-OVERWATCH-002
- **Interpretation (actuelle) :** seul un déplacement qui entre dans la ligne de vue déclenche l'Overwatch ; les attaques et autres actions adverses ne le déclenchent pas.
- **Reason:** la règle confirmée ne mentionne que l'entrée dans la ligne de vue pendant un déplacement.
- **Impact:** un adversaire immobile peut agir sans réaction.
- **Test required:** à ajouter si l'Overwatch s'étend aux actions.

## OQ-COMBAT-008 — Taille de la réserve de défense (RÉSOLUE)

- **Résolution (product owner) :** depuis la règle v2, la réserve de défense est TOUJOURS de 4 dés ; elle ne dépend d'aucune caractéristique (seule la difficulté dépend du Physique). La valeur reste exposée en configuration (`config.defensePoolSize`, défaut 4) pour d'éventuelles variantes de règles.
- **Historique :**
- **Rule:** RULE-COMBAT-012
- **Interpretation (actuelle) :** 4 dés par défaut, valeur de configuration `config.defensePoolSize` ; la difficulté dépend de Physique, la taille non.
- **Reason:** valeur alignée sur la réserve de Test par défaut, non confirmée.
- **Impact:** létalité ; à confirmer : la valeur, et une éventuelle dépendance à une caractéristique ou à l'équipement.
- **Test required:** `attack.spec.ts` (réserve de défense configurable).

## OQ-COMBAT-009 — Le pool d'attaque dépend-il de Combat ? (RÉSOLUE)

- **Résolution (product owner, règles v2) :** le pool d'attaque est donné par un TABLEAU selon l'arme : sans arme 2 dés, corps à corps 4, pistolet 4, arme mentale 4, arme automatique 5. La difficulté dépend de la valeur de Combat courante du personnage (10 − Combat). Combat n'ajoute pas de dés.
- **Implémentation :** valeurs dans `packages/content/src/data/weapons.json` (`weapon.unarmed` 2, `weapon.melee` 4, `weapon.pistol` 4, `weapon.mental` 4, `weapon.automatic` 5) ; l'attaque à mains nues est ajoutée à tout personnage par `createCharacterState`.
- **Mains nues :** traitée comme du corps à corps (OQ-COMBAT-010, confirmé).
- **Historique :**

- **Rule:** RULE-COMBAT-003
- **Interpretation (actuelle) :** pool = dés d'arme + bonus ; Combat ne fixe que la difficulté (10 − Combat). Prolonge OQ-COMBAT-004.
- **Reason:** formulation ambiguë de la règle source.
- **Impact:** équilibrage de toutes les attaques.
- **Test required:** `attack.spec.ts` (taille du pool, difficulté).

## OQ-COMBAT-010 — Portée de l'attaque à mains nues (RÉSOLUE)

- **Résolution (product owner) :** l'attaque à mains nues est du corps à corps (cible sur un nœud adjacent, 2 dés).

- **Rule:** RULE-COMBAT-003
- **Interpretation (actuelle) :** sans arme, l'attaque est de type corps à corps (arête entre les deux nœuds, sens et porte ignorés), avec une réserve de 2 dés.
- **Reason:** le tableau v2 donne 2 dés sans arme mais pas la portée.
- **Impact:** tout personnage peut toujours attaquer un adversaire adjacent.
- **Test required:** `runtime.spec.ts` (arme ajoutée), `attack.spec.ts` (corps à corps).
