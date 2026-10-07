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
| RULE-COMBAT-003 | Jet d'attaque : réserve = dés d'arme + bonus (y compris ceux des nœuds, RULE-NODE-001) ; difficulté = `10 - Combat courant` ; un dé ≥ difficulté est un succès (10 naturel = succès, 1 naturel = échec). Voir OQ-COMBAT-009. |
| RULE-COMBAT-004 | Sans aucun succès, l'attaque échoue (`ATTACK_MISSED`). |
| RULE-COMBAT-005 | Les réussites automatiques s'ajoutent aux succès obtenus aux dés. |
| RULE-COMBAT-006 | Chaque succès du jet d'attaque est une blessure. Le défenseur lance un jet de défense (RULE-COMBAT-012) ; chaque succès annule une blessure ; chaque blessure non parée est un dégât (un niveau de santé perdu, ligne de caractéristiques active mise à jour). |
| RULE-COMBAT-007 | Perdre le dernier niveau de santé élimine le personnage (`CHARACTER_DEFEATED`). |
| RULE-COMBAT-008 | La contre-attaque (PC) et l'attaque d'opportunité d'Overwatch (optionnelle, RULE-OVERWATCH-005) sont des attaques normales soumises aux mêmes vérifications et au même échange attaque/défense. |
| RULE-COMBAT-009 | Le journal de combat présente : dés de base, bonus, malus, jet final, succès, défense, blessures. |
| RULE-COMBAT-010 | Les cibles sur un nœud sous fumée ne sont pas visibles (RULE-LOS-002) ; viser sans ligne de vue est refusé sauf règle explicite. |
| RULE-COMBAT-011 | Corps à corps : la seule exigence est une arête entre les deux nœuds (sens et porte ignorés, ligne de vue non requise). |
| RULE-COMBAT-012 | Jet de défense : réserve `config.defensePoolSize` (défaut 4), difficulté = `10 - Physique` du défenseur ; événement `DEFENSE_ROLLED`. Taille : OQ-COMBAT-008. |
| RULE-COMBAT-013 | Une attaque ne coûte ni PC ni PM. C'est l'unique action de l'activation du personnage actif (RULE-TURN-008). Si l'attaquant est dans la ligne de vue d'un Overwatch adverse, une attaque d'opportunité peut s'intercaler AVANT elle (RULE-OVERWATCH-010) ; l'attaque annoncée est exécutée ensuite si l'attaquant survit. |

Événements : `ATTACK_DECLARED`, `COMBAT_ROLLED`, `DEFENSE_ROLLED`, `ATTACK_HIT`, `ATTACK_MISSED`, `DAMAGE_APPLIED`, `WOUND_CANCELLED`, `CHARACTER_DEFEATED`.

## Santé

Le suivi de santé est explicite : niveau courant, ligne de caractéristiques active, valeurs courante/maximale/la plus haute de colonne (voir `abilities.md`).

## Tests attendus

Réserves par type d'arme, 10/1 naturels, succès automatiques, parade par jet de défense, blessure puis changement de ligne, mort, refus hors portée/sans ligne de vue.
