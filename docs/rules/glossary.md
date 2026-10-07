# Glossaire

Le moteur utilise des **identifiants canoniques** (anglais, `SCREAMING_SNAKE_CASE` ou kebab-case selon le type) ; les libellés localisés vivent hors moteur.

| Terme canonique | Libellé FR | Définition technique |
|---|---|---|
| `character` | personnage | Unité jouable (héros, troupe, mercenaire) avec caractéristiques, santé, inventaire |
| `faction` | faction | Camp d'appartenance (Union, Reich, Matriarchy, Shogunate) ; relations ALLY/ENEMY/NEUTRAL en données |
| `node` | nœud / case | Sommet du graphe du plateau ; porte 1 à 3 couleurs |
| `edge` | arête | Lien entre deux nœuds ; bidirectionnel ou à sens unique |
| `color` | couleur | Étiquette de visibilité portée par les nœuds ; le plateau peut compter plus de 3 couleurs |
| `zone` | zone | Regroupement de nœuds de déplacement ; les murs/portes séparent les zones |
| `objective` | objectif | Élément de scénario/mode à accomplir (un ou deux stades) |
| `flag` | drapeau | Marqueur planté/capturé selon le mode |
| `weapon` | arme | Équipement d'attaque avec type de jet et réserve de dés |
| `equipment` | équipement | Jeton d'inventaire, occupe un emplacement |
| `activation` | activation | Tour de jeu d'un personnage : déplacements (selon ses PM) et au plus une action |
| `action` | action | Acte majeur d'une activation, une seule par activation : attaquer, ouvrir/fermer une porte, etc. Ne coûte ni PC ni PM (l'Overwatch n'est plus une action) |
| `move` | déplacement | Dépense de points de mouvement le long d'un chemin |
| `attack` | attaque | Résolution d'un jet de combat contre une cible |
| `defense` | défense / parade | Jet de Physique du défenseur ; chaque succès annule une blessure |
| `wound` | blessure | Succès du jet d'attaque, avant parade |
| `damage` | dégât | Blessure non parée : perte d'un niveau de santé |
| `status` | statut | État temporaire (overwatch, blessé, etc.) |
| `ability` / `competency` | capacité / compétence | Aptitude de données requise ou donnant un bonus |
| `scenario` | scénario | Définition de contenu : carte, mise en place, objectifs, victoire |
| `victory_condition` | condition de victoire | Prédicat évalué par le système de victoire |
| `PC` (`commandPoints`) | points de commandement | Ressource tactique rafraîchie à chaque tour |
| `PM` (`movementPoints`) | points de mouvement | Budget de déplacement d'une activation |
| `LdM` / `LOS` | ligne de vue | Relation de visibilité réciproque entre deux nœuds |
| `test` | test | Jet sans opposition |
| `duel` | duel | Jets opposés |
| `overwatch` | sur le qui-vive | État pris pendant la phase Overwatch pour 1 PC (le personnage n'est pas activé ce tour) : un adversaire qui entre dans sa ligne de vue en se déplaçant s'arrête, ou qui tente de bouger/agir depuis sa ligne de vue est interrompu ; l'attaque d'opportunité est optionnelle |
| `placement` | placement (phase OVERWATCH) | Phase entre l'initiative et les activations où, à tour de rôle (gagnant de l'initiative d'abord), chaque joueur place UN SEUL personnage en Overwatch (1 PC) ou passe ; elle s'achève quand les deux joueurs passent consécutivement ; un joueur qui ne peut plus placer (moins de 1 PC ou aucun personnage éligible) passe automatiquement |
| `pass_overwatch` | passe (phase OVERWATCH) | Décision de ne placer aucun personnage en Overwatch (commande `PASS_OVERWATCH`, événement `OVERWATCH_PASSED`, avec `auto: true` pour une passe automatique) ; deux passes consécutives (`turn.overwatchPasses`) terminent la phase (`OVERWATCH_PHASE_ENDED`) |
| `reaction` | réaction | Interruption d'une activation adverse (`turn.reaction`) : le joueur en Overwatch tire (attaque d'opportunité) ou renonce, puis l'activation reprend ; la commande adverse annoncée (déplacement/action) est alors exécutée |
| `smoke` | fumée | Effet de plateau temporaire qui coupe la ligne de vue |
| `door` | porte | Entité d'état OPEN/CLOSED sur une arête |
| `portal` | portail | Lien non adjacent entre deux nœuds (porte secrète) |
| `rubble` | gravats | Modificateur de coût de déplacement d'un nœud |
| `modifier` | modificateur | Bonus/malus (dés supplémentaires, modificateur de résultat, réussite/échec auto) |

## Valeurs de caractéristique

Trois notions distinctes, jamais confondues dans le code : valeur **courante** (selon la santé), valeur **maximale** (niveau de santé le plus élevé), valeur **la plus haute de la colonne**. Voir `abilities.md`.
