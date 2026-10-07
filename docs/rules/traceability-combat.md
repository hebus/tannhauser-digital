# Traçabilité — Tests, Duels, Combat, LdM, Victoire

Tests dans `packages/core/src/combat/` : `test.spec.ts` (T), `attack.spec.ts` (A).

| ID | Règle | Implémentation | Test |
|---|---|---|---|
| RULE-TEST-001 | Réserve 4 dés par défaut, difficulté 10 − caractéristique (§71.1) | `combat/test.ts` : `DEFAULT_TEST_POOL`, `difficultyFor`, `resolveTest` | T « réserve par défaut » |
| RULE-TEST-002 | Succès si dé ≥ difficulté, ≥ 1 succès requis | `resolveTest` (`success`) | T « succès si dé ≥ difficulté », jets min/max |
| RULE-TEST-003 | 10 naturel = succès, 1 naturel = jamais, avant modificateurs (§71.2) | `resolveTest` | T « 10 naturel », « 1 naturel », A « 10 naturel touche » |
| RULE-TEST-004 | Dés supplémentaires / modificateur de résultat / succès auto / échec auto distincts (§71.3) | `TestModifiers`, `combineModifiers` | T dés supplémentaires, modificateur, auto, `combineModifiers` |
| RULE-TEST-005 | Caractéristique 0 = Test impossible (§65.2) | `resolveCharacteristicTest`, rejet `CHARACTERISTIC_ZERO` | T « caractéristique à 0 », A « Combat à 0 » |
| RULE-DUEL-001 | Chaque succès du défenseur annule un succès de l'attaquant (§71.4) | `combat/duel.ts` : `resolveDuel`, `rollDuel` | T « Duel » (OQ-COMBAT-002 : non branché sur ATTACK) |
| RULE-DUEL-002 | L'attaquant doit garder ≥ 1 succès | `resolveDuel.attackerWins` | T égalité / défenseur supérieur |
| RULE-COMBAT-001 | Joueur actif, personnage vivant et possédé, cible ennemie vivante | `combat/attack.ts` : handler `ATTACK` | A « validation », « mort » |
| RULE-COMBAT-002 | Arme possédée, dés d'arme issus des données (§72.1) | `combat/weapons.ts`, `CharacterState.weapons` | A « dés viennent des données » |
| RULE-COMBAT-003 | Difficulté 10 − Combat courant, modificateurs (§72.2) | handler `ATTACK`, `currentStats` | A « difficulté », « modificateurs de la case » (OQ-COMBAT-004) |
| RULE-COMBAT-004 | Portée / ciblage (§72.1) | `stepDistance`, `maxRange` | A « portée maximale » (OQ-COMBAT-005) |
| RULE-COMBAT-005 | Corps à corps : adjacence hors LdM (§70.1) | `areAdjacent` | A « corps à corps » (OQ-COMBAT-001) |
| RULE-COMBAT-006 | Succès automatiques (§72.3) | `WeaponDefinition.autoSuccesses` | A « succès automatiques de l'arme » |
| RULE-COMBAT-007 | Blessure : −1 santé par attaque réussie (§72.4) | `WOUNDS_PER_HIT`, handler | A « attaque réussie », « jet maximum » (OQ-COMBAT-003) |
| RULE-COMBAT-008 | Ligne de stats active mise à jour, mort à la dernière santé (§65.1, §72.4) | handler, `currentStats` | A « attaque réussie », « dernière santé », propriété santé |
| RULE-COMBAT-009 | Événements ATTACK_DECLARED / COMBAT_ROLLED / ATTACK_HIT\|MISSED / DAMAGE_APPLIED / CHARACTER_DEFEATED | `events/events.ts`, handler | A événements ordonnés |
| RULE-COMBAT-010 | Journal de combat structuré (§85) | `combat/log.ts` : `CombatLog`, `explainCombat` | A « journal structuré », T `explainCombat` |
| RULE-COMBAT-011 | Pureté : état immuable, RNG injecté, déterminisme, sérialisable | `applyCommand` + handler | A « invariants » |
| RULE-LOS-001 | LdM par couleur commune, portes fermées (§70) | `board/line-of-sight.ts` (existant) via handler | A « sans couleur commune », « porte fermée » |
| RULE-LOS-002 | La fumée coupe la LdM (§73.2) | handler (`state.effects` SMOKE vers `smokeNodes`) | A « la fumée coupe » (OQ-COMBAT-005) |
| RULE-VICTORY-001 | Deathmatch : plus aucun personnage vivant d'un camp = VICTORY, `victory`, `phase = FINISHED` | `victory/deathmatch.ts`, handler | A « élimination du dernier personnage » |
