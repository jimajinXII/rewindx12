# Rewind – mettre l'appli en ligne et l'installer sur Android

Rewind est une web-app (PWA). Ses fichiers doivent être servis en **https** pour qu'Android
propose de l'installer. Tes données ne quittent jamais ton téléphone : en ligne, il n'y a que le code.

## 1. Mettre en ligne avec GitHub Pages (gratuit, ~10 minutes)

1. Crée un compte sur https://github.com si tu n'en as pas.
2. Clique sur **New repository** : nom `rewind`, visibilité **Public**, puis **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file**.
4. Glisse **tout le contenu** du dossier `rewind` (index.html, app.js, styles.css, sw.js,
   manifest.webmanifest et le dossier `icons`), puis **Commit changes**.
5. Va dans **Settings › Pages** : Source = **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
6. Après 1 ou 2 minutes, l'adresse s'affiche : `https://TON-PSEUDO.github.io/rewind/`.

Le code est public, mais il ne contient rien de personnel : ni tes données, ni tes clés.

## 2. Installer sur ton téléphone Android

1. Ouvre l'adresse dans **Chrome**.
2. Menu **⋮ › Ajouter à l'écran d'accueil › Installer**.
3. Rewind apparaît avec son icône et fonctionne hors connexion.

## 3. Créer ta clé TMDB (films, séries, documentaires)

1. Crée un compte sur https://www.themoviedb.org.
2. Va dans **Paramètres › API**, puis demande une clé (usage personnel).
3. Copie la **clé API** ou le **jeton d'accès en lecture**.
4. Dans Rewind : **Profil › Réglages**, colle-la, puis touche **Tester TMDB**.

Facultatif : une clé **RAWG** (https://rawg.io/apidocs) pour chercher les jeux vidéo.
Sans elle, tu peux ajouter tes jeux à la main. AniList (manga), Google Books et Open Library (livres)
et TheSportsDB (Sixers et AC Milan) ne demandent pas de clé.

## 4. Sauvegarder

**Profil › Sauvegarde › Exporter** crée un fichier `.json`. Fais-le régulièrement et garde-le
(Drive, mail…). **Importer** permet de tout restaurer, ou de passer sur un autre appareil.

## 5. Mettre à jour l'appli

Remplace les fichiers dans le dépôt GitHub (même procédure qu'à l'étape 1.4). L'appli se met
à jour à la prochaine ouverture avec du réseau. Tes données restent intactes.
