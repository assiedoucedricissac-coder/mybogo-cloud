# Déployer MYBOGO-STOCK-SAAS sur Railway (Étape 1 — un seul client, preuve de concept)

Le code est prêt et testé en local (voir vérification plus bas). Cette partie doit être faite par vous : je n'ai pas accès à un compte Railway.

## 1. Créer le compte et le projet

1. Allez sur railway.app, créez un compte (possible avec GitHub).
2. Deux façons de déployer, choisissez la plus simple pour vous :
   - **Option A — sans Git** : installez la CLI Railway (`npm install -g @railway/cli`), puis dans le dossier `MYBOGO-STOCK-SAAS` : `railway login` puis `railway init` puis `railway up`.
   - **Option B — avec GitHub** : créez un dépôt GitHub pour ce dossier, poussez le code, puis dans Railway "New Project → Deploy from GitHub repo".

## 2. Ajouter un volume persistant (ÉTAPE CRITIQUE)

Sans ça, toutes les données seraient effacées à chaque redéploiement.

1. Dans le projet Railway, sur le service → onglet **Volumes** → **New Volume**.
2. Point de montage : `/data`
3. Taille : 1 Go suffit largement pour démarrer.

## 3. Variables d'environnement

Sur le service → onglet **Variables**, ajoutez :

| Nom | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | une longue chaîne aléatoire — **jamais** la valeur utilisée dans l'app desktop. Générez-en une avec `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `MYBOGO_DB_PATH` | `/data/mybogo.db` |
| `MYBOGO_UPLOADS_PATH` | `/data/uploads` |

`PORT` est géré automatiquement par Railway, ne pas y toucher.

## 4. Déployer

- Option A (CLI) : `railway up`
- Option B (GitHub) : le déploiement se lance automatiquement après le push

Railway va exécuter `npm install`, puis `npm run build` (construit le frontend), puis `npm start`.

## 5. Vérifier que ça marche

1. Ouvrez l'URL fournie par Railway (`https://xxxx.up.railway.app`).
2. Vous devez voir l'écran de connexion. Un compte existe déjà dans la base de départ copiée (mêmes identifiants que sur votre poste de test).
3. Créez un produit ou une vente test.
4. **Le vrai test important** : redéployez (relancez `railway up`, ou repoussez un commit vide sur GitHub) et revérifiez que le produit/la vente créés sont **toujours là**. Si oui, le volume persiste correctement — c'est validé.

## Ce qui n'est PAS encore fait à ce stade

- Un seul client pour l'instant, pas encore plusieurs boutiques séparées (étape suivante du plan).
- Pas de nom de domaine personnalisé — Railway en fournit un gratuit (`xxxx.up.railway.app`) qui suffit pour cette preuve de concept.
- Pas encore de sauvegardes automatiques adaptées au serveur.

Revenez vers moi une fois déployé et testé — on passera à l'étape suivante (plusieurs clients séparés).
