# Pixel War Server

Grille de pixels partagee en temps reel (WebSocket), payante via PayPal (1 EUR/pixel),
avec un compte administrateur qui pose des pixels gratuitement et voit les statistiques.

## Variables d'environnement a definir (sur Render : Settings > Environment)

| Nom | Description |
|---|---|
| ADMIN_PASSWORD | Mot de passe pour se connecter en admin (cliquer sur le logo "Pixel War" en haut a gauche). A definir absolument, sinon le mot de passe par defaut "changeme123" reste actif. |
| PAYPAL_CLIENT_ID | Recupere sur developer.paypal.com (voir plus bas) |
| PAYPAL_CLIENT_SECRET | Idem |
| PAYPAL_ENV | "sandbox" (par defaut, pour tester sans vrai argent) ou "live" (paiements reels) |

## Obtenir des identifiants PayPal (sandbox, pour tester gratuitement)

1. Va sur https://developer.paypal.com et connecte-toi (ou cree un compte PayPal classique, ca suffit).
2. Dans le menu, va sur "Apps & Credentials". Verifie que tu es bien en mode "Sandbox" (interrupteur en haut).
3. Une app "Default Application" existe deja, ou clique "Create App" pour en creer une.
4. Copie le "Client ID" et le "Secret" affiches -> ce sont PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET.
5. Pour payer en mode test, PayPal cree automatiquement un compte acheteur factice
   (visible dans "Sandbox > Accounts") avec un email/mot de passe de test -> utilise-le
   au moment de payer sur le site, aucun vrai argent n'est debite.

## Passer en vrais paiements

Change PAYPAL_ENV en "live", et remplace PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET par
les identifiants de l'app en mode "Live" (meme page developer.paypal.com, basculer
l'interrupteur Sandbox/Live en haut).

## Utiliser le compte admin

Clique sur le logo "Pixel War" en haut a gauche de l'ecran -> une fenetre demande le
mot de passe (celui defini dans ADMIN_PASSWORD). Une fois connecte :
- Un badge "ADMIN" apparait, la pastille du logo devient bleue.
- Chaque clic droit sur une case pose le pixel immediatement, sans paiement.
- La pastille "Revenu total" en haut affiche le cumul de tous les paiements PayPal reussis.
Le mode admin reste actif meme apres avoir ferme l'onglet (stocke dans le navigateur) ;
recliquer sur le logo puis confirmer permet de se deconnecter.

## Lancer en local

    npm install
    npm start

Puis ouvrir http://localhost:3000

## Deployer en ligne (Render.com)

Voir render.yaml. Sur Render, apres avoir cree le service, va dans Settings > Environment
et ajoute les variables listees plus haut, puis redeploie (Manual Deploy > Deploy latest commit).

## Notes

- L'etat des pixels ET le revenu cumule sont sauvegardes dans pixels.json sur le disque
  du serveur. Sur le plan gratuit Render, ce disque n'est pas persistant entre redemarrages :
  pour une vraie persistance, remplacer par une base de donnees (schema Supabase deja prepare).
- Chaque paiement PayPal est verifie cote serveur (capture de la commande) avant d'accepter
  le placement du pixel : un utilisateur ne peut pas poser un pixel sans payer reellement.
