# Bible des règles

Spécification technique des règles du jeu, reformulée pour l'implémentation. Ce n'est **pas** une copie des règles officielles : elle décrit le comportement attendu du moteur en termes testables. En cas de divergence avec le livret officiel, ce dernier fait foi ; toute ambiguïté est consignée dans `open-questions.md` (ne jamais inventer une règle en silence).

## Conventions

- Chaque règle porte un identifiant stable `RULE-<DOMAINE>-NNN`. Un identifiant n'est jamais réutilisé ; une règle abandonnée est marquée `OBSOLÈTE`.
- Chaque règle est formulée comme une assertion vérifiable (entrée, état, résultat attendu).
- Les valeurs numériques (dés, portées, coûts) sont des **données** de contenu, validées par ArkType, jamais des constantes dans le code des systèmes.
- Le moteur émet des événements explicites pour toute résolution (voir `turn-structure.md` et les fichiers de domaine).
- Aléatoire : toujours via une source injectable et reproductible.

## Domaines et fichiers

| Domaine | Préfixe | Fichier |
|---|---|---|
| Tour, initiative, activation, PC, overwatch | `RULE-TURN`, `RULE-PC`, `RULE-OW` (historique) | `turn-structure.md` ; Overwatch actuel : `RULE-OVERWATCH` (`special-rules.md`, `traceability-overwatch.md`) |
| Déplacement, plateau, nœuds | `RULE-MOVE`, `RULE-NODE` | `movement.md` |
| Tests, duels, combat, dégâts | `RULE-TEST`, `RULE-COMBAT` | `combat.md` |
| Ligne de vue | `RULE-LOS` | `line-of-sight.md` |
| Équipement, grenades | `RULE-EQUIP` | `equipment.md` |
| Compétences, capacités, unités spéciales | `RULE-ABIL` | `abilities.md` |
| Objectifs, drapeaux | `RULE-OBJ` | `objectives.md` |
| Modes de jeu, victoire | `RULE-VICT`, `RULE-SETUP` | `victory.md` |
| Cases/éléments spéciaux, effets de plateau | `RULE-DOOR`, `RULE-BOARD`, `RULE-FX` | `special-rules.md` |

Vocabulaire : `glossary.md`. Traçabilité : `traceability.md` et `traceability-<domaine>.md`.

## Principes d'adaptation numérique

- **RULE-SETUP-ADAPT-001** — Le moteur automatise : déplacements légaux, lignes de vue, dés, modificateurs, santé, état d'équipement, PC, progression d'objectifs, durées d'effets, drapeaux, initiative, suivi d'activation, conditions de victoire.
- **RULE-SETUP-ADAPT-002** — Le joueur reste responsable des choix : actions, positionnement, cibles, équipement, priorités d'objectifs.
- **RULE-SETUP-ADAPT-003** — Toute résolution produit un journal détaillé : dés de base, bonus, malus, jet final, succès, défense, blessures.
- **RULE-SETUP-ADAPT-004** — L'UI n'évalue jamais la légalité : elle interroge le moteur (`getLegalActions`) et affiche la raison d'un refus.

## Critères d'exhaustivité (porte de sortie du moteur)

- Chaque règle a un système associé et des tests.
- Toute règle non résolue figure dans `open-questions.md`.
- Aucun comportement de jeu n'existe uniquement côté rendu.
- Les opérations aléatoires sont déterministes sous graine ; les replays reproduisent les résultats.
- Sauvegarde/chargement conserve tout l'état pertinent ; l'état de campagne est séparé de l'état de partie.
- Les cases spéciales sont représentées dans le modèle de données du plateau.
- Les conditions de victoire de chaque mode sont testées.
