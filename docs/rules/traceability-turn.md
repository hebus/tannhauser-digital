# Traçabilité — système de tours et Points de Commande

Règle → système → implémentation → test. Spécification : §66 (tour), §75 (PC), §83 (événements).
Tests : `packages/core/src/turn/turn.spec.ts` (T) et `packages/core/src/engine/engine.spec.ts` (E).

| ID | Règle | Système | Implémentation | Test |
|---|---|---|---|---|
| RULE-TURN-001 | Refresh de début de tour : PC remis à la valeur du mode, PC non dépensés perdus, personnages vivants réinitialisés (`activated`, `movementLeft` selon la ligne de stats courante) (§66.1) | TurnSystem / refresh | `turn/refresh.ts` (`refreshTurn`), `turn/start-turn.ts` (`startTurn`) | T « refresh de début de tour » ; OQ-TURN-003 |
| RULE-TURN-002 | Les effets de fumée sont décrémentés au refresh et retirés à terme (SMOKE_EXPIRED) (§66.1, §73.2) | TurnSystem / effets | `turn/refresh.ts` | T « décrémente la fumée… » ; OQ-TURN-004 |
| RULE-TURN-003 | Initiative : 1d10 par joueur, égalité = relance des ex æquo (§66.2) | InitiativeSystem | `turn/initiative.ts` (`rollInitiative`), `engine/start-game.ts` | E « relance en cas d'égalité » ; T « enchaîne sur le tour suivant » |
| RULE-TURN-004 | Ordre d'un tour : refresh, initiative, phase OVERWATCH (placements, 1 PC chacun), activations, fin de tour (§66) | TurnSystem | `turn/start-turn.ts` (`startTurn`, `beginActivations`), `turn/handlers.ts` (`advance`), `overwatch/handlers.ts` | T « phase OVERWATCH : enchaînement du tour » ; OQ-TURN-007 (résolue), OQ-OVERWATCH-009 |
| RULE-TURN-005 | Activations alternées ; le gagnant de l'initiative commence ; SELECT_CHARACTER vérifie joueur actif, propriétaire, vivant, non activé (§66.3) | ActivationSystem | `turn/handlers.ts` (`SELECT_CHARACTER`, `END_TURN`) | T « activations alternées », « refus de commandes » |
| RULE-TURN-006 | Le tour se termine quand tous les personnages vivants activables ont été activés (un personnage en Overwatch est traité comme déjà activé) ; le tour suivant démarre (§66.3) ; PASS/END_TURN | ActivationSystem | `turn/handlers.ts` (`advance`, `PASS`) | T « enchaîne sur le tour suivant », « PASS… » ; OQ-TURN-005 |
| RULE-TURN-007 | Événements explicites : TURN_STARTED, TURN_ENDED, COMMAND_POINTS_REFRESHED, INITIATIVE_ROLLED/CHANGED, SMOKE_EXPIRED, PLAYER_PASSED, activation (§83) | Événements | `events/events.ts` | T (séquences d'événements) |
| RULE-TURN-009 | Une seule action par activation (`turn.actionUsed`, ATTACK exige le personnage actif ; l'Overwatch n'est plus une action) ; déplacement libre dans la limite des PM, avant et après l'action (OQ-COMBAT-007) | ActivationSystem | `state/types.ts` (`TurnState.actionUsed`), `combat/attack.ts` | `attack.spec.ts`, `overwatch.spec.ts`, `movement.spec.ts` |
| RULE-TURN-008 | Déterminisme (RNG injecté) et immutabilité de l'état | Moteur | `engine/apply-command.ts`, `turn/*` | T « déterminisme et immutabilité » ; E |
| RULE-PC-001 | Les PC par tour viennent de la configuration de mode, pas d'une constante (§66.1, §75) | Config | `state/types.ts` (`GameConfig`, `config.commandPointsPerTurn`), `state/initial-state.ts` (défaut 2) | T « remet les PC à la valeur de configuration » |
| RULE-PC-002 | Dépense générique de PC, pure, avec raison de refus (§75) | CommandPointService | `turn/command-points.ts` | T « CommandPointService » |
| RULE-PC-003 | Le gagnant de l'initiative peut dépenser 1 PC pour relancer, en phase OVERWATCH avant tout placement (§66.2, §75) | InitiativeSystem + PC | `turn/handlers.ts` (`REROLL_INITIATIVE`) | T « REROLL_INITIATIVE » ; OQ-TURN-006 |
| RULE-PC-005 | Placer un Overwatch coûte 1 PC (phase OVERWATCH, OQ-TURN-007) | Overwatch | `overwatch/handlers.ts` | `overwatch.spec.ts` |
| RULE-PC-004 | Les PC non dépensés sont perdus au refresh suivant (§75) | TurnSystem | `turn/refresh.ts` | T « les PC dépensés sont perdus… », « perd les PC non dépensés… » |
