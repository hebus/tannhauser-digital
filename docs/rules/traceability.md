# Traçabilité règles vers moteur

Index de la traçabilité. Chaque règle `RULE-<DOMAINE>-NNN` est reliée de bout en bout :

```text
Règle source -> système du moteur -> implémentation -> test automatisé -> comportement UI
```

## Format d'une ligne

| Colonne | Contenu |
|---|---|
| Règle | Identifiant stable (ex. `RULE-LOS-001`) |
| Règle source | Référence du fichier de règles (`docs/rules/<fichier>.md`) |
| Système | Système du moteur (ex. `LineOfSightSystem`) |
| Implémentation | Fonction/fichier (ex. `packages/core/src/board.ts#canSee`) |
| Test | Fichier de test (ex. `board.spec.ts`) |
| UI | Composant/animation (ex. `CombatLogPanel`) ou `n/a` |
| Statut | `todo`, `en cours`, `fait` |

## Fichiers par domaine

Chaque domaine possède son propre fichier de traçabilité, rédigé par son contributeur, au même format :

Fichiers existants :

- `traceability-turn.md`
- `traceability-movement.md`
- `traceability-combat.md`
- `traceability-overwatch.md`

Fichiers prévus, pas encore créés : `traceability-line-of-sight.md`, `traceability-equipment.md`, `traceability-abilities.md`, `traceability-objectives.md`, `traceability-victory.md`, `traceability-special-rules.md`.

Ce fichier n'en reprend que la vue globale ; le détail vit dans les fichiers de domaine.

## Tableau global

| Règle | Règle source | Système | Implémentation | Test | UI | Statut |
|---|---|---|---|---|---|---|
| | | | | | | |

## Règles de mise à jour

- Une règle implémentée sans ligne de traçabilité n'est pas terminée.
- Les tests citent l'identifiant de règle dans leur nom ou un commentaire.
- Toute règle ambiguë renvoie à une entrée de `open-questions.md`.
