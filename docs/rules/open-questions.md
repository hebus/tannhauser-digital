# Questions ouvertes

Format : Rule / Source / Interpretation / Reason / Impact / Test required.

## OQ-LOS-001 — Propagation de la ligne de vue (RÉSOLUE)

- **Rule:** RULE-LOS-001 (ligne de vue par couleurs)
- **Résolution (product owner) :** il faut toujours une couleur commune sur tout le chemin. B est visible depuis A s'il existe une couleur présente sur tous les nœuds d'un chemin A→B. Réciprocité garantie.
- **Test:** `board.spec.ts` (couleur unique sur le chemin, réciprocité exhaustive).

## OQ-LOS-002 — Fumée sur la case cible

- **Rule:** RULE-LOS-002 (la fumée coupe la ligne de vue)
- **Interpretation (actuelle):** un nœud sous fumée n'est pas visible et bloque la propagation.
- **Impact:** viser un personnage dans la fumée est impossible. À confirmer.
- **Test required:** `board.spec.ts` (fumée).

## OQ-LOS-003 — Équipement anti-fumée

- **Rule:** RULE-LOS-003
- **Interpretation (actuelle):** l'équipement porté fait ignorer la fumée pour le calcul de vue de son porteur (`ignoresSmoke`).
- **Impact:** asymétrie possible (A voit B, B ne voit pas A). À confirmer.

## OQ-NODE-001 — Catalogue des bonus/malus de case

- **Rule:** RULE-NODE-001
- **Interpretation (actuelle):** schéma générique `NodeModifier` (dés supplémentaires, modificateur de résultat) ; catalogue exact inconnu.
- **Test required:** à ajouter avec le pipeline de combat.

## OQ-COMBAT-001 — Corps à corps : adjacence et portes

- **Rule:** RULE-COMBAT-005 (§70.1 : attaque au corps à corps derrière une porte « là où l'adjacence le permet »)
- **Source:** §70.1, §72.1
- **Interpretation:** une arme `CAC` exige que les deux nœuds soient reliés par une arête (sens et porte ignorés) ; la LdM n'est pas requise. Les armes non-CAC exigent la LdM.
- **Reason:** « adjacency rules » non définies (arêtes à sens unique, portes renforcées, portails secrets ?).
- **Impact:** peut autoriser/interdire des attaques à travers portes fermées ou renforcées.
- **Test required:** `attack.spec.ts` (corps à corps à travers porte fermée) ; à affiner.

## OQ-COMBAT-002 — Défense (Duel) lors d'une attaque

- **Rule:** RULE-DUEL-001 / RULE-COMBAT-006
- **Source:** §71.4, §72.2
- **Interpretation:** §72 ne décrit aucun jet de défense : l'attaque est un Test simple, touchée si au moins 1 succès. `resolveDuel`/`rollDuel` existent mais ne sont pas branchés sur `ATTACK` ; `CombatLog.defense` vaut `null`.
- **Reason:** on ignore quand un Duel s'ouvre (défenseur, réserve, caractéristique opposée).
- **Impact:** aucune réduction des succès côté cible.
- **Test required:** à ajouter quand la règle de défense est précisée.

## OQ-COMBAT-003 — Nombre de blessures par attaque réussie

- **Rule:** RULE-COMBAT-007
- **Source:** §72.4 (« can cause wounds », « removes one health level »)
- **Interpretation:** 1 blessure par attaque réussie, indépendamment du nombre de succès (`WOUNDS_PER_HIT`).
- **Reason:** la spécification ne dit pas si les succès excédentaires ajoutent des blessures.
- **Impact:** létalité du jeu.
- **Test required:** `attack.spec.ts` (jet maximum = 1 blessure).

## OQ-COMBAT-004 — Composition de la réserve de dés d'attaque

- **Rule:** RULE-COMBAT-003
- **Source:** §72.2 (« weapon + current Combat + modifiers »)
- **Interpretation:** réserve = dés de l'arme + dés supplémentaires (arme, modificateurs `OCCUPANT`/`ATTACKER` de la case de l'attaquant) ; le Combat courant ne fixe que la difficulté (10 − Combat). Les modificateurs `DEFENDER` de la case de la cible ne sont pas appliqués. Les armes `MENTAL` utilisent aussi Combat. L'échec automatique l'emporte sur les succès automatiques.
- **Reason:** formulation ambiguë (le Combat ajoute-t-il des dés ? l'arme Mental teste-t-elle Mental ? précédence échec/succès automatiques ?).
- **Impact:** équilibrage de toutes les attaques.
- **Test required:** `attack.spec.ts` (dés d'arme, case, difficulté).

## OQ-COMBAT-005 — Portée et zone de fumée

- **Rule:** RULE-COMBAT-004 / RULE-LOS-002
- **Source:** §70.2, §72.1, §73.2
- **Interpretation:** la portée est un champ optionnel `maxRange` de l'arme, en pas sur arêtes non bloquées ; absente, seule la LdM limite. La fumée n'occupe que le nœud `origin` de l'effet (la « zone affectée » n'est pas définie dans l'état).
- **Reason:** unité de portée (« cases ») et rayon de fumée non spécifiés ; cas hors zone/sniper non modélisés.
- **Impact:** attaques longue portée, interactions fumée.
- **Test required:** `attack.spec.ts` (portée, fumée) ; à compléter avec §73.

## OQ-COMBAT-006 — Santé à 0 et ligne de stats d'un mort

- **Rule:** RULE-COMBAT-008
- **Interpretation:** un personnage mort a `health = 0` et `alive = false` ; `currentStats` renvoie alors la dernière ligne (clampée) au lieu de lever une erreur.
- **Reason:** la ligne active d'un mort n'est pas définie ; ajustement minimal de `state/types.ts`.
- **Impact:** lecture sûre des stats d'un cadavre (UI, journaux).
- **Test required:** `attack.spec.ts` (mort, `currentStats` sans erreur).

## OQ-COMBAT-007 — Garde-fous d'activation

- **Rule:** RULE-COMBAT-001
- **Interpretation:** `ATTACK` exige `phase = ACTIVATION` et `activePlayerId = playerId` ; elle ne consomme ni PC ni état d'activation (non spécifié ici, dépend du module `turn/`).
- **Impact:** à raccorder avec le coût/limite d'actions par activation.
- **Test required:** `attack.spec.ts` (validation).
