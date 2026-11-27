# Rollback

## A — Rollback applicatif (schéma compatible)

Conditions : nouvelle version échoue au démarrage / smoke, **aucune** migration incompatible appliquée.

1. Repasser l’image / tag précédent (`v7.16.2`)
2. Redémarrer le service app
3. Healthchecks + login + lecture `/usage`
4. Vérifier compteurs

## B — Rollback avec restauration

Conditions : migration incompatible, corruption, ou décision humaine.

1. **Stop** écritures applicatives
2. Choisir la sauvegarde correspondant à l’état souhaité
3. Restaurer vers une base **isolée** d’abord (preuve)
4. Seulement après validation humaine : bascule contrôlée (hors automatique)
5. Accepter la perte potentielle des données créées après la sauvegarde

**Jamais** de restore automatique par-dessus la base principale.
