# Structure du tour

Un tour enchaîne : rafraîchissement, initiative, activations alternées, fin de tour. L'Overwatch n'est plus une phase : c'est une action prise pendant une activation.

## Tour et activation

| ID | Règle testable | Événements |
|---|---|---|
| RULE-TURN-001 | Un tour suit l'ordre : refresh, initiative, activations, fin de tour (l'Overwatch est une action d'activation, OQ-TURN-007). Toute commande hors phase est rejetée avec une `RuleError`. | `TURN_STARTED` |
| RULE-TURN-002 | Au refresh, les PC de chaque joueur sont remis à la valeur du mode ; les PC non dépensés du tour précédent sont perdus. | `COMMAND_POINTS_REFRESHED` |
| RULE-TURN-003 | Au refresh, les effets expirants (fumée, jetons temporaires) sont décrémentés/retirés selon leur durée. | `SMOKE_EXPIRED` |
| RULE-TURN-004 | Le premier tour a un traitement spécial : le jet de mise en place tient lieu de jet d'initiative. | `INITIATIVE_ROLLED` |
| RULE-TURN-005 | Initiative : chaque joueur lance un dé et ajoute ses bonus ; le meilleur total gagne. La gestion des égalités est une donnée (voir OQ-TURN-001). | `INITIATIVE_ROLLED` |
| RULE-TURN-006 | Le gagnant de l'initiative peut dépenser 1 PC pour relancer ; le résultat final fixe l'ordre d'activation. | `INITIATIVE_CHANGED` |
| RULE-TURN-007 | Les joueurs activent leurs personnages en alternance ; un personnage ne s'active qu'une fois par tour. | `CHARACTER_ACTIVATION_STARTED` |
| RULE-TURN-008 | Une activation autorise : déplacement puis action, action puis déplacement, déplacement + action + déplacement, déplacement seul, action seule. UNE seule action par activation (attaquer, Overwatch, etc. en sont) ; autant de déplacement que les PM le permettent. Suivi : `turn.actionUsed`. | `CHARACTER_MOVED`, `CHARACTER_ACTION_STARTED/COMPLETED` |
| RULE-TURN-009 | Le tour se termine quand tous les personnages actifs ont été activés ; la fin de tour émet un événement et prépare le refresh suivant. | `CHARACTER_ACTIVATION_ENDED` |
| RULE-TURN-010 | La machine de mise en place suit l'ordre : mode, jetons de mode, faction, plateau, personnages, équipement, jetons d'équipe, entrées, mise en place spécifique au mode. | `SETUP_COMPLETED` |

## Points de commandement (PC)

Le service de PC est générique : `canSpend(playerId, amount)` et `spend(playerId, amount, reason)`. Les coûts et usages sont des données.

| ID | Règle testable |
|---|---|
| RULE-PC-001 | Un joueur ne peut pas dépenser plus de PC qu'il n'en possède ; la dépense échoue sans modifier l'état. |
| RULE-PC-002 | Relancer le jet de mise en place ou d'initiative coûte 1 PC. |
| RULE-PC-003 | 1 PC ajoute des PM pendant une activation (quantité en donnée). |
| RULE-PC-004 | Placer un personnage en Overwatch ne coûte pas de PC : c'est son action (RULE-OVERWATCH-001). |
| RULE-PC-005 | 1 PC augmente temporairement une caractéristique du montant autorisé ; l'effet expire à la fin de la durée définie. |
| RULE-PC-006 | 1 PC permet une contre-attaque après une attaque éligible ; elle utilise la plus basse caractéristique applicable. |
| RULE-PC-007 | 1 PC, juste après un test physique, annule une blessure lorsque c'est permis. |
| RULE-PC-008 | 3 PC, avant une activation, déploient un renfort (voir `abilities.md`, RULE-ABIL-006). |
| RULE-PC-009 | Les PC ne peuvent pas être dépensés pour une unité qui l'interdit (`canSpendCommandPoints: false`). |
| RULE-PC-010 | Les PC de départ dépendent du mode (2 ou 3 selon le mode, voir `victory.md`). |

## Overwatch (sur le qui-vive)

Les lignes RULE-OW-* ci-dessous sont l'ancienne formulation, conservée pour l'historique ; la référence est `traceability-overwatch.md` (RULE-OVERWATCH-*).

| ID | Règle testable | Événements |
|---|---|---|
| RULE-OW-001 | Obsolète : remplacée par RULE-OVERWATCH-001 (Overwatch = action du personnage actif, sans PC). | `OVERWATCH_PLACED` |
| RULE-OW-002 | Obsolète : voir RULE-OVERWATCH-002 (déclenchée par un déplacement adverse entrant dans la ligne de vue ; autres déclencheurs : OQ-OVERWATCH-003). | `OVERWATCH_TRIGGERED` |
| RULE-OW-003 | Voir RULE-OVERWATCH-005 : tir = attaque normale, échange attaque/défense habituel. | `OVERWATCH_RESOLVED` |
| RULE-OW-004 | Voir RULE-OVERWATCH-005 : cible éliminée = activation adverse terminée. | `CHARACTER_DEFEATED` |
| RULE-OW-005 | Voir RULE-OVERWATCH-006 : l'Overwatch est effacé après la réaction (durée : OQ-OVERWATCH-001). | |

## Événements

Catalogue de référence : `GAME_STARTED`, `SETUP_COMPLETED`, `TURN_STARTED`, `COMMAND_POINTS_REFRESHED`, `INITIATIVE_ROLLED`, `INITIATIVE_CHANGED`, `CHARACTER_ACTIVATION_STARTED`, `CHARACTER_MOVED`, `CHARACTER_ACTION_STARTED`, `CHARACTER_ACTION_COMPLETED`, `CHARACTER_ACTIVATION_ENDED`, `OVERWATCH_PLACED`, `OVERWATCH_TRIGGERED`, `OVERWATCH_RESOLVED`, `DEFENSE_ROLLED`, `REINFORCEMENT_DEPLOYED`, `VICTORY`, `DEFEAT`.
