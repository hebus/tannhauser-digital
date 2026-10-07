# Capacités, compétences et unités spéciales

## Modèle de personnage

| ID | Règle testable |
|---|---|
| RULE-ABIL-001 | Un personnage a quatre caractéristiques primaires : Combat, Physique, Mental, Mouvement, plus santé, compétences, faction/affiliation, emplacements d'équipement. |
| RULE-ABIL-002 | La caractéristique courante dépend du niveau de santé courant (ligne active). Valeur **courante**, **maximale** et **la plus haute de la colonne** sont trois accesseurs distincts. |
| RULE-ABIL-003 | Catégories de personnages : héros (plusieurs niveaux de santé), troupes, mercenaires (restrictions d'affiliation propres). |
| RULE-ABIL-004 | Les relations de faction (allié/ennemi/neutre) sont des données (`FactionRelation`), jamais des conditions codées en dur. |

## Compétences

| ID | Règle testable |
|---|---|
| RULE-ABIL-005 | Les compétences (athlétisme, mécanique, médecine, mental, spéciale) sont des données ; le catalogue exact reste à valider. Elles conditionnent objectifs, portes, interactions et équipements. |

## Renforts et unités spéciales

| ID | Règle testable | Événements |
|---|---|---|
| RULE-ABIL-006 | Un renfort entre en jeu pour 3 PC avant une activation ; il rejoint le bas de la pile de sa faction. | `REINFORCEMENT_DEPLOYED` |
| RULE-ABIL-010 | Les unités spéciales (type voïvode) se choisissent par paires avec une position de déploiement dédiée ; la capacité `SpecialUnitRules` porte `canSpendCommandPoints`, `reinforcementPolicy`, `pairId`. | |
| RULE-ABIL-011 | Si un membre de la paire est détruit, l'autre peut continuer ; un marqueur de remplacement représente le détruit. | |
| RULE-ABIL-012 | Aucun PC ne peut être dépensé pour ces unités ; la fumée et certains effets de plateau ne les affectent pas de la même façon (données). | |
| RULE-ABIL-013 | Elles peuvent revenir en renfort sous les conditions de leur politique. | |

## Principes

- Ajouter une capacité = ajouter une donnée ; le moteur lit des propriétés génériques.
- Les modificateurs de capacités passent par le même pipeline que les modificateurs de nœud (RULE-NODE-001).
