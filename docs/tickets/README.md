# Tickets

Chaque jalon est découpé en tickets `TH-NNN` de taille réduite ; ne jamais confier tout le projet en une seule tâche.

## Gabarit

```markdown
# TH-NNN Titre

## Goal
Objectif en une ou deux phrases.

## Context
Pourquoi, règles concernées (`RULE-...`), décisions d'architecture.

## Files
Fichiers à créer ou modifier.

## API
Signatures publiques (types, fonctions, commandes, événements).

## Acceptance criteria
- [ ] Critères vérifiables.

## Tests
Tests automatisés attendus (fichiers, cas).

## Manual verification
Étapes de vérification manuelle.

## Dependencies
Tickets préalables (TH-NNN).
```

## Liste initiale

| Ticket | Titre |
|---|---|
| TH-001 | Initialize monorepo |
| TH-002 | Configure TypeScript |
| TH-003 | Configure Vitest |
| TH-004 | Create GameState |
| TH-005 | Create Command system |
| TH-006 | Create Event system |
| TH-007 | Implement deterministic RNG |
| TH-008 | Implement board graph |
| TH-009 | Implement movement |
| TH-010 | Implement combat |
