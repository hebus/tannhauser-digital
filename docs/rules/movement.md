# Déplacement et plateau

Le plateau est un **graphe** de nœuds. La validation de contenu (ArkType) garantit la cohérence du graphe (références d'arêtes valides, couleurs déclarées, etc.).

## Modèle de nœud

| ID | Règle testable |
|---|---|
| RULE-NODE-001 | Un nœud peut porter une liste de `NodeModifier` génériques (dés supplémentaires, modificateur de résultat, etc.). Le catalogue exact est une donnée (voir OQ-NODE-001). |
| RULE-NODE-002 | Un nœud porte **1 à 3 couleurs** (jamais 0, jamais plus de 3). Le plateau peut utiliser plus de 3 couleurs au total. Un nœud avec 0 ou plus de 3 couleurs est rejeté par la validation de contenu. |
| RULE-NODE-003 | Un nœud peut être **impraticable** : aucun personnage ne peut y entrer ni le traverser. Il reste éventuellement présent pour la ligne de vue (voir OQ-LOS-004). |
| RULE-NODE-004 | Un nœud peut ajouter un **coût de déplacement** supplémentaire (+1, +2, ...) à son entrée. Le coût total d'entrée est `coûtBase + surcoût`. |
| RULE-NODE-005 | Un nœud peut porter d'autres bonus/malus (voir RULE-NODE-001) qui s'appliquent aux jets des personnages qui l'occupent ou le ciblent selon la donnée. |

## Arêtes

| ID | Règle testable |
|---|---|
| RULE-MOVE-001 | Une arête normale est bidirectionnelle : si on peut aller de A à B, on peut aller de B à A (hors autres règles). |
| RULE-MOVE-002 | Une arête **à sens unique** n'autorise le déplacement que dans le sens `from -> to`. Elle n'influence pas la ligne de vue (voir RULE-LOS-005). |
| RULE-MOVE-003 | Une porte fermée interdit le déplacement à travers son arête ; ouverte, l'arête redevient normale. |
| RULE-MOVE-004 | Les nœuds séparés par un mur ou une porte ne sont pas adjacents au sens de la règle d'adjacence. |
| RULE-MOVE-005 | Un portail (porte secrète) relie deux nœuds éloignés ; le franchir coûte 1 PM, comme un pas normal, dans les deux sens (OQ-MOVE-005) ; voir `special-rules.md`. |

## Points de mouvement

| ID | Règle testable |
|---|---|
| RULE-MOVE-010 | Un personnage dispose d'un budget de PM issu de sa valeur de Mouvement courante. |
| RULE-MOVE-011 | Entrer dans un nœud coûte son coût d'entrée (RULE-NODE-004) ; le déplacement est refusé si le budget restant est insuffisant (voir OQ-MOVE-002). |
| RULE-MOVE-012 | Un chemin est valide s'il enchaîne des arêtes franchissables dans le bon sens, vers des nœuds praticables et non occupés par un ennemi, dans la limite du budget. |
| RULE-MOVE-013 | Les gravats sont un modificateur de coût de déplacement du nœud (RULE-NODE-004), pas un simple effet visuel. |
| RULE-MOVE-014 | Le pathfinding distingue : adjacence normale, sens unique, porte, porte secrète, traversée spéciale, occupation ennemie, traversée bloquée, coût de terrain. |
| RULE-MOVE-015 | Un personnage ne peut pas entrer dans un nœud occupé par un ennemi, sauf par un passage en force autorisé. |
| RULE-MOVE-016 | Les cases d'action et d'objectif ne font pas partie de la zone de déplacement normale ; les points d'entrée appartiennent à leur zone. |
| RULE-MOVE-017 | Ouvrir ou fermer une porte ne coûte aucun PM, même à 0 PM restant (OQ-DOOR-001). |
| RULE-MOVE-018 | Le déplacement n'est pas bloqué par l'action : il reste permis après l'action de l'activation (PM conservés) et avant elle (RULE-TURN-008). |
| RULE-MOVE-019 | Un déplacement s'arrête sur la première case vue par un adversaire en Overwatch et suspend l'activation (RULE-OVERWATCH-002) ; un déplacement tenté depuis une case déjà vue ouvre la réaction avant d'être exécuté (RULE-OVERWATCH-010). |

Événement : `CHARACTER_MOVED` (chemin, coût payé, PM restants).

## Passage en force

Un personnage ne traverse pas un adversaire, sauf par UN passage en force par activation : duel de Physique (OQ-MOVE-006). Chacun lance 4 dés (difficulté 10 − Physique) ; chaque succès du défenseur annule un succès de l'initiateur, qui doit en garder au moins 1. Succès : le déplacement continue ; échec : arrêt sur la case précédente. La case ennemie ne peut jamais être la case d'arrivée.

| ID | Règle testable | Événements |
|---|---|---|
| RULE-MOVE-020 | Un personnage en déplacement peut tenter de traverser un nœud occupé par un ennemi via un duel physique. | `FORCE_PASSAGE_STARTED`, `PHYSICAL_DUEL_STARTED` |
| RULE-MOVE-021 | Succès : le déplacement se poursuit comme permis. Échec : le passage est refusé. | `FORCE_PASSAGE_SUCCESS`, `FORCE_PASSAGE_FAILED` |
| RULE-MOVE-022 | Selon les conditions de la règle, l'ennemi peut infliger une attaque gratuite de mêlée en cas d'échec. | `COUNTER_ATTACK_TRIGGERED` |
| RULE-MOVE-023 | Ce n'est pas une phase d'action. Une seule tentative par activation (réussie ou non) ; le chemin doit rester dans le budget de PM. | `FORCE_PASSAGE_RESOLVED` |

## Plateformes mobiles

Entité avec sa propre position (nœud) ; les personnages adjacents peuvent monter ; le déplacement de la plateforme emporte les occupants ; ses règles de coût sont des données (RULE-MOVE-030).
