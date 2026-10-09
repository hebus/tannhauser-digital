# Équipement

L'équipement est un **contenu** (définitions de données validées par ArkType), jamais de la logique spéciale dans le moteur.

| ID | Règle testable | Événements |
|---|---|---|
| RULE-EQUIP-001 | Chaque personnage a un nombre limité d'emplacements ; l'équipement appartient à l'inventaire. Équiper au-delà des emplacements est refusé. | |
| RULE-EQUIP-002 | Actions d'équipement : attaquer, lancer une grenade, ramasser, déposer, donner, utiliser, ouvrir une caisse le cas échéant. Chacune est une commande avec validation. | `EQUIPMENT_USED` |
| RULE-EQUIP-003 | Ramasser/déposer exige un personnage vivant et adjacent au nœud portant l'équipement. | `EQUIPMENT_PICKED_UP` |
| RULE-EQUIP-004 | Donner : un personnage peut transférer un ou plusieurs équipements à un personnage adjacent ; si le receveur n'a pas l'emplacement adapté, la restriction de la règle s'applique. | `EQUIPMENT_GIVEN` |
| RULE-EQUIP-005 | L'équipement déposé reste dans l'état de jeu sur son nœud et peut être récupéré. | `EQUIPMENT_DROPPED` |
| RULE-EQUIP-006 | Les drapeaux n'occupent pas l'inventaire. | |
| RULE-EQUIP-007 | Un équipement peut déclarer des propriétés de règle (`ignoresSmoke`, restrictions de compétence, portée) lues par les systèmes concernés. | |

## Traits

Tout équipement porte un ou plusieurs **traits** (ensemble ouvert, défini dans le contenu : `packages/content/src/data/equipment.json`). Liste actuelle : `weapon`, `pistol`, `medal`, `ability`, `hardware`, `automatic`, `grenade`, `hand-to-hand`, `rank`, `occult`, `mental`. Un trait peut avoir un effet de règle.

| ID | Règle testable | Événements |
|---|---|---|
| RULE-EQUIP-020 | Une arme porte le trait `weapon` et exactement un autre trait de type : `pistol`, `mental`, `automatic` ou `hand-to-hand`. Le chargement du contenu refuse toute autre combinaison. | |
| RULE-EQUIP-021 | Une arme déclare sa réserve de dés (`dice`) ; le type d'attaque du combat découle de son trait de type. | |
| RULE-EQUIP-022 | Un personnage sans équipement `weapon` est considéré sans arme (attaque à mains nues, `weapon.unarmed`, ajoutée à tout personnage à la création). | |
| RULE-EQUIP-023 | Les médailles (`medal`) et les rangs (`rank`) occupent des emplacements d'inventaire ; les capacités (`ability`) n'en occupent pas. | |

Les personnages référencent leurs équipements par `equipmentIds`. Seules les armes sont aujourd'hui transmises au moteur (`CharacterState.weapons`) ; l'inventaire et ses emplacements restent à implémenter.

## Équipement de base des héros

Données dans `packages/content/src/data/equipment.json` et `characters.json`. Chaque équipement déclare des `effects` typés (validés au chargement) que le moteur applique (`packages/core/src/equipment/`), plus un `descriptionKey` descriptif. Les grenades ne sont pas encore gérées. Les dés des armes (Mauser 4, Flash-Gun 5, Couteau 4) reprennent les valeurs par type et sont provisoires.

