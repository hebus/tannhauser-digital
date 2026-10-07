# Reste à faire

État au 2026-10-07 : moteur, client jouable (HUD, animations, écran de mise en place, château), IA basique et deux modes de jeu (Deathmatch, Capture du drapeau) sont en place. Les tests, le typecheck, le lint et le build sont verts.

## 1. À vérifier à l'œil (personne ne l'a regardé à l'écran)

- [ ] **Capture du drapeau sur le château** : taille et position des fanions (au sol, portés, plantés), lisibilité des anneaux dorés des cases d'objectif, animations de ramassage / dépôt / plantage, mouvement réduit (touche R).
- [ ] **Explication des modes** : bloc sous la liste « Mode de jeu » (écran de mise en place), ligne « Objectif » et fenêtre « Règles du mode » (touche V) dans le HUD.
- [ ] **Frise des phases** : largeur plafonnée à 780 px ; largeurs inférieures à 1100 px jamais vues ; dialogue de réaction d'Overwatch placé sous la frise (jamais vu déclenché).
- [ ] **Teintes des couleurs de ligne de vue** : les 18 couleurs du château se distinguent-elles toutes ? Lister celles qui se ressemblent.
- [ ] **IA** : badge « IA », refus des clics sur un joueur IA, cadence (700 ms) ; une partie IA contre IA à l'écran.
- [ ] **Déploiement GitHub Pages** après le push : le workflow est-il vert, la page s'ouvre-t-elle ?

## 2. Décisions de règles à confirmer (voir `docs/rules/open-questions.md`)

Capture du drapeau (lectures actuellement retenues, à valider ou corriger) :

- [ ] **OQ-FLAG-003** : on plante dans **son propre camp** (le point d'entrée où l'équipe débarque). Vos règles disent aussi « point d'entrée ennemi » ailleurs. C'est la question qui change le plus la partie.
- [ ] **OQ-FLAG-001** : pose des drapeaux automatique (au plus proche de ses personnages). La règle prévoit un choix libre et un jet de mise en place → ajouter une phase de pose manuelle ?
- [ ] **OQ-FLAG-002** : « aucun ennemi adjacent » lu comme adjacent au personnage ; on ne ramasse que les drapeaux adverses.
- [ ] **OQ-FLAG-004** : pas de limite de drapeaux portés ; ramasser / planter ne déclenche pas l'Overwatch.

Autres questions encore ouvertes : OQ-OVERWATCH-009/010/011, OQ-COMBAT-*, OQ-BOARD-001/002, OQ-LOS-002/003, OQ-VICT-001 (victoires simultanées), etc.

## 3. Nouveaux modes de jeu (`docs/rules/victory.md`)

Rien n'est implémenté pour : **Domination**, **Roi de la colline**, **Objectifs**, **Scénario**. Ils demandent :

- cases d'action et d'objectif sur les plateaux, jetons mélangés (RULE-SETUP-002) ;
- points par case (objectif 1, action 2, point d'entrée ennemi 5), pas de points au tour 1, fin au tour 10 ;
- chaîne de commandement (Roi de la colline) ;
- objectifs en deux stades (`docs/rules/objectives.md`, OQ-OBJ-001/002).

Pour chaque mode : règles dans le core, événements, textes `modeHelp.*` (`apps/client/src/ui/mode-rules.ts`), entrée dans `GAME_MODES`, IA, tests.

## 4. IA

- [ ] Coordination entre personnages (escorte du porteur, défense du camp).
- [ ] Prendre en compte les Overwatch adverses avant d'avancer ; se mettre à couvert.
- [ ] Fermer les portes (jamais fait aujourd'hui) ; utiliser les portails.
- [ ] Niveaux de difficulté ; IA contre IA en mode « spectateur ».
- [ ] Plateau de dev trop petit en Capture du drapeau (1 victoire au drapeau sur 40 parties) : revoir l'emplacement des objectifs ou l'heuristique.

## 5. Client et finition

- [ ] Anglais : une soixantaine de clés manquantes (le français sert de repli).
- [ ] Masquer par défaut les ids de nœuds sur les plateaux dessinés (pièces / couloirs) ; meilleur placement des noms de pièces.
- [ ] Bloquer les touches T / D tant que le panneau de réaction n'est pas visible.
- [ ] Cliquer une porte directement pour l'ouvrir / la fermer.
- [ ] Les boutons du HUD restent actifs pendant le tour de l'IA (les commandes sont refusées avec un message) : les griser.
- [ ] Capture du drapeau : drapeau cliquable pour planter ; choix libre de la case lors de la pose.

## 6. Technique

- [ ] Un dossier de worktree d'agent (`.claude/worktrees/agent-aeed165b8e24b86b3`) n'a pas pu être supprimé (« Permission denied », processus encore actif). Il est ignoré par git : le supprimer à la main une fois le serveur Vite (port 5231) arrêté.
- [ ] Tests d'intégration : ajouter une partie complète IA contre IA par mode dans `tests/integration`.
- [ ] Préparer la suite du plan de production (Steam) : packaging, sauvegarde, options.
