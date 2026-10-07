# Traçabilité : déplacement et portes

| ID | Règle | Source | Implémentation | Test (`movement.spec.ts`) |
|---|---|---|---|---|
| RULE-MOVE-001 | 1 PM par case + surcoût `movementCostModifier` de la case d'arrivée | §68.2, §68.4 | `movement/graph.ts` (`entryCost`, `checkStep`) | coût normal, surcoût +1/+2, chemin le moins cher |
| RULE-MOVE-002 | Case impraticable (`passable=false`) | §68.5 | `checkStep` (IMPASSABLE) | case impraticable |
| RULE-MOVE-003 | Arête à sens unique utilisable de `from` vers `to` seulement | §76.8 | `checkStep`, `neighborCandidates` | sens unique ; refus ONE_WAY |
| RULE-MOVE-004 | PM insuffisants (« Impossible : N PM requis… ») | §68.2 | `movement/validate-path.ts`, `movement/reachable.ts` | PM insuffisants |
| RULE-MOVE-005 | Chemin connexe uniquement | §68.5 | `checkStep` (NOT_ADJACENT) | chemin non connexe |
| RULE-MOVE-006 | Ennemi bloque ; allié traversable, jamais case d'arrivée (OQ-MOVE-002) | §68.3 | `checkStep`, `validatePath`, `reachableNodes` | ennemi/allié, ennemi hors de combat |
| RULE-MOVE-007 | Portail relie deux nœuds distants (OQ-MOVE-003) | §76.7 | `neighborCandidates`, `checkStep` (PORTAL) | portail |
| RULE-MOVE-008 | Passage en force : point d'extension seulement (OQ-MOVE-004) | §69 | `movement/force-passage.ts` | à écrire avec le duel |
| RULE-MOVE-009 | `MOVE_CHARACTER` : joueur actif, propriétaire, vivant, activation (OQ-MOVE-001), déduit les PM, émet CHARACTER_MOVED | §68 | `movement/handlers.ts` | describe `MOVE_CHARACTER` |
| RULE-MOVE-010 | Déterminisme et immutabilité de l'état | §0.1 | `reachable.ts` (tri par coût puis id) | déterministe / immutabilité |
| RULE-DOOR-001 | Ouvrir une porte depuis une case adjacente (OQ-DOOR-001) | §76.5 | `handlers.ts` (`OPEN_DOOR`) | OPEN_DOOR |
| RULE-DOOR-002 | Fermer une porte ouverte depuis une case adjacente : 1 PM | §76.6 | `handlers.ts` (`CLOSE_DOOR`, `CLOSE_DOOR_COST`) | CLOSE_DOOR, PM insuffisants |
| RULE-DOOR-003 | Porte fermée bloque le déplacement ; ouverte laisse passer | §76.5 | `checkStep` (DOOR_CLOSED) | porte fermée/ouverte |
| RULE-DOOR-004 | Événements DOOR_OPENED / DOOR_CLOSED | §83 | `events/events.ts`, `handlers.ts` | OPEN_DOOR / CLOSE_DOOR |
