# Pixel War Server

Grille de pixels partagee en temps reel (WebSocket), payante (1 EUR/pixel, simule).

## Lancer en local

    npm install
    npm start

Puis ouvrir http://localhost:3000

## Deployer en ligne (Render.com, gratuit)

1. Crer un compte sur https://render.com et connecter votre compte GitHub.
2. Pousser ce dossier dans un nouveau depot GitHub (voir plus bas).
3. Sur Render : "New +" -> "Web Service" -> selectionner le depot.
4. Render detecte le fichier render.yaml automatiquement (build: npm install, start: npm start).
5. Une fois deploye, Render fournit une URL publique du type https://pixel-war-server.onrender.com
   -> C'est cette URL que tout le monde ouvre, depuis n'importe quel reseau, sur n'importe quel telephone.

### Pousser ce dossier sur GitHub (si pas deja fait)

    cd pixel-war-server
    git init
    git add .
    git commit -m "Pixel War server"
    git branch -M main
    git remote add origin https://github.com/<votre-compte>/pixel-war-server.git
    git push -u origin main

## Notes

- L'etat des pixels est sauvegarde dans pixels.json sur le disque du serveur.
  Sur Render (plan gratuit), le disque n'est PAS persistant entre les redemarrages :
  pour une vraie persistance en production, remplacer le fichier JSON par une
  vraie base de donnees (voir schema Supabase deja prepare pour ce projet).
- Le paiement est simule. Brancher Stripe Checkout + webhook a l'endroit indique
  dans server.js (commentaire "SIMULATION du paiement").
