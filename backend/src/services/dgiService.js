/**
 * Service d'intégration DGI Côte d'Ivoire — Système de Facturation Normalisée Électronique (SFNE)
 *
 * IMPORTANT : Ce service est construit en mode MOCK par défaut (DGI_MODE=mock).
 * Quand la DGI te fournit tes credentials officiels :
 *  1. Remplis DGI_API_URL, DGI_API_KEY, DGI_CLIENT_ID, DGI_CLIENT_SECRET dans .env
 *  2. Change DGI_MODE=sandbox pour tester sur l'environnement de recette DGI
 *  3. Change DGI_MODE=production pour la mise en production
 *
 * Structure de la payload envoyée à la DGI (norme SFNE CI) :
 *  https://api.dgi.gouv.ci/sfne/v1  ← endpoint officiel (à confirmer avec la DGI)
 */

const https = require('https');
const crypto = require('crypto');

const MODE = process.env.DGI_MODE || 'mock';
const API_URL = process.env.DGI_API_URL || 'https://api.dgi.gouv.ci/sfne/v1';
const API_KEY = process.env.DGI_API_KEY || '';
const CLIENT_ID = process.env.DGI_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DGI_CLIENT_SECRET || '';
const NIF_EMETTEUR = process.env.DGI_NIF_EMETTEUR || process.env.SOCIETE_NIF || '';

// ── Helpers ────────────────────────────────────────────────────────

function genererNumeroDGI() {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `DGI-CI-${ymd}-${rand}`;
}

function genererQRData(facture, numeroDGI) {
  // Format standard QR code facture CI :
  // NIF_emetteur|numero_facture|numero_DGI|date|total_TTC|tva
  return [
    NIF_EMETTEUR,
    facture.numero,
    numeroDGI,
    new Date(facture.created_at || Date.now()).toISOString().slice(0,10),
    Math.round(facture.total),
    Math.round(facture.tva_total),
  ].join('|');
}

function construirePayload(facture, lignes, client) {
  return {
    version: '1.0',
    emetteur: {
      nif:     NIF_EMETTEUR,
      rccm:    process.env.SOCIETE_RCCM || '',
      nom:     process.env.SOCIETE_NOM  || '',
      adresse: process.env.SOCIETE_ADRESSE || '',
    },
    acheteur: client ? {
      nif:     client.numero_contribuable || '',
      nom:     client.nom,
      adresse: client.adresse || '',
      telephone: client.telephone || '',
    } : { nif: '', nom: 'CLIENT PASSAGE' },
    facture: {
      numero:        facture.numero,
      type:          facture.type.toUpperCase(),
      date:          new Date(facture.created_at || Date.now()).toISOString().slice(0,10),
      regime_tva:    facture.regime_tva,
      mode_paiement: facture.mode_paiement,
    },
    lignes: lignes.map((l, i) => ({
      ligne:        i + 1,
      designation:  l.designation,
      quantite:     l.quantite,
      unite:        l.unite || 'pièce',
      prix_ht:      Math.round(l.prix_ht * 100) / 100,
      remise:       l.remise || 0,
      taux_tva:     l.taux_tva,
      montant_ht:   Math.round(l.montant_ht * 100) / 100,
      montant_tva:  Math.round(l.montant_tva * 100) / 100,
      montant_ttc:  Math.round(l.montant_ttc * 100) / 100,
    })),
    totaux: {
      sous_total: Math.round(facture.sous_total),
      remise_pct: facture.remise || 0,
      tva_total:  Math.round(facture.tva_total),
      total_ttc:  Math.round(facture.total),
    },
    hash: crypto.createHash('sha256')
      .update(`${NIF_EMETTEUR}|${facture.numero}|${Math.round(facture.total)}|${CLIENT_SECRET}`)
      .digest('hex'),
  };
}

// ── Appel HTTP générique ───────────────────────────────────────────

function httpPost(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(`${API_URL}${path}`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Api-Key':     API_KEY,
        'X-Client-Id':   CLIENT_ID,
        'Authorization': `Bearer ${API_KEY}`,
      },
      timeout: 15000,
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || parsed.error || `HTTP ${res.statusCode}`));
          }
        } catch {
          reject(new Error(`Réponse DGI non valide: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error',   err => reject(new Error(`Connexion DGI échouée: ${err.message}`)));
    req.on('timeout', ()  => { req.destroy(); reject(new Error('Délai DGI dépassé (15s)')); });
    req.write(body);
    req.end();
  });
}

// ── Mode MOCK ─────────────────────────────────────────────────────

function mockSoumission(payload) {
  const numeroDGI = genererNumeroDGI();
  const qrData    = genererQRData(
    { numero: payload.facture.numero, created_at: payload.facture.date, total: payload.totaux.total_ttc, tva_total: payload.totaux.tva_total },
    numeroDGI
  );
  return {
    success:    true,
    mode:       'mock',
    dgi_numero: numeroDGI,
    qr_data:    qrData,
    statut:     'VALIDE',
    message:    '[MODE MOCK] Facture enregistrée avec succès (simulation DGI)',
    timestamp:  new Date().toISOString(),
    token_validation: crypto.randomBytes(16).toString('hex'),
  };
}

// ── API publique du service ────────────────────────────────────────

async function soumettreFacture(facture, lignes, client = null) {
  const payload = construirePayload(facture, lignes, client);

  if (MODE === 'mock') {
    await new Promise(r => setTimeout(r, 400)); // simule latence réseau
    return { payload, reponse: mockSoumission(payload) };
  }

  // Sandbox ou production → appel réel
  const reponse = await httpPost('/invoices/submit', payload);
  return { payload, reponse };
}

async function verifierStatut(numeroDGI) {
  if (MODE === 'mock') {
    return {
      dgi_numero: numeroDGI,
      statut:     'VALIDE',
      message:    '[MODE MOCK] Facture valide',
      timestamp:  new Date().toISOString(),
    };
  }
  return httpPost('/invoices/status', { dgi_numero: numeroDGI });
}

async function annulerFactureDGI(numeroDGI, motif = 'Annulation') {
  if (MODE === 'mock') {
    return { dgi_numero: numeroDGI, statut: 'ANNULE', message: '[MODE MOCK] Annulation enregistrée' };
  }
  return httpPost('/invoices/cancel', { dgi_numero: numeroDGI, motif });
}

module.exports = {
  soumettreFacture,
  verifierStatut,
  annulerFactureDGI,
  getMode: () => MODE,
  isConfigured: () => !!(API_KEY && CLIENT_ID && MODE !== 'mock'),
};
