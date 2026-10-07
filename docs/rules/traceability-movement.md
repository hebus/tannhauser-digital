# Traçabilité : déplacement et portes

| ID | Règle | Source | Implémentation | Test (`movement.spec.ts`) |
|---|---|---|---|---|
| RULE-MOVE-001 | 1 PM par case + surcoût `movementCostModifier` de la case d'arrivée | §68.2, §68.4 | `movement/graph.ts` (`entryCost`, `checkStep`) | coût normal, surcoût +1/+2, chemin le moins cher |
| RULE-MOVE-002 | Case impraticable (`passable=false`) | §68.5 | `checkStep` (IMPASSABLE) | case impraticable |
| RULE-MOVE-003 | Arête à sens unique utilisable de `from` vers `to` seulement | §76.8 | `checkStep`, `neighborCandidates` | sens unique ; refus ONE_WAY |
| RULE-MOVE-004 | PM insuffisants (« Impossible : N PM requis… ») | §68.2 | `movement/validate-path.ts`, `movement/reachable.ts` | PM insuffisants |
| RULE-MOVE-005 | Chemin connexe uniquement | §68.5 | `checkStep` (NOT_ADJACENT) | chemin non connexe |
| RULE-MOVE-006 | Ennemi bloque ; allié traversable, jamais case d'arrivée (OQ-MOVE-004) | §68.3 | `checkStep`, `validatePath`, `reachableNodes` | ennemi/allié, ennemi hors de combat |
| RULE-MOVE-007 | Portail relie deux nœuds distants ; coûte exactement 1 PM, dans les deux sens (OQ-MOVE-005, résolue) | §76.7 | `neighborCandidates`, `checkStep` (PORTAL) | portail ; « traverse un portail pour exactement 1 PM » |
| RULE-MOVE-008 | Passage en force : duel de Physique, reporté ; point d'extension seulement (OQ-MOVE-006) | §69 | `movement/force-passage.ts` | à écrire avec le duel |
| RULE-MOVE-009 | `MOVE_CHARACTER` : joueur actif, propriétaire, vivant, activation (OQ-MOVE-003), déduit les PM, émet CHARACTER_MOVED | §68 | `movement/handlers.ts` | describe `MOVE_CHARACTER` |
| RULE-MOVE-010 | Déterminisme et immutabilité de l'état | §0.1 | `reachable.ts` (tri par coût puis id) | déterministe / immutabilité |
| RULE-MOVE-011 | Mouvement permis après et avant l'unique action ; `movementLeft` conservé (OQ-COMBAT-007) | §66 | `movement/handlers.ts` (aucun contrôle sur `actionUsed`) | « mouvement possible après une action, avant une action, et entre deux » |
| RULE-MOVE-012 | Arrêt sur la première case vue par un adversaire en Overwatch ; activation suspendue (`turn.reaction`) ; déplacement tenté depuis une case déjà vue : réaction avant exécution | décision PO | `movement/handlers.ts`, `overwatch/trigger.ts` | `overwatch.spec.ts`, tests d'intégration |
| RULE-DOOR-001 | Ouvrir une porte depuis une case adjacente, 0 PM (OQ-DOOR-001, résolue) | §76.5 | `handlers.ts` (`OPEN_DOOR`) | OPEN_DOOR |
| RULE-DOOR-002 | Fermer une porte ouverte depuis une case adjacente : 0 PM, même à 0 PM restant | §76.6 | `handlers.ts` (`CLOSE_DOOR`, `CLOSE_DOOR_COST = 0`) | CLOSE_DOOR, « une porte ne coûte rien » |
| RULE-DOOR-003 | Porte fermée bloque le déplacement ; ouverte laisse passer | §76.5 | `checkStep` (DOOR_CLOSED) | porte fermée/ouverte |
| RULE-DOOR-004 | Événements DOOR_OPENED / DOOR_CLOSED | §83 | `events/events.ts`, `handlers.ts` | OPEN_DOOR / CLOSE_DOOR |
