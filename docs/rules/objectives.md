# Objectifs et drapeaux

## Objectifs en deux stades

| ID | Règle testable | Événements |
|---|---|---|
| RULE-OBJ-001 | Un personnage adjacent à un jeton d'objectif peut le commencer pendant sa phase d'action. | `OBJECTIVE_STARTED` |
| RULE-OBJ-002 | Premier stade : l'objectif passe à l'état « à moitié accompli ». Second stade : il passe à « accompli » (drapeau de faction). | `OBJECTIVE_HALF_COMPLETED`, `OBJECTIVE_COMPLETED` |
| RULE-OBJ-003 | Objectif principal : un personnage possédant la compétence requise accomplit les deux stades en une phase d'action ; sinon, un seul stade. Les conditions liées à la faction propriétaire sont des données (voir OQ-OBJ-001). | |
| RULE-OBJ-004 | Objectif secondaire : même schéma ; sans la compétence requise, un seul stade. | |
| RULE-OBJ-005 | Sans compétence requise, un jet de dé permet l'accomplissement sur 6 ou plus ; sinon la phase d'action est perdue. | |
| RULE-OBJ-006 | Un joueur ne peut pas accomplir deux fois le même objectif ; il peut tenter un objectif déjà accompli par l'adversaire ; chaque camp peut accomplir une moitié du même objectif. | |
| RULE-OBJ-007 | L'état d'objectif est sérialisé (aucun état caché côté rendu). | |

## Drapeaux (modes à drapeaux)

| ID | Règle testable | Événements |
|---|---|---|
| RULE-OBJ-010 | Un personnage adjacent à un drapeau peut le récupérer en phase d'action si aucun ennemi n'est adjacent. | `FLAG_CAPTURED` |
| RULE-OBJ-011 | Un personnage blessé ne peut pas manipuler un drapeau. | |
| RULE-OBJ-012 | Quand un personnage porteur est éliminé, son drapeau est déposé sur son nœud. | |
| RULE-OBJ-013 | Planter un drapeau ennemi : phase d'action depuis un nœud adjacent à un point d'entrée ennemi sans ennemi adjacent à ce point. Plusieurs drapeaux peuvent coexister sur un point d'entrée. | `FLAG_PLANTED` |
| RULE-OBJ-014 | Le jeton d'objectif d'un personnage éliminé est retiré de la chaîne de commandement. | |

Les modes (valeurs de points, nombres de drapeaux) sont décrits dans `victory.md`.
