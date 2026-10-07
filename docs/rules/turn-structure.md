# Structure du tour

Un tour enchaîne : (1) rafraîchissement (PC rendus, Overwatch retirés), (2) initiative, (3) **phase Overwatch** : à tour de rôle, en commençant par le gagnant de l'initiative, le joueur place UN SEUL personnage en Overwatch (1 PC) ou PASSE, jusqu'à ce que les deux joueurs passent consécutivement (un joueur qui ne peut plus placer, c'est-à-dire qui a moins de 1 PC ou aucun personnage éligible, passe automatiquement), (4) activations alternées des personnages qui ne sont pas en Overwatch, fin de tour. Les personnages placés en Overwatch ne sont pas activés ce tour.

## Tour et activation

| ID | Règle testable | Événements |
|---|---|---|
| RULE-TURN-001 | Un tour suit l'ordre : refresh, initiative, phase OVERWATCH (décisions alternées : un seul placement `OVERWATCH` ou une passe `PASS_OVERWATCH` par décision, le gagnant de l'initiative d'abord ; la phase se termine à deux passes consécutives, manuelles ou automatiques : un joueur qui doit décider mais ne peut rien placer passe seul, `OVERWATCH_PASSED` avec `auto: true`, OQ-OVERWATCH-011), phase ACTIVATION, fin de tour (OQ-TURN-007, OQ-OVERWATCH-009). `turn.activePlayerId` désigne, pendant la phase OVERWATCH, le joueur qui doit décider. Toute commande hors phase ou hors tour de décision est rejetée avec une `RuleError`. | `TURN_STARTED`, `OVERWATCH_PLACED`, `OVERWATCH_PASSED`, `OVERWATCH_PHASE_ENDED` |
| RULE-TURN-002 | Au refresh, les PC de chaque joueur sont remis à la valeur du mode ; les PC non dépensés du tour précédent sont perdus. Les Overwatch non tirés sont retirés au même moment (OQ-OVERWATCH-006). | `COMMAND_POINTS_REFRESHED` |
| RULE-TURN-003 | Au refresh, les effets expirants (fumée, jetons temporaires) sont décrémentés/retirés selon leur durée. | `SMOKE_EXPIRED` |
| RULE-TURN-004 | Le premier tour a un traitement spécial : le jet de mise en place tient lieu de jet d'initiative. | `INITIATIVE_ROLLED` |
| RULE-TURN-005 | Initiative : chaque joueur lance un dé et ajoute ses bonus ; le meilleur total gagne. La gestion des égalités est une donnée (voir OQ-TURN-001). | `INITIATIVE_ROLLED` |
| RULE-TURN-006 | Le gagnant de l'initiative peut dépenser 1 PC pour relancer, pendant la phase OVERWATCH tant qu'aucun placement ni aucune passe (manuelle ou automatique) n'a eu lieu ; un gagnant qui doit passer automatiquement dès le début du tour ne peut donc pas relancer (OQ-OVERWATCH-011) ; le nouveau gagnant décide alors en premier ; le résultat final fixe l'ordre de décision des Overwatch puis d'activation. | `INITIATIVE_CHANGED` |
| RULE-TURN-007 | Les joueurs activent leurs personnages en alternance ; un personnage ne s'active qu'une fois par tour. | `CHARACTER_ACTIVATION_STARTED` |
| RULE-TURN-008 | Une activation autorise : déplacement puis action, action puis déplacement, déplacement + action + déplacement, déplacement seul, action seule. UNE seule action par activation (attaquer, ouvrir/fermer une porte… ; l'Overwatch n'en est plus une, RULE-OVERWATCH-001) ; autant de déplacement que les PM le permettent. Suivi : `turn.actionUsed`. | `CHARACTER_MOVED`, `CHARACTER_ACTION_STARTED/COMPLETED` |
| RULE-TURN-009 | Le tour se termine quand tous les personnages vivants activables ont été activés (un personnage en Overwatch est traité comme déjà activé ; un joueur dont tous les personnages sont en Overwatch ne bloque pas la partie) ; la fin de tour émet un événement et prépare le refresh suivant. | `CHARACTER_ACTIVATION_ENDED` |
| RULE-TURN-010 | La machine de mise en place suit l'ordre : mode, jetons de mode, faction, plateau, personnages, équipement, jetons d'équipe, entrées, mise en place spécifique au mode. | `SETUP_COMPLETED` |

## Points de commandement (PC)

Le service de PC est générique : `canSpend(playerId, amount)` et `spend(playerId, amount, reason)`. Les coûts et usages sont des données.

| ID | Règle testable |
|---|---|
| RULE-PC-001 | Un joueur ne peut pas dépenser plus de PC qu'il n'en possède ; la dépense échoue sans modifier l'état. |
| RULE-PC-002 | Relancer le jet de mise en place ou d'initiative coûte 1 PC. |
| RULE-PC-003 | 1 PC ajoute des PM pendant une activation (quantité en donnée). |
| RULE-PC-004 | Placer un personnage en Overwatch coûte 1 PC, pendant la phase Overwatch, à son tour de décider (RULE-OVERWATCH-001, RULE-OVERWATCH-008). |
| RULE-PC-005 | 1 PC augmente temporairement une caractéristique du montant autorisé ; l'effet expire à la fin de la durée définie. |
| RULE-PC-006 | 1 PC permet une contre-attaque après une attaque éligible ; elle utilise la plus basse caractéristique applicable. |
| RULE-PC-007 | 1 PC, juste après un test physique, annule une blessure lorsque c'est permis. |
| RULE-PC-008 | 3 PC, avant une activation, déploient un renfort (voir `abilities.md`, RULE-ABIL-006). |
| RULE-PC-009 | Les PC ne peuvent pas être dépensés pour une unité qui l'interdit (`canSpendCommandPoints: false`). |
| RULE-PC-010 | Les PC de départ dépendent du mode (2 ou 3 selon le mode, voir `victory.md`). |

## Overwatch (sur le qui-vive)

Les lignes RULE-OW-* ci-dessous sont l'ancienne formulation, conservée pour l'historique ; la référence est `traceability-overwatch.md` (RULE-OVERWATCH-*). Mécanique actuelle : placement (un personnage par décision, décisions alternées, passe possible) en phase OVERWATCH pour 1 PC ; attaque d'opportunité OPTIONNELLE déclenchée par (a) l'entrée d'un adversaire dans la ligne de vue pendant un déplacement (le déplacement s'arrête) ou (b) une tentative de déplacement/action d'un adversaire déjà en vue (la réaction passe avant la commande annoncée, qui est reprise ensuite).

