# Traçabilité : Overwatch

Règles confirmées par le product owner (OQ-TURN-007). Tests : `packages/core/src/overwatch/overwatch.spec.ts` (O) et `tests/integration/` (I).

| ID | Règle | Implémentation | Test |
|---|---|---|---|
| RULE-OVERWATCH-001 | L'Overwatch est une ACTION du personnage actif : commande `OVERWATCH`, sans PC ni PM, qui consomme l'unique action de l'activation (`ACTION_ALREADY_USED` sinon). Événement `OVERWATCH_PLACED`. | `overwatch/handlers.ts` (`OVERWATCH`), `CharacterState.overwatch` | O placement, action déjà utilisée |
| RULE-OVERWATCH-002 | Quand un adversaire entre dans la ligne de vue d'un personnage en Overwatch pendant un déplacement, le déplacement s'arrête sur cette case (PM payés jusque-là) ; événement `OVERWATCH_TRIGGERED`. Seul le déplacement déclenche (OQ-OVERWATCH-003). | `movement/handlers.ts`, `overwatch/trigger.ts` (`findOverwatchTrigger`) | O arrêt du déplacement ; I |
| RULE-OVERWATCH-003 | L'activation adverse est suspendue (`turn.reaction`) : toute autre commande est refusée jusqu'à la réponse du joueur en Overwatch. | `TurnState.reaction`, `PendingReaction` | O commandes refusées pendant la réaction |
| RULE-OVERWATCH-004 | Plusieurs personnages en Overwatch voient la case : le premier dans l'ordre de l'état réagit, un seul par pas (OQ-OVERWATCH-002). | `findOverwatchTrigger` | O deux overwatchers |
| RULE-OVERWATCH-005 | Le joueur en Overwatch a droit à une action : `OVERWATCH_FIRE` (attaque normale avec ciblage et échange attaque/défense habituels) ou `OVERWATCH_DECLINE`. Événement `OVERWATCH_RESOLVED` (`fired`). Si la cible est éliminée, l'activation adverse se termine ; sinon elle reprend. | `overwatch/handlers.ts`, `combat/exchange.ts` | O tir, renoncement, cible tuée ; I |
| RULE-OVERWATCH-006 | Une seule réaction par Overwatch : l'état Overwatch est effacé après la réaction, ou au refresh du tour suivant (hypothèse, OQ-OVERWATCH-001). | `resolveReaction`, `turn/refresh.ts` | O effacement, refresh |
| RULE-OVERWATCH-007 | Seul le joueur concerné peut répondre (`NOT_YOUR_REACTION`) ; sans réaction en attente, FIRE/DECLINE sont refusés (`NO_REACTION`). | `overwatch/handlers.ts` | O refus |
