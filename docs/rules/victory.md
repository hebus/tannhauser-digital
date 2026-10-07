# Modes de jeu et victoire

Un mode est une **donnée** (PC de départ, jetons, condition de victoire) ; le système de victoire évalue des prédicats après chaque résolution.

| ID | Mode | PC de départ | Victoire |
|---|---|---:|---|
| RULE-VICT-001 | Deathmatch | 2 | Tous les personnages adverses sont éliminés. |
| RULE-VICT-002 | Capture the Flag | 2 | 2 drapeaux ennemis plantés dans son propre camp ; chaque joueur place 3 drapeaux en alternance (le gagnant du jet de mise en place commence). |
| RULE-VICT-003 | Domination | 3 | Les 4 drapeaux d'un joueur sont sur le camp adverse. Scoring : pas de point au tour 1 ; objectif = 1 pt, case d'action = 2 pts, point d'entrée ennemi = 5 pts. |
| RULE-VICT-004 | King of the Hill | 3 | Après 10 tours, le plus de points ; ou élimination de l'équipe adverse. Seul le chef en tête de chaîne marque ; pas de points au tour 1 ; pas de jetons de case/objet. |
| RULE-VICT-005 | Objectifs | 3 | Premier joueur à accomplir 4 objectifs. |
| RULE-VICT-006 | Scénario / histoire | selon scénario | Conditions propres au scénario ; en campagne, conditions de campagne évaluées en fin de scénario. |

## Règles transverses

| ID | Règle testable |
|---|---|
| RULE-VICT-010 | Une condition de victoire est évaluée à chaque événement pertinent ; la partie se termine immédiatement sur victoire (`VICTORY` / `DEFEAT`). Cas simultané : voir OQ-VICT-001. |
| RULE-VICT-011 | Une zone de score ne peut être activée qu'une fois selon le mode (voir OQ-OBJ-002 pour la portée du suivi). |
| RULE-VICT-012 | Activer un point de score termine immédiatement l'activation et le déplacement du personnage (Domination). |
| RULE-VICT-013 | Les renforts entrent au bas de la pile de leur faction (RULE-ABIL-006). |

## Mise en place

| ID | Règle testable |
|---|---|
| RULE-SETUP-001 | La mise en place suit la machine d'états de RULE-TURN-010 ; chaque étape est une commande validée. |
| RULE-SETUP-002 | Les jetons de case/objet sont mélangés puis placés face visible sur chaque case d'action/objet (modes concernés), via la source aléatoire injectable. |
| RULE-SETUP-003 | En King of the Hill, chaque joueur assigne secrètement un équipement et établit une chaîne de commandement (pile ordonnée) ; en Domination/Objectifs, il reçoit ses drapeaux de faction. |
| RULE-SETUP-004 | Campagne : composition conservée entre scénarios ; santé restaurée au début de chaque scénario sauf mention contraire ; l'équipement consommé n'est pas restauré ; l'état de campagne est séparé de l'état de partie. |

## Tests attendus

Un test de victoire par mode ; scoring au tour 1 refusé ; 10 tours en King of the Hill ; quatre objectifs ; reproduction exacte sous graine.
