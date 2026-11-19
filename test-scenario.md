# Scénario de test — MYBOGO-STOCK
### Vérifie : marge carton, réconciliation caisse/crédit, tableau de bord

Suivez les étapes dans l'ordre, avec les montants exacts indiqués — sinon les résultats attendus ne correspondront plus.

---

## Préparation

1. **Produit** : créez (ou utilisez) un produit vendu au carton.
   - Prix d'achat du carton : **12 600 FCFA** (carton de 24)
   - Prix de vente du carton : **12 800 FCFA**
   - Stock initial : au moins 1 carton (24 unités)

2. **Client** : créez un client "Test Réconciliation" (sans dette antérieure).

---

## Étape 1 — Ouvrir la caisse

- Caisse → **Ouvrir**, fond d'ouverture = **10 000 FCFA**

**Attendu** : bannière verte "Fond de caisse : 10 000 FCFA"

---

## Étape 2 — Facture à crédit (pas de vente au comptant)

- Facturation → Nouveau document → **Facture**
- Client : "Test Réconciliation"
- 1 ligne : ce produit, quantité 1 carton, prix **12 800 FCFA**
- Montant payé : **0** (à crédit)
- Émettre

**Attendu** : facture créée, statut "Émise", reste à payer = 12 800 FCFA

---

## Étape 3 — Vérifier la marge (le bug d'origine)

- Rapports → onglet Marge (ou Tableau de bord)

**Attendu** : la marge sur cette facture doit être **200 FCFA** (12 800 − 12 600), **pas** un montant aberrant comme "12 537 FCFA"

---

## Étape 4 — Le client vient payer sa facture en espèces

- Clients → fiche du client "Test Réconciliation" → Ajouter un versement
- Montant : **12 800 FCFA**, mode : Espèces

**Attendu** : reçu généré, dette du client = 0

---

## Étape 5 — Vérifier le tableau de bord (le nouvel affichage)

- Tableau de bord

**Attendu** :
- **Ventes du jour** = 0 FCFA *(cette facture n'était pas une vente comptoir)*
- **Crédits encaissés** = **12 800 FCFA** *(nouveau — c'est le règlement qu'on vient de recevoir)*

---

## Étape 6 — Clôturer la caisse

- Caisse → Clôturer
- Espèces comptées dans le tiroir = **22 800 FCFA** *(10 000 fond + 12 800 reçus du client)*

**Attendu sur "Résultat de clôture"** :
- Fond d'ouverture : 10 000 FCFA
- Règlements facture : + 12 800 FCFA
- Total attendu : 22 800 FCFA
- Espèces comptées : 22 800 FCFA
- **Écart : 0 FCFA** ← le vrai test. S'il affiche un écart, il y a un problème.

---

## Étape 7 — Vérifier le ticket imprimé

- Avant de clôturer (ou juste après), imprimez l'Arrêté de caisse (bouton "Arrêté")

**Attendu** : le ticket sort entier et lisible (pas de colonnes coupées), avec une ligne "Règlements facture" visible si vous testez avant clôture.

---

### Si tout correspond → tout est bon.
### Si un chiffre ne colle pas, notez lequel précisément et envoyez-moi le détail (capture d'écran si possible).
