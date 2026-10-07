# Règles spéciales du plateau

Tous les éléments ci-dessous sont des entités ou propriétés **dans le modèle de données du plateau** (jamais purement visuelles).

## Portes

| ID | Règle testable | Événements |
|---|---|---|
| RULE-DOOR-001 | Une porte est une entité d'état `OPEN` ou `CLOSED` sur une arête. | |
| RULE-DOOR-002 | Fermée : bloque déplacement et ligne de vue (RULE-MOVE-003, RULE-LOS-004). | |
| RULE-DOOR-003 | L'ouvrir se fait depuis un nœud adjacent, pour 0 PM ; la compétence/test selon le type (renforcée, bois) reste hors périmètre. | `DOOR_OPENED` |
| RULE-DOOR-004 | Un personnage adjacent peut fermer une porte ouverte, pour 0 PM. | `DOOR_CLOSED` |

## Porte secrète et passages

| ID | Règle testable | Événements |
|---|---|---|
| RULE-BOARD-001 | Une porte secrète est un portail `SECRET_DOOR` reliant deux nœuds éloignés ; une distance minimale entre extrémités est validée par le contenu. | `SECRET_DOOR_USED` |
| RULE-BOARD-002 | Le joueur déclare l'intention au début de l'activation ; le franchissement coûte 1 PM, dans les deux sens ; le déplacement après la sortie est résolu normalement ; usage répété autorisé si les PM le permettent ; sortie du plateau interdite. | `PORTAL_USED` |
| RULE-BOARD-003 | Jetons de passage optionnels : 1 ou 2 jetons relient deux bords adjacents ; modificateur facultatif de mise en place validé par le contenu. | |

## Cases particulières

| ID | Règle testable |
|---|---|
| RULE-BOARD-010 | **Couvert/secret** : un personnage sur ce nœud peut cibler et être ciblé selon la règle de couleur compatible (voir OQ-LOS-006) ; une cible à couvert peut exiger un résultat naturel de 10. |
| RULE-BOARD-011 | **Tireur d'élite** : peut cibler un personnage de toute case de la même couleur, hors zone ; peut lancer des grenades selon sa règle. |
| RULE-BOARD-012 | **Matière volatile** : cibler selon les conditions de la règle ; un dégât sur ce nœud déclenche un contrôle (trois dés) puis un marqueur gravats/volatile ; le nœud devient définitivement inactif. |
| RULE-BOARD-013 | **Sens unique** : déplacement dans le sens autorisé uniquement ; la direction est explicite (`DirectionalEdge`). La ligne de vue l'ignore (RULE-LOS-005). |
| RULE-BOARD-014 | **Plateforme mobile** : entité avec sa position ; embarquement depuis un nœud adjacent ; déplacement avec occupants (RULE-MOVE-030). |
| RULE-BOARD-015 | **Impraticable / coûteux / bonus-malus** : voir RULE-NODE-003 à RULE-NODE-005. |

## Effets temporaires

| ID | Règle testable | Événements |
|---|---|---|
| RULE-FX-001 | La fumée est un `TimedBoardEffect` (`origin`, `remainingTurns`) ; elle coupe la ligne de vue (RULE-LOS-002). | `SMOKE_STARTED`, `SMOKE_EXPIRED` |
| RULE-FX-002 | Le feu est un effet persistant ou piloté par scénario : entrer dans la zone inflige des succès automatiques et un test physique, pour une durée définie. Un objectif d'incendie peut déclencher un mouvement sans PM. | `FIRE_STARTED` |
| RULE-FX-003 | Les gravats sont placés comme marqueur de nœud avec surcoût de déplacement. | `GRAVATS_PLACED` |

## Overwatch (sur le qui-vive)

Détail et traçabilité : `traceability-overwatch.md` (RULE-OVERWATCH-*) ; structure du tour : `turn-structure.md`.

| ID | Règle testable | Événements |
|---|---|---|
| RULE-OVERWATCH-001 | Mettre un personnage en Overwatch coûte 1 PC ; décision après l'initiative, avant les activations, dans la limite des PC ; le personnage n'est pas activable ce tour. | `COMMAND_POINTS_SPENT`, `OVERWATCH_PLACED` |
| RULE-OVERWATCH-008 | Phase Overwatch : à tour de rôle, en commençant par le gagnant de l'initiative, le joueur place UN SEUL personnage en Overwatch ou PASSE ; puis c'est à l'autre joueur de décider. Après une passe suivie d'un placement adverse, la main revient au premier, qui peut encore placer. La phase s'achève quand les deux joueurs passent consécutivement ; les activations commencent alors. | `OVERWATCH_PLACED`, `OVERWATCH_PASSED`, `OVERWATCH_PHASE_ENDED` |
| RULE-OVERWATCH-002 | Un adversaire qui entre dans la ligne de vue d'un Overwatch en se déplaçant s'arrête sur cette case. | `OVERWATCH_TRIGGERED` |
| RULE-OVERWATCH-010 | Un adversaire déjà dans la ligne de vue qui tente de se déplacer ou d'agir déclenche l'opportunité avant l'exécution de sa commande, qui est exécutée ensuite. | `OVERWATCH_TRIGGERED` (`announced`) |
| RULE-OVERWATCH-005 | L'attaque d'opportunité est optionnelle ; refusée, l'Overwatch reste actif sans se redéclencher contre cet adversaire pendant son activation ; réalisée, le personnage quitte l'Overwatch. | `OVERWATCH_RESOLVED` |
