# Plateformes cibles

## Systèmes et affichage

| Cible | Priorité | Remarque |
|---|---|---|
| Windows | V1 | Plateforme de référence |
| macOS | V1 | |
| Linux | V1 si praticable | Via packaging desktop |
| Steam Deck | V1 (compatibilité), V1.1 (finitions) | Entrées manette, UI lisible en 800p |
| 16:9 et ultrawide | V1 | Plateau centré, UI ancrée aux bords |
| Fenêtré / plein écran | V1 | |
| UI à l'échelle | V1 | Facteur d'échelle réglable |

## Entrées

- Clavier/souris : sélection, déplacement, ciblage, raccourcis.
- Manette : navigation par focus entre nœuds et actions, mêmes commandes que la souris.
- Toute entrée se traduit en commande du moteur ; aucune logique de règle dans les gestionnaires d'événements Pixi.

## Services Steam (via adaptateur plateforme)

Cloud (sauvegardes), succès, overlay, captures d'écran, localisation. L'adaptateur est une frontière : le moteur n'importe jamais le SDK Steam.

## Matrice de fonctionnalités

| Fonctionnalité | V1 | V1.1 | Future |
|---|:-:|:-:|:-:|
| Solo | x | | |
| Campagne | x | | |
| IA | x | x | |
| Sauvegarde/chargement | x | | |
| Steam Cloud | x | | |
| Succès | x | | |
| Manette | x | x | |
| Steam Deck | x | x | |
| Multijoueur | | | x |
| Workshop / modding | | | x |