| ID | Règle testable | Événements |
|---|---|---|
| RULE-OW-001 | Obsolète : remplacée par RULE-OVERWATCH-001 (placement en phase OVERWATCH pour 1 PC ; l'ancienne version « action du personnage actif, sans PC » est abandonnée). | `OVERWATCH_PLACED` |
| RULE-OW-002 | Obsolète : voir RULE-OVERWATCH-002 (déclenchée par un déplacement adverse entrant dans la ligne de vue ; autres déclencheurs : OQ-OVERWATCH-003). | `OVERWATCH_TRIGGERED` |
| RULE-OW-003 | Voir RULE-OVERWATCH-005 : tir = attaque normale, échange attaque/défense habituel. | `OVERWATCH_RESOLVED` |
| RULE-OW-004 | Voir RULE-OVERWATCH-005 : cible éliminée = activation adverse terminée. | `CHARACTER_DEFEATED` |
| RULE-OW-005 | Voir RULE-OVERWATCH-006 : l'Overwatch est effacé après la réaction (durée : OQ-OVERWATCH-001). | |

## Événements

Catalogue de référence : `GAME_STARTED`, `SETUP_COMPLETED`, `TURN_STARTED`, `COMMAND_POINTS_REFRESHED`, `INITIATIVE_ROLLED`, `INITIATIVE_CHANGED`, `CHARACTER_ACTIVATION_STARTED`, `CHARACTER_MOVED`, `CHARACTER_ACTION_STARTED`, `CHARACTER_ACTION_COMPLETED`, `CHARACTER_ACTIVATION_ENDED`, `COMMAND_POINTS_SPENT`, `OVERWATCH_PLACED`, `OVERWATCH_PASSED`, `OVERWATCH_PHASE_ENDED`, `OVERWATCH_TRIGGERED`, `OVERWATCH_RESOLVED`, `OVERWATCH_RESUME_REFUSED`, `DEFENSE_ROLLED`, `REINFORCEMENT_DEPLOYED`, `VICTORY`, `DEFEAT`.
