# Tests, duels et combat

## Tests et duels

| ID | Règle testable |
|---|---|
| RULE-TEST-001 | Un test sans opposition lance une réserve de dés (4 par défaut, donnée) avec une difficulté de `10 - caractéristique courante`. Un dé égal ou supérieur à la difficulté est un succès. |
| RULE-TEST-002 | Au moins un succès est requis, sauf règle contraire. |
| RULE-TEST-003 | Un 10 naturel (avant modificateurs) est toujours un succès ; un 1 naturel (avant modificateurs) n'est jamais un succès. Ces règles s'appliquent avant bonus et malus. |
| RULE-TEST-004 | Le moteur distingue : dés supplémentaires, modificateur de résultat, réussite automatique, échec automatique. |
| RULE-TEST-005 | Une caractéristique à zéro interdit les tests et duels basés sur elle, et les effets qui en dépendent. |
| RULE-TEST-006 | Duel : attaquant et défenseur lancent chacun leur réserve ; chaque succès du défenseur annule un succès de l'attaquant ; l'attaquant doit conserver au moins un succès pour l'emporter, sinon le défenseur gagne. |

Événements : `TEST_STARTED`, `TEST_RESOLVED`, `DUEL_STARTED`, `DUEL_RESOLVED`.

## Attaque

| ID | Règle testable |
|---|---|
| RULE-COMBAT-001 | Déclarer une attaque : cible, arme, vérification de portée et de ciblage (ligne de vue ou règle de ciblage explicite), puis jet de combat. Une cible invalide est refusée avant tout jet. |
| RULE-COMBAT-002 | Types d'arme de base : mêlée, pistolet, mental, automatique. Leurs réserves de dés par défaut sont des données de contenu. |
| RULE-COMBAT-003 | Le nombre de dés du jet de combat dépend de l'arme, de la caractéristique de Combat courante et des modificateurs (y compris ceux des nœuds, RULE-NODE-001). La difficulté est `10 - Combat courant`. |
| RULE-COMBAT-004 | Sans aucun succès, l'attaque échoue (`ATTACK_MISSED`). |
| RULE-COMBAT-005 | Les réussites automatiques s'ajoutent aux succès obtenus aux dés. |
| RULE-COMBAT-006 | Une attaque réussie inflige des blessures ; chaque blessure retire un niveau de santé et met à jour la ligne de caractéristiques active. |
| RULE-COMBAT-007 | Perdre le dernier niveau de santé élimine le personnage (`CHARACTER_DEFEATED`). |
| RULE-COMBAT-008 | La contre-attaque (PC) et l'attaque d'overwatch sont des attaques normales soumises aux mêmes vérifications. |
| RULE-COMBAT-009 | Le journal de combat présente : dés de base, bonus, malus, jet final, succès, défense, blessures. |
| RULE-COMBAT-010 | Les cibles sur un nœud sous fumée ne sont pas visibles (RULE-LOS-002) ; viser sans ligne de vue est refusé sauf règle explicite. |

Événements : `ATTACK_DECLARED`, `COMBAT_ROLLED`, `ATTACK_HIT`, `ATTACK_MISSED`, `DAMAGE_APPLIED`, `WOUND_CANCELLED`, `CHARACTER_DEFEATED`.

## Santé

Le suivi de santé est explicite : niveau courant, ligne de caractéristiques active, valeurs courante/maximale/la plus haute de colonne (voir `abilities.md`).

## Tests attendus

Réserves par type d'arme, 10/1 naturels, succès automatiques, annulation par duel, blessure puis changement de ligne, mort, refus hors portée/sans ligne de vue.