| Joueur / héros | Équipement | Traits | Effet (moteur) |
|---|---|---|---|
| 1 / `char.alpha.hero` | Mauser C96 | `weapon`, `pistol` | aucun |
| | Iron Cross 1st Class | `medal` | `GAIN_COMMAND_POINTS` : défausser le token (commande `USE_EQUIPMENT`, sans action) : +2 CP au pool de CP |
| | Critical Hit | `ability` | `CRITICAL_HIT` : chaque 10 naturel en combat (attaque ou défense) compte 2 succès |
| 1 / `char.alpha.hero2` | Stielhandgrenate | `grenade` | grenades pas encore gérées |
| | Supernatural Strength | `ability` | `BEST_CHARACTERISTIC` (combat) : toujours la valeur de combat la plus haute, même blessé |
| | Immunity to Pain | `ability` | `BEST_CHARACTERISTIC` (physique) : toujours la valeur de stamina/physique la plus haute, même blessé |
| 2 / `char.beta.hero` | Flash-Gun Mk1 | `weapon`, `automatic` | `EXTRA_DICE_ON_NATURAL_10` : au moins un 10 naturel à l'attaque : 2 dés supplémentaires ajoutés au jet |
| | Combat Infantry Badge | `medal` | `REROLL_LOWEST` : à l'attaque, relance des 2 dés les plus bas (1 naturels compris) |
| | Medal of Honor | `medal` | `FREE_OVERWATCH` : une fois par partie, ACTION (`USE_EQUIPMENT`) : défausser le pion pour passer en overwatch sans CP |
| 2 / `char.beta.hero2` | Couteau | `weapon`, `hand-to-hand` | aucun |
| | BA-27 | `hardware` | `EXTRA_DICE_WITH_WEAPON` : attaque avec le « flash machine gun a6a » : +1 dé (arme distincte, **pas encore définie** : l'effet vise `weapon.flash-machine-gun-a6a`) |
| | MkII A1 | `grenade` | grenades pas encore gérées |

### Décisions d'implémentation des effets

- Ordre d'un jet d'attaque : lancer de la réserve, puis relances (Combat Infantry Badge), puis dés supplémentaires sur 10 naturel (Flash-Gun, sans enchaînement). Un 10 obtenu par relance déclenche donc le Flash-Gun.
- La relance du Combat Infantry Badge est automatique : elle ne porte que sur les dés **ratés** de plus basse valeur (relancer un dé réussi serait toujours perdant). « Peut relancer » n'ouvre donc aucun choix au joueur.
- Critical Hit s'applique à l'attaque et à la défense ; relances et dés bonus sont propres à l'attaque. Le passage en force n'est pas un combat.
- Les valeurs « les plus hautes » (Supernatural Strength, Immunity to Pain) passent par `currentStats` : elles valent aussi pour le passage en force et l'Overwatch.
- Iron Cross : utilisable à tout moment de son tour (décision d'Overwatch ou activation), hors action, par n'importe quel personnage vivant qui le porte. **Règle supposée, à confirmer.**
- Medal of Honor : le personnage actif n'ayant pas encore agi consomme son action et se place en Overwatch, sans PC. Le pion est défaussé : une seule fois par partie.
- Journal de combat : les effets qui ont **réellement joué** (`CombatLog.effects`) s'affichent en pastilles à pictogramme (✸ Coup critique, ▲ valeur la plus haute, ✚ dés sur 10 naturel, ↻ relance, ⚙ matériel, ✪ PC gagnés, ◎ Overwatch gratuit).

## Grenades et fumée

| ID | Règle testable | Événements |
|---|---|---|
| RULE-EQUIP-010 | Lancer une grenade est une action d'équipement : cible = nœud dans la portée de l'équipement ; elle peut traverser des nœuds occupés. | |
| RULE-EQUIP-011 | La grenade affecte les personnages de la zone touchée ; la résolution diffère de l'attaque normale. Les valeurs (dégâts, succès automatiques pour les adjacents) sont des données. | |
| RULE-EQUIP-012 | Une grenade fumigène crée un effet `SMOKE` sur le nœud cible et sa zone d'effet, portée de 8 (donnée). | `SMOKE_STARTED` |
| RULE-EQUIP-013 | La fumée persiste le tour courant et les suivants selon `remainingTurns` ; le refresh la retire (RULE-TURN-003, OQ-TURN-002). | `SMOKE_EXPIRED` |

Exemples de contenu à définir : trousse de soins, munitions supplémentaires, grenades, fumigènes, armes, équipements spéciaux et propres à un personnage.
