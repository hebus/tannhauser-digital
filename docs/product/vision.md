# Vision produit

Tannhäuser Digital est une adaptation numérique solo d'un jeu de plateau tactique à base d'escouades, pensée comme un « vrai » jeu de plateau numérique plutôt qu'une page web contenant un plateau.

> **Note propriété intellectuelle.** Ce dépôt est un projet de développement. Les assets (illustrations, personnages, noms, scénarios) sont des **placeholders** ou des créations originales. Toute distribution publique (Steam inclus) exige au préalable les droits/licences sur la marque, les règles, les illustrations et les scénarios du jeu d'origine. Le dépôt ne reproduit pas le texte des règles officielles : `docs/rules/` contient des reformulations techniques orientées implémentation.

## Public cible

- Joueurs de jeux tactiques au tour par tour.
- Fans du jeu de plateau souhaitant y jouer seuls, sans préparation ni comptabilité manuelle.
- Joueurs sur PC et Steam Deck, clavier/souris ou manette.

## Expérience

| Axe | Cible V1 |
|---|---|
| Durée de session | 30 à 60 min par scénario ; reprise possible à tout moment (sauvegarde) |
| Difficulté | 3 niveaux d'IA ; tutoriel guidé ; aperçu des actions légales avec explication des refus |
| Expérience solo | Joueur contre IA ; l'IA passe par la même interface de commandes qu'un humain |
| Campagne | Suite de scénarios, équipe conservée, état de campagne séparé de l'état de partie |
| Scénario | Données validées par ArkType : carte, entrées, objectifs, conditions de victoire |
| Rejouabilité | Modes de jeu multiples, choix de faction/équipe/équipement, graine aléatoire rejouable |
| Ambition visuelle | Rendu PixiJS soigné, caméra, animations pilotées par les événements du moteur |
| Ambition audio | Un retour sonore associé aux événements majeurs du moteur |
| Accessibilité | Daltonisme (couleurs de plateau doublées d'icônes/motifs), UI redimensionnable, manette, sous-titres |
| Steam | Cloud, succès, overlay, captures, compatibilité Steam Deck |
| Localisation | Identifiants canoniques côté moteur ; textes localisés hors moteur (FR/EN d'abord) |

## Principes directeurs

- Moteur déterministe, indépendant du rendu, sérialisable ; seules les commandes modifient l'état.
- Le moteur résout et explique (journal de règles) ; le joueur décide.
- Contenu piloté par les données et validé par ArkType.
- Aucun soft lock toléré.
