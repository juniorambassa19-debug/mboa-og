# Portier Open Graph — MboaCatalog

Petit projet Vercel qui génère les aperçus WhatsApp des produits, **sans toucher
à l'app** (qui reste sur Firebase). Aucun paiement, aucun secret, aucune carte
bancaire.

## Ce que ça fait

Quand quelqu'un partage `https://<projet>.vercel.app/p/<idProduit>` :

- **WhatsApp** (le robot) reçoit un aperçu : photo du produit + prix + nom.
- **Un vrai client** est redirigé instantanément vers la boutique Firebase
  (`https://mboacatalog.web.app`).

## Fichiers

- `api/_og.js` — helpers : lecture Firestore (REST public, lecture seule) +
  construction de l'URL Cloudinary (validée en étape 1) + génération du HTML.
- `api/p.js` — la fonction appelée pour `/p/:id`.
- `vercel.json` — route `/p/:id` vers la fonction.

## Déploiement (à faire par toi)

1. Crée un nouveau projet sur https://vercel.com (gratuit, sans carte).
2. Nomme-le comme tu veux (ex. `mboacatalog`) → il donnera l'URL
   `mboacatalog.vercel.app`.
3. Dépose ce dossier (glisser-déposer, ou via GitHub/CLI Vercel).
4. Une fois déployé, teste dans un navigateur :
   `https://<ton-projet>.vercel.app/p/<unVraiIdProduit>`
   → tu dois être redirigé vers la boutique.
5. Teste l'aperçu réel avec le validateur Facebook (qui lit les balises OG comme
   WhatsApp) : https://developers.facebook.com/tools/debug/
   Colle l'URL `/p/<id>`, tu verras l'aperçu tel que WhatsApp l'affichera.

## Rien à changer dans l'app pour tester

Tu peux valider le portier AVANT de toucher à l'app : il te suffit d'un vrai
`idProduit` (visible dans Firestore, collection `produits`). L'étape suivante
(brancher le bouton « Partager » de l'app sur ces liens) viendra seulement une
fois que l'aperçu est confirmé.

## Points à ajuster ensemble ensuite

- L'URL de redirection client (`APP_BASE` + le chemin `/#/produit/<id>` dans
  `api/p.js`) doit correspondre au vrai routage de l'app. À vérifier sur un vrai
  lien.
- L'aperçu vitrine (`/catalogue?v=<shopId>`) : on l'ajoutera après le produit.
