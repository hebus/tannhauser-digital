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

## OQ-MOVE-006 — Passage en force (§69) (RÉSOLUE, implémentée)

- **Résolution (product owner) :** un personnage ne traverse pas un adversaire, sauf UN passage en force par activation (duel de Physique). Celui qui force lance 4 dés (difficulté 10 − Physique), le défenseur aussi (4 dés, 10 − son Physique) ; chaque succès du défenseur annule un succès de l'initiateur ; il faut au moins 1 succès restant pour traverser.
- **Implémentation :** une case ennemie n'est traversable que comme case intermédiaire d'un chemin de `MOVE_CHARACTER` (jamais comme arrivée), une seule fois par activation (`turn.forcePassageUsed`, tentative consommée même ratée). Le duel (`movement/force-passage.ts`, `combat/duel.ts`) est résolu quand le déplacement atteint la case ennemie ; événement `FORCE_PASSAGE_RESOLVED`. Succès : le déplacement continue (PM normaux). Échec : le personnage s'arrête sur la case précédente, en ne payant que les cases franchies. Overwatch : jamais d'arrêt sur la case ennemie traversée. `reachableNodes` marque `forcePassage` les cases atteignables seulement par ce biais ; l'IA les ignore.
- **Reste à préciser :** contre-attaque de l'ennemi en cas d'échec (non implémentée).

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
- **Résolution actuelle (product owner, redéfinition de l'Overwatch) :** le tour enchaîne refresh, initiative, phase `OVERWATCH` (placements), phase `ACTIVATION`. Mettre un personnage en Overwatch coûte 1 PC et se décide APRÈS l'initiative, AVANT les activations (voir OQ-OVERWATCH-009 pour le détail). La relance d'initiative (1 PC) reste possible avant les placements.
- **Reste ouvert :** si le gagnant n'a aucun personnage à activer, le joueur suivant commence (inchangé). La relance d'initiative est possible tant qu'aucun placement ni aucune passe d'Overwatch n'a eu lieu (décision du PO, OQ-OVERWATCH-009).
- **Historique (décision précédente, abandonnée) :** l'Overwatch était une ACTION du personnage actif, prise pendant son activation (commande `OVERWATCH` consommant l'unique action, sans PC) et non une phase ; la phase passait de l'initiative à `ACTIVATION`.
- **Historique (avant toute décision) :** l'étape Overwatch n'était pas implémentée ; la phase passait directement de l'initiative à `ACTIVATION`.
- **Test:** `overwatch.spec.ts`, `turn.spec.ts` et tests d'intégration.

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

