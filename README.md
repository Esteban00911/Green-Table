# Table Verte — Poker Manager

Application web mobile-first pour gérer les jetons d'une partie de Texas Hold'em jouée avec de vraies cartes. Aucun argent réel, aucun compte et aucun serveur applicatif.

## Tester sur ordinateur
1. Décompressez le ZIP.
2. Ouvrez le dossier dans VS Code.
3. Lancez `index.html` avec l'extension **Live Server**. Vous pouvez aussi ouvrir directement le fichier, mais l'installation PWA et le mode hors ligne nécessitent un serveur sécurisé.
4. `node tests.js` lance les tests automatisés des règles isolées (Node.js requis).

## Installer sur un téléphone
Pour obtenir une icône sur l'écran d'accueil et un lancement en plein écran, l'application doit être publiée sur une adresse HTTPS. Une méthode simple est GitHub Pages :

1. Créez un dépôt GitHub vide (par exemple `table-verte`).
2. Déposez dans ce dépôt tous les fichiers du dossier, à la racine : `index.html`, `styles.css`, `script.js`, `poker-rules.js`, `manifest.json`, `service-worker.js`, `icon.svg`, `icon-192.png` et `icon-512.png`.
3. Dans le dépôt, ouvrez **Settings → Pages**. Choisissez **Deploy from a branch**, puis `main` et `/ (root)`, et enregistrez.
4. Attendez la publication et ouvrez l'adresse HTTPS affichée par GitHub Pages sur le téléphone.
5. **Android / Chrome** : menu `⋮` → **Installer l'application** ou **Ajouter à l'écran d'accueil**.
6. **iPhone / Safari** : bouton de partage → **Sur l'écran d'accueil**.

La première ouverture doit se faire en ligne. Une fois les fichiers mis en cache, l'application peut fonctionner hors ligne. Après une mise à jour, ferme puis rouvre l'application si l'ancienne version reste affichée.

## Fonctionnalités
- De 2 à 9 joueurs, tapis de départ, blinds et chronomètre par tour.
- Positions correctes des blinds en heads-up : le donneur poste la petite blind et agit en premier préflop.
- Actions fold, check/call et mise/relance ; limites de tapis et relance minimale.
- Gestion des joueurs à tapis, remboursement des mises non suivies, pots principal et secondaires, contributions des joueurs couchés et distribution séparée de chaque pot.
- Une relance à tapis insuffisante ne rouvre pas automatiquement les relances ; les relances cumulées sont prises en compte.
- Déroulement automatique jusqu'à l'abattage lorsque plus personne ne peut miser.
- Partage du pot avec gestion des jetons indivisibles dans l'ordre des sièges à partir du donneur.
- Historique, annulation de la dernière action et aperçu mobile.
- Service worker et icônes pour l'installation PWA.

## Limites à connaître
- Les cartes sont distribuées physiquement : l'application n'évalue pas les combinaisons. À l'abattage, il faut sélectionner manuellement les gagnants de chaque pot.
- L'état de la partie n'est pas encore restauré après fermeture ou actualisation : termine ou note la partie avant de recharger la page.
- Le chronomètre fait se coucher automatiquement un joueur lorsque le temps expire ; désactive-le si cette règle ne convient pas à votre table.
- Les tests automatisés couvrent les calculs de pots annexes, le remboursement des mises non suivies, l'éligibilité des gagnants, la réouverture des relances et le partage des jetons. Une partie physique d'essai reste recommandée avant une longue session.


## Version 4 — tailles rapides et big blinds
- Les montants du pot, des tapis, des mises et des montants à suivre affichent aussi leur équivalent en BB (grosse blinde).
- Les boutons rapides de mise (% du pot) et de relance (multiplicateur de la mise actuelle) sont configurables au démarrage.
- Les préférences de tailles rapides sont enregistrées localement sur l'appareil via `localStorage`. Elles ne sont pas encore synchronisées entre appareils : cela viendra avec la version multijoueur en ligne.
- Le montant peut être réglé avec le curseur ou saisi directement dans le champ numérique.
