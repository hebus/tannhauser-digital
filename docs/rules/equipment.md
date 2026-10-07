# Équipement

L'équipement est un **contenu** (définitions de données validées par ArkType), jamais de la logique spéciale dans le moteur.

| ID | Règle testable | Événements |
|---|---|---|
| RULE-EQUIP-001 | Chaque personnage a un nombre limité d'emplacements ; l'équipement appartient à l'inventaire. Équiper au-delà des emplacements est refusé. | |
| RULE-EQUIP-002 | Actions d'équipement : attaquer, lancer une grenade, ramasser, déposer, donner, utiliser, ouvrir une caisse le cas échéant. Chacune est une commande avec validation. | `EQUIPMENT_USED` |
| RULE-EQUIP-003 | Ramasser/déposer exige un personnage vivant et adjacent au nœud portant l'équipement. | `EQUIPMENT_PICKED_UP` |
| RULE-EQUIP-004 | Donner : un personnage peut transférer un ou plusieurs équipements à un personnage adjacent ; si le receveur n'a pas l'emplacement adapté, la restriction de la règle s'applique. | `EQUIPMENT_GIVEN` |
| RULE-EQUIP-005 | L'équipement déposé reste dans l'état de jeu sur son nœud et peut être récupéré. | `EQUIPMENT_DROPPED` |
| RULE-EQUIP-006 | Les drapeaux n'occupent pas l'inventaire. | |
| RULE-EQUIP-007 | Un équipement peut déclarer des propriétés de règle (`ignoresSmoke`, restrictions de compétence, portée) lues par les systèmes concernés. | |

## Grenades et fumée

| ID | Règle testable | Événements |
|---|---|---|
| RULE-EQUIP-010 | Lancer une grenade est une action d'équipement : cible = nœud dans la portée de l'équipement ; elle peut traverser des nœuds occupés. | |
| RULE-EQUIP-011 | La grenade affecte les personnages de la zone touchée ; la résolution diffère de l'attaque normale. Les valeurs (dégâts, succès automatiques pour les adjacents) sont des données. | |
| RULE-EQUIP-012 | Une grenade fumigène crée un effet `SMOKE` sur le nœud cible et sa zone d'effet, portée de 8 (donnée). | `SMOKE_STARTED` |
| RULE-EQUIP-013 | La fumée persiste le tour courant et les suivants selon `remainingTurns` ; le refresh la retire (RULE-TURN-003, OQ-TURN-002). | `SMOKE_EXPIRED` |

Exemples de contenu à définir : trousse de soins, munitions supplémentaires, grenades, fumigènes, armes, équipements spéciaux et propres à un personnage.