- **Mise à jour :** l'Overwatch n'est plus une action d'activation (OQ-TURN-007, OQ-OVERWATCH-009) ; seule l'attaque, l'ouverture/fermeture de porte… consomment ou non l'action selon la règle ci-dessous.
- **Résolution (product owner) :** une attaque ne coûte rien (ni PC ni PM). Chaque activation permet UNE seule action (attaquer, Overwatch, etc. — l'Overwatch a depuis été retiré de cette liste) et autant de déplacement que les PM le permettent : bouger+agir, agir+bouger, bouger+agir+bouger, bouger seul, agir seul. Le moteur suit `turn.actionUsed` (refus `ACTION_ALREADY_USED`) ; ATTACK et OVERWATCH exigent le personnage actif.
- **Historique :** l'interprétation ci-dessous était celle d'avant la décision.

- **Rule:** RULE-COMBAT-001
- **Interpretation:** `ATTACK` exige `phase = ACTIVATION` et `activePlayerId = playerId` ; elle ne consommait ni PC ni état d'activation (état avant décision).
- **Impact:** à raccorder avec le coût/limite d'actions par activation.
- **Test required:** `attack.spec.ts` (validation).

## OQ-OVERWATCH-001 — Durée de l'Overwatch et réactions multiples (RÉSOLUE)

- **Rule:** RULE-OVERWATCH-003, RULE-OVERWATCH-013
- **Résolution (product owner) :** un Overwatch non tiré dure tout le tour (il couvre les activations adverses du tour entier) et est retiré au refresh du tour suivant, au moment où chaque joueur reçoit ses nouveaux PC ; il peut alors dépenser ces PC pour replacer ses personnages pendant la phase de placement. Une fois l'attaque d'opportunité réalisée, le personnage n'est plus en Overwatch. Un Overwatch refusé reste actif (OQ-OVERWATCH-005).
- **Historique :** « l'Overwatch dure jusqu'à la réaction (tir ou renoncement), qui l'efface ; sinon il est effacé au refresh du tour suivant. Une seule réaction par Overwatch » (hypothèse du moteur, non confirmée) ; le refus effaçait aussi l'Overwatch.
- **Test:** `overwatch.spec.ts` (cycle de vie, refresh), `full-turn.spec.ts`.

## OQ-OVERWATCH-002 — Plusieurs personnages en Overwatch voient le mouvement

- **Rule:** RULE-OVERWATCH-004
- **Interpretation (actuelle) :** le premier personnage en Overwatch, dans l'ordre de l'état, qui voit l'adversaire réagit ; un seul déclencheur à la fois. Les autres réagissent ensuite (voir OQ-OVERWATCH-007).
- **Reason:** la règle ne précise ni le choix du réagissant (joueur, proximité) ni les réactions en chaîne.
- **Impact:** choix potentiellement arbitraire ; les autres Overwatch restent intacts.
- **Test required:** `overwatch.spec.ts` (deux personnages en Overwatch).

## OQ-OVERWATCH-003 — Déclencheurs de l'Overwatch autres que le déplacement (RÉSOLUE)

- **Rule:** RULE-OVERWATCH-002, RULE-OVERWATCH-010
- **Résolution (product owner) :** deux déclencheurs : (a) un adversaire ENTRE dans la ligne de vue pendant un déplacement (il s'arrête) ; (b) un adversaire DÉJÀ dans la ligne de vue (au moment de l'Overwatch ou au début de son activation) qui tente de se déplacer OU de faire une action (attaque, ouverture/fermeture de porte…) : l'opportunité se déclenche avant l'exécution de la commande annoncée (voir OQ-OVERWATCH-004).
- **Historique :** « seul un déplacement qui entre dans la ligne de vue déclenche l'Overwatch ; les attaques et autres actions adverses ne le déclenchent pas » (un adversaire immobile pouvait agir sans réaction).
- **Test:** `overwatch.spec.ts` (déclencheur a et b).

## OQ-OVERWATCH-004 — Périmètre exact du déclencheur « action » (b)

- **Rule:** RULE-OVERWATCH-010
- **Source:** décision PO (« se déplacer OU faire une action (ATTACK, OPEN_DOOR, CLOSE_DOOR…) »).
- **Interpretation:** sont concernées les commandes `MOVE_CHARACTER`, `ATTACK`, `OPEN_DOOR`, `CLOSE_DOOR` du personnage ACTIF ; `END_TURN`, `PASS`, la sélection et les commandes de phase n'ouvrent aucune réaction. La ligne de vue est évaluée sur la case du personnage au moment de la commande (fumée et portes comprises), pas sur sa case d'arrivée. La commande est validée à blanc (`DryRng`, qui renvoie toujours la borne basse, aucun tirage de la partie) : une commande invalide ne déclenche pas la réaction et reçoit son refus habituel.
- **Reason:** la liste d'actions n'est pas exhaustive dans la décision ; la validation à blanc évite un déclenchement à tort.
- **Impact:** la validité d'une commande dépendant d'un jet n'est évaluée qu'avec des dés au minimum (aucune commande actuelle ne dépend d'un jet pour être valide). Toute future action (grenade, fumée…) devra être ajoutée à la liste des commandes annonçables.
- **Test required:** `overwatch.spec.ts` (déplacement, attaque, portes, commande invalide sans réaction), `attack.spec.ts`.

## OQ-OVERWATCH-005 — Refus de l'attaque d'opportunité (RÉSOLUE)

- **Rule:** RULE-OVERWATCH-012
- **Résolution (product owner) :** l'attaque d'opportunité est toujours optionnelle (`OVERWATCH_FIRE` ou `OVERWATCH_DECLINE`). Refusée, l'Overwatch reste actif mais cet overwatcher ne se redéclenche pas contre ce même adversaire pendant son activation courante.
- **Implémentation :** `turn.overwatchWaived` (liste d'overwatchers), remis à zéro à chaque changement d'activation ; il vaut pour (a) comme pour (b), même si l'adversaire sort puis rentre dans la ligne de vue. L'overwatcher réagit de nouveau pour l'activation suivante (autre personnage, ou même joueur).
- **Test:** `overwatch.spec.ts` (DECLINE).

## OQ-OVERWATCH-006 — Retrait des Overwatch (RÉSOLUE)

- **Rule:** RULE-OVERWATCH-013
- **Résolution (product owner) :** les Overwatch sont retirés au DÉBUT DU TOUR, au refresh, quand chaque joueur reçoit ses nouveaux PC ; il peut dépenser ces PC pour remettre ses personnages en Overwatch pendant la phase de placement qui suit l'initiative.
- **Historique :** une interprétation intermédiaire (« début du tour d'une équipe » = première activation de l'équipe dans le tour, `turn.startedPlayers`) a été envisagée puis abandonnée ; le comportement d'origine de `refreshTurn` (`overwatch: false` pour tous) est conservé.
- **Test:** `overwatch.spec.ts` (cycle de vie), `full-turn.spec.ts`.

## OQ-OVERWATCH-007 — Plusieurs overwatchers : enchaînement des réactions

- **Rule:** RULE-OVERWATCH-004, RULE-OVERWATCH-011
- **Interpretation:** quand plusieurs overwatchers voient le même adversaire sur une commande annoncée (b), ils réagissent l'un après l'autre (ordre de l'état) avant que la commande ne soit exécutée ; chaque réponse (tir ou refus) l'exclut des suivants. Pour le déclencheur (a), un seul overwatcher réagit au pas d'arrêt ; les autres qui voient aussi cette case réagissent à la commande suivante via (b).
- **Reason:** la décision ne précise pas la gestion de plusieurs réactions simultanées.
- **Impact:** un adversaire très exposé peut subir plusieurs attaques d'opportunité avant d'agir.
- **Test required:** `overwatch.spec.ts` (plusieurs overwatchers, FIRE puis DECLINE).

## OQ-OVERWATCH-008 — Reprise de la commande annoncée

- **Rule:** RULE-OVERWATCH-011
- **Interpretation:** après la réaction, la commande mémorisée (`PendingReaction.resume`) est rejouée telle quelle si l'adversaire est vivant (même chemin de déplacement, mêmes cible et arme) ; si l'adversaire est tué, son activation se termine sans reprise ; si la commande est refusée à la reprise (le tir a modifié l'état, ex. la cible ou l'arme n'est plus valide), elle est abandonnée avec l'événement `OVERWATCH_RESUME_REFUSED` et l'activation continue. Pour le déclencheur (a), le déplacement est tronqué à la case d'arrêt, puis le reste du chemin est rejoué après la réaction (décision du product owner : l'Overwatch interrompt l'action, il ne la fait pas perdre ; si le personnage survit, il poursuit son déplacement puis peut faire son action).
- **Reason:** la décision demande la reprise mais pas le cas d'une commande devenue invalide.
- **Impact:** un joueur peut perdre une action annoncée si le tir l'a rendue impossible.
- **Test required:** `overwatch.spec.ts` (reprise, cible tuée, reprise refusée).

## OQ-OVERWATCH-009 — Phase de placement : déroulement exact (RÉSOLUE)

- **Rule:** RULE-OVERWATCH-001, RULE-OVERWATCH-008, RULE-OVERWATCH-009
- **Source:** décision PO (redéfinition de l'Overwatch, puis rectification de l'ordre du tour).
- **Résolution (product owner) :** l'ordre d'un tour est : (1) refresh : tous les joueurs reçoivent leurs 2 PC et tous les personnages en Overwatch cessent de l'être ; (2) initiative pour déterminer qui commence ; (3) phase d'Overwatch : à tour de rôle, en commençant par le gagnant de l'initiative, le joueur décide soit de placer UN SEUL personnage en Overwatch (1 PC), soit de PASSER ; puis c'est à l'autre joueur de décider (un seul personnage ou passer), et ainsi de suite jusqu'à ce que les DEUX joueurs passent (deux passes consécutives ; si un joueur passe puis que l'autre place un personnage, la main revient au premier, qui peut encore placer) ; (4) phase d'activation des personnages qui ne sont pas en Overwatch.
- **Implémentation :** commandes `OVERWATCH` (un personnage, la main passe à l'autre joueur) et `PASS_OVERWATCH` (anciennement `END_OVERWATCH_PLACEMENT`) ; événements `OVERWATCH_PLACED`, `OVERWATCH_PASSED` (anciennement `OVERWATCH_PLACEMENT_ENDED`, un par passe) et `OVERWATCH_PHASE_ENDED` ; `turn.activePlayerId` = joueur qui doit décider ; `turn.overwatchPasses` (passes consécutives, remis à 0 par un placement) et `turn.overwatchDecisions` (placements + passes). La relance d'initiative (1 PC) reste possible tant que `overwatchDecisions` vaut 0 ; le nouveau gagnant décide alors en premier. Passe automatique (décision du PO, OQ-OVERWATCH-011) : un joueur qui doit décider mais ne peut rien placer (moins de 1 PC ou aucun personnage éligible) passe seul (`OVERWATCH_PASSED` avec `auto: true`). Un personnage placé est marqué `overwatch` ET `activated` : non activable (`IN_OVERWATCH`), traité comme déjà activé pour la fin de tour ; après son tir il reste non activable (`ALREADY_ACTIVATED`). Si plus aucun personnage n'est activable après la phase, le tour se termine aussitôt et le suivant démarre. Voir OQ-OVERWATCH-010 pour les points laissés ouverts.
- **Test:** `overwatch.spec.ts` (alternance stricte, refus hors tour de décision, passe puis placement adverse, deux passes, aucun PC), `turn.spec.ts` (phase, relance avant/après décision, tour suivant), `legal-actions.spec.ts`, `tests/integration/full-turn.spec.ts`.
- **Historique (version précédente, remplacée par la rectification du PO) :** chaque joueur décidait EN ENTIER à la suite : le gagnant de l'initiative plaçait autant de personnages qu'il voulait tant qu'il avait des PC puis confirmait avec `END_OVERWATCH_PLACEMENT` (`OVERWATCH_PLACEMENT_ENDED`), puis l'autre joueur faisait de même ; la relance d'initiative restait possible tant qu'aucun personnage n'était placé et que le gagnant n'avait pas confirmé.
- **Historique (interprétation initiale) :** voir ci-dessus pour (3) et (5) : placé = `overwatch` + `activated` ; seuls les personnages vivants et non déjà placés peuvent être placés.

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
- **Implémentation :** valeurs dans `packages/content/src/data/equipment.json` (`weapon.unarmed` 2, `weapon.melee` 4, `weapon.pistol` 4, `weapon.mental` 4, `weapon.automatic` 5) ; l'attaque à mains nues est ajoutée à tout personnage par `createCharacterState`.
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

## OQ-OVERWATCH-010 — Phase Overwatch : cas limites de l'alternance

- **Rule:** RULE-OVERWATCH-008
- **Source:** rectification du PO sur l'ordre du tour (OQ-OVERWATCH-009).
- **Interpretation (actuelle) :** (1) l'alternance est cyclique dans l'ordre des joueurs ; la phase se termine quand le nombre de passes consécutives atteint le nombre de joueurs (deux passes pour deux joueurs) ; un placement remet le compteur à 0. (2) Un joueur qui n'a plus de PC ou plus de personnage éligible reste dans l'alternance mais passe AUTOMATIQUEMENT à chaque fois que la main lui revient (OQ-OVERWATCH-011) ; l'adversaire peut donc enchaîner plusieurs placements de suite. (3) Un joueur qui a passé conserve le droit de placer quand la main lui revient après un placement adverse (conforme à la décision). (4) La relance d'initiative est refusée dès la première décision (placement ou passe) prise par n'importe quel joueur, pas seulement par le gagnant.
- **Reason:** la décision traite le cas à deux joueurs ; le cas à plus de deux joueurs et la passe automatique d'un joueur sans option est tranchée par OQ-OVERWATCH-011 (cas à deux joueurs).
- **Impact:** nombre de clics en phase Overwatch ; parties à plus de deux joueurs (hors périmètre actuel).
- **Test required:** `overwatch.spec.ts` (aucun PC des deux côtés, passe puis placement adverse), `turn.spec.ts` (relance après une passe).

## OQ-OVERWATCH-011 — Relance d'initiative et passe automatique (RÉSOLUE)

- **Rule:** RULE-OVERWATCH-008, RULE-TURN-006
- **Source:** décision PO : « si un joueur n'a plus de personnage à mettre en Overwatch, il passe automatiquement ».
- **Résolution (product owner) :** un joueur qui doit décider mais « ne peut plus placer » passe automatiquement. Définition : moins de 1 PC OU aucun personnage éligible (vivant, ni en Overwatch ni déjà `activated`).
- **Implémentation :** `settleOverwatchPhase` (`turn/start-turn.ts`) boucle sur ce test et appelle `passOverwatchDecision(..., auto = true)` (événement `OVERWATCH_PASSED` avec `auto: true`) ; elle est appelée au démarrage du tour (`startTurn`), après un placement, après une passe et après une relance d'initiative. Deux passes consécutives, automatiques ou non, terminent la phase (`OVERWATCH_PHASE_ENDED`) et ouvrent l'activation (ou, si plus personne n'est activable, le tour suivant démarre aussitôt). Garde-fou : sans aucun personnage vivant, aucun passage automatique (états de test sans personnages, évite une boucle de tours vides).
- **Interaction avec la relance d'initiative (choix) :** une passe automatique compte comme une décision (`turn.overwatchDecisions` > 0). Si le gagnant de l'initiative ne peut rien placer dès le début du tour, il passe seul immédiatement et ne peut donc PAS relancer (`OVERWATCH_DECISIONS_STARTED`) : la relance reste possible uniquement tant qu'aucune décision, manuelle ou automatique, n'a eu lieu, c'est-à-dire quand le gagnant peut encore placer. Après une relance, le règlement automatique s'applique au nouveau gagnant (ou à l'ancien s'il regagne sans PC) : il peut passer aussitôt.
- **Reason:** le cas « gagnant sans option qui voudrait relancer » n'a pas été tranché explicitement par le PO ; relancer coûte 1 PC, donc un gagnant sans PC ne pourrait de toute façon pas relancer ; seul le cas « PC disponibles mais aucun personnage éligible » est réellement concerné.
- **Impact:** un gagnant sans personnage éligible ne peut pas relancer pour changer l'ordre d'initiative.
- **Test:** `turn.spec.ts` (« passe automatique d'Overwatch »), `overwatch.spec.ts`, `tests/integration/full-turn.spec.ts`.

## OQ-BOARD-001 — Mise en place sur un plateau aux zones verrouillées

- **Rule:** (aucune règle source : mise en place du client, voir `placeTeams`)
- **Interpretation (actuelle) :** chaque équipe est ancrée sur un `ENTRY_POINT` (les deux plus éloignés) et ne reçoit que des cases joignables depuis son ancre, PM illimités, avec l'état initial des portes, les sens uniques et les cases impraticables respectés (la salle d'armes du château, derrière une porte renforcée fermée, n'est donc jamais peuplée au départ). Hors cet ajout, la règle de placement existante est inchangée.
- **Reason:** le livre de règles ne dit pas comment les équipes se placent sur une carte à plusieurs entrées ni si une zone verrouillée peut contenir un personnage au départ.
- **Impact:** équilibre de départ des cartes ; le château donne un accès initial asymétrique (la porte de bois vers la chapelle est fermée, la poterne rejoint le hall par l'escalier à sens unique).
- **Test required:** `castle-setup.spec.ts` (entrées, cases distinctes, zones joignables).

## OQ-BOARD-002 — Attribution des entrées aux joueurs

- **Rule:** (aucune règle source)
- **Interpretation (actuelle) :** l'attribution d'une entrée à une équipe suit l'ordre des ids (le premier `ENTRY_POINT` par id va au premier joueur) ; sur le château, le joueur 1 démarre à la poterne et le joueur 2 à la grande porte.
- **Reason:** les règles ne précisent pas quelle équipe occupe quelle entrée.
- **Impact:** avantage éventuel d'un côté de la carte.
- **Test required:** `castle-setup.spec.ts` (chaque équipe prend une entrée différente).

## OQ-FLAG-001 — Mise en place des drapeaux (Capture du drapeau)
- **Rule:** RULE-VICT-002 : le gagnant du jet de mise en place pose le premier drapeau sur une case d'objectif ; les joueurs alternent jusqu'à 3 drapeaux chacun.
- **Interpretation (actuelle) :** pose automatique et déterministe au démarrage : les joueurs alternent dans l'ordre de la partie (joueur 1 d'abord, pas de jet de mise en place), chacun sur la case d'objectif libre la plus proche de ses propres personnages ; une seule case d'objectif par drapeau. Le plateau doit avoir au moins 6 cases d'objectif (château : 6, plateau de dev : 6).
- **Reason:** le choix libre du joueur n'est pas encore dans l'interface ; la règle ne dit pas non plus s'il peut y avoir plusieurs drapeaux sur une case d'objectif.
- **Impact:** équilibre de la partie ; la future pose manuelle remplacera cette heuristique.
- **Test required:** `flags.spec.ts` (placement).

## OQ-FLAG-002 — « Aucun ennemi adjacent » pour récupérer un drapeau
- **Rule:** RULE-OBJ-010 : récupérer un drapeau adjacent en phase d'action « si aucun ennemi n'est adjacent ».
- **Interpretation (actuelle) :** aucun ennemi (vivant) sur la case du personnage ni sur une case voisine par arête (comme le corps à corps). Le personnage peut être sur la case du drapeau (drapeau déposé à la mort d'un porteur) ou sur une case voisine ; il ne récupère que les drapeaux ADVERSES, au sol.
- **Reason:** la règle ne dit pas si l'ennemi ne doit pas être adjacent au personnage ou au drapeau, ni si l'on peut reprendre son propre drapeau tombé.
- **Impact:** facilité de récupération des drapeaux.
- **Test required:** `flags.spec.ts` (récupérer un drapeau).

## OQ-FLAG-003 — Où planter : « camp » ou « point d'entrée ennemi » ?
- **Rule:** RULE-VICT-002 : victoire quand 2 drapeaux ennemis sont plantés « dans son propre camp » ; RULE-OBJ-013 : planter depuis une case adjacente à « un point d'entrée ennemi » sans ennemi adjacent à ce point.
- **Interpretation (actuelle) :** les deux textes se contredisent ; on plante dans SON camp (le point d'entrée où l'équipe débarque), depuis ce point ou une case voisine, sans ennemi adjacent à ce point d'entrée. Un camp = le point d'entrée de départ de l'équipe (`GameState.camps`).
- **Reason:** contradiction entre la condition de victoire et la règle de plantage.
- **Impact:** toute la dynamique du mode (on ramène les drapeaux chez soi, ou on va les planter chez l'ennemi).
- **Test required:** `flags.spec.ts` (planter, victoire).

## OQ-FLAG-004 — Drapeaux portés : limite, Overwatch, élimination en mode drapeau
- **Rule:** « Les drapeaux n'occupent pas d'inventaire » (RULE-OBJ-010) ; un porteur éliminé dépose son drapeau (RULE-OBJ-012).
- **Interpretation (actuelle) :** aucune limite de drapeaux portés ; récupérer et planter sont chacun l'action unique de l'activation et ne déclenchent PAS l'attaque d'opportunité de l'Overwatch (seules les commandes de déplacement, attaque et portes la déclenchent) ; l'élimination totale de l'équipe adverse reste une victoire dans tous les modes.
- **Reason:** non précisé par les règles.
- **Impact:** un porteur peut cumuler les drapeaux ; l'Overwatch ne punit pas l'action de drapeau.
- **Test required:** `flags.spec.ts`.
