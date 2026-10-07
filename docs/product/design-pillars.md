# Piliers de conception

1. **Règles fidèles, moteur ennuyeux et fiable.** Chaque règle a un identifiant `RULE-<DOMAINE>-NNN`, un test automatisé et une trace jusqu'à l'UI (voir `docs/rules/traceability.md`).
2. **Lisibilité tactique.** L'état du plateau se lit d'un coup d'œil : lignes de vue, portée de déplacement, effets (fumée, feu, portes), actions légales mises en évidence.
3. **Transparence.** Aucune résolution importante n'est cachée : le journal décompose dés de base, bonus, malus, succès, défense et blessures.
4. **Responsabilité du joueur.** L'ordinateur gère la comptabilité (PC, initiative, durées, santé) ; le joueur choisit actions, positions, cibles, équipement, priorités.
5. **Reproductibilité.** Même graine + mêmes commandes = même partie. Sauvegardes et replays sont fiables.
6. **Contenu en données.** Cartes, personnages, équipements, scénarios sont des données validées par ArkType, jamais de la logique de rendu.
7. **Finition « premium ».** Réactivité, animations pilotées par événements, audio, manette, accessibilité.
