const { mainDb, tenantDbWrapped, currentTenantSlug } = require('../config/database');
const { provisionnerBoutique } = require('../services/provisionnement');
const { creerPaiement, verifierSignature } = require('../services/jeko');
const { envoyerAcces, notifierInscription } = require('../services/mailer');
const tenantRegistry = require('../services/tenantRegistry');

const CODES_RESERVES = new Set(['admin', 'api', 'www', 'app', 'mail', 'health', 'webhook', 'webhooks', 'uploads']);

function genererSlug(nom) {
  let base = String(nom).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  if (base.length < 3) base = 'boutique';
  const pris = new Set(tenantRegistry.lister().map(t => t.slug));
  const indisponible = s => pris.has(s) || CODES_RESERVES.has(s)
    || mainDb.prepare("SELECT id FROM abonnements WHERE slug=? AND statut IN ('actif','en_attente')").get(s);
  let slug = base;
  for (let i = 2; indisponible(slug); i++) slug = `${base}-${i}`;
  return slug;
}

// Anti-abus de l'essai gratuit : 5 inscriptions par heure et par adresse IP.
const tentativesEssai = new Map();
function limiteAtteinte(ip) {
  const maintenant = Date.now();
  const recentes = (tentativesEssai.get(ip) || []).filter(t => maintenant - t < 3600000);
  if (recentes.length >= 5) { tentativesEssai.set(ip, recentes); return true; }
  recentes.push(maintenant);
  tentativesEssai.set(ip, recentes);
  return false;
}

async function demarrerEssai(req, res) {
  const { nomBoutique, email, motDePasse } = req.body;
  const telephone = String(req.body.telephone || '').replace(/[^\d+ ()-]/g, '').trim().slice(0, 25);
  if (!nomBoutique || !email || !motDePasse)
    return res.status(400).json({ message: 'Nom de la boutique, e-mail et mot de passe sont requis.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ message: 'Adresse e-mail invalide.' });
  if (String(motDePasse).length < 6)
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limiteAtteinte(ip))
    return res.status(429).json({ message: "Trop d'inscriptions depuis cette connexion. Réessayez plus tard." });

  const emailNorm = email.trim().toLowerCase();
  if (tenantRegistry.lister().some(t => (t.email || '').toLowerCase() === emailNorm))
    return res.status(400).json({ message: 'Un compte existe déjà avec cet e-mail. Connectez-vous depuis la page de connexion.' });

  const slug = genererSlug(nomBoutique);
  try {
    provisionnerBoutique({ slug, nomBoutique: nomBoutique.trim(), email: emailNorm, motDePasse, dureeJours: 15, type: 'trial', telephone });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
  const finEssai = new Date(Date.now() + 15 * 86400000).toISOString();
  const emailEnvoye = await envoyerAcces({ email: emailNorm, nomBoutique: nomBoutique.trim(), slug, finLicence: finEssai, essai: true, telephone });
  notifierInscription({ nomBoutique: nomBoutique.trim(), slug, email: emailNorm, telephone, finEssai });
  res.status(201).json({ slug, nomBoutique: nomBoutique.trim(), email: emailNorm, telephone, finEssai, emailEnvoye });
}

// Référence "MYBOGO-<slug>-<id>" : le slug peut contenir des tirets, l'id est le dernier segment.
function parseReference(reference) {
  const m = /^MYBOGO-(.+)-(\d+)$/.exec(reference || '');
  return m ? { slug: m[1], aboId: Number(m[2]) } : null;
}

function getPlans(req, res) {
  const plans = mainDb.prepare('SELECT * FROM plans_abonnement WHERE actif=1 ORDER BY prix').all();
  res.json(plans);
}

async function initierAbonnement(req, res) {
  const { slug, nomBoutique, email, motDePasse, plan, methode } = req.body;
  if (!slug || !nomBoutique || !email || !motDePasse || !plan)
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  if (!/^[a-z0-9-]+$/.test(slug))
    return res.status(400).json({ message: 'Le code boutique ne doit contenir que des lettres minuscules, chiffres et tirets.' });

  const existant = mainDb.prepare("SELECT id FROM abonnements WHERE slug=? AND statut IN ('actif','en_attente')").get(slug);
  if (existant || tenantRegistry.lister().some(t => t.slug === slug) || CODES_RESERVES.has(slug))
    return res.status(400).json({ message: `Le code boutique "${slug}" est déjà utilisé.` });

  const planData = mainDb.prepare('SELECT * FROM plans_abonnement WHERE code=? AND actif=1').get(plan);
  if (!planData) return res.status(400).json({ message: 'Plan invalide.' });

  const result = mainDb.prepare(`
    INSERT INTO abonnements (slug, plan, montant, statut, nom_boutique, email, mdp_temp, created_at)
    VALUES (?, ?, ?, 'en_attente', ?, ?, ?, datetime('now'))
  `).run(slug, plan, planData.prix, nomBoutique, email, motDePasse);

  const aboId = result.lastInsertRowid;
  const reference = `MYBOGO-${slug}-${aboId}`;
  const appUrl = process.env.APP_URL || 'https://mybogo-cloud-production.up.railway.app';

  if (process.env.JEKO_API_KEY && process.env.JEKO_STORE_ID) {
    try {
      const paiement = await creerPaiement({
        montant: planData.prix,
        reference,
        successUrl: `${appUrl}/paiement/success?ref=${reference}`,
        errorUrl: `${appUrl}/paiement/error?ref=${reference}`,
        methode: methode || 'wave',
      });
      mainDb.prepare('UPDATE abonnements SET jeko_payment_id=? WHERE id=?').run(paiement.id, aboId);
      return res.json({
        abonnement_id: aboId,
        slug,
        montant: planData.prix,
        plan: planData.nom,
        redirect_url: paiement.redirectUrl,
        jeko: true,
      });
    } catch (err) {
      console.error('[Jèko] Erreur création paiement:', err.message);
    }
  }

  // Fallback Wave manuel
  const waveNumero = process.env.WAVE_NUMERO || '0504079131';
  res.json({
    abonnement_id: aboId,
    slug,
    montant: planData.prix,
    plan: planData.nom,
    wave_numero: waveNumero,
    wave_message: `MYBOGO-${slug}`,
    instructions: `Envoyez ${planData.prix} FCFA au ${waveNumero} avec la référence MYBOGO-${slug}`,
    jeko: false,
  });
}

async function webhookJeko(req, res) {
  const signature = req.headers['jeko-signature'];
  const event = req.headers['jeko-event'];
  const bodyBrut = req.rawBody || JSON.stringify(req.body);

  if (!verifierSignature(bodyBrut, signature)) {
    return res.status(401).json({ message: 'Signature invalide' });
  }

  if (event !== 'TRANSACTION_COMPLETED') {
    return res.json({ received: true });
  }

  const { status, transactionDetails } = req.body;
  const reference = transactionDetails?.reference;

  if (!reference || !reference.startsWith('MYBOGO-')) {
    return res.json({ received: true });
  }

  const ref = parseReference(reference);
  if (!ref) return res.json({ received: true });

  if (status !== 'success') {
    mainDb.prepare("UPDATE abonnements SET statut='echec' WHERE id=? AND slug=? AND statut='en_attente'")
      .run(ref.aboId, ref.slug);
    return res.json({ received: true });
  }

  const abo = mainDb.prepare("SELECT * FROM abonnements WHERE id=? AND slug=? AND statut='en_attente'")
    .get(ref.aboId, ref.slug);

  if (!abo) return res.json({ received: true, note: 'Abonnement introuvable ou déjà activé' });

  const planData = mainDb.prepare('SELECT * FROM plans_abonnement WHERE code=?').get(abo.plan);
  try {
    activerAbonnement(abo, planData, reference);
    console.log(`[Jèko] Abonnement activé: ${abo.slug}`);
  } catch (err) {
    // 500 : Jèko réessaie l'envoi, le client a déjà payé.
    console.error('[Jèko] Erreur activation:', err.message);
    return res.status(500).json({ message: 'Activation échouée, nouvelle tentative attendue.' });
  }

  res.json({ received: true });
}

// Boutique inexistante : création (premier abonnement). Boutique existante : prolongation de
// sa licence à partir de la fin actuelle (ou d'aujourd'hui si elle est déjà expirée).
function activerAbonnement(abo, planData, reference) {
  const dateDebut = new Date().toISOString();
  const boutique = tenantRegistry.lister().find(t => t.slug === abo.slug);
  let dateFin;

  if (boutique) {
    const tdb = tenantDbWrapped(boutique.slug, boutique.dbPath);
    const lic = tdb.prepare('SELECT type, expires_at FROM licence WHERE id = 1').get();
    const aujourdhui = dateDebut.slice(0, 10);
    const base = lic && lic.type !== 'suspended' && lic.expires_at > aujourdhui ? lic.expires_at : aujourdhui;
    const fin = new Date(base + 'T00:00:00Z');
    fin.setUTCDate(fin.getUTCDate() + planData.duree_jours);
    tdb.prepare(`
      INSERT INTO licence (id, type, expires_at, activated_at) VALUES (1, 'full', ?, date('now'))
      ON CONFLICT(id) DO UPDATE SET type='full', expires_at=excluded.expires_at, activated_at=date('now')
    `).run(fin.toISOString().slice(0, 10));
    dateFin = fin.toISOString();
  } else {
    provisionnerBoutique({ slug: abo.slug, nomBoutique: abo.nom_boutique, email: abo.email, motDePasse: abo.mdp_temp, dureeJours: planData.duree_jours, type: 'full' });
    dateFin = new Date(Date.now() + planData.duree_jours * 86400000).toISOString();
  }

  mainDb.prepare("UPDATE abonnements SET statut='actif', date_debut=?, date_fin=?, wave_ref=?, mdp_temp=NULL WHERE id=?")
    .run(dateDebut, dateFin, reference, abo.id);
  envoyerAcces({ email: abo.email, nomBoutique: abo.nom_boutique, slug: abo.slug, finLicence: dateFin, essai: false });
  return dateFin;
}

// Paiement d'un abonnement par une boutique existante (essai terminé ou licence expirée).
async function renouvelerLicence(req, res) {
  const slug = currentTenantSlug();
  const boutique = slug && tenantRegistry.lister().find(t => t.slug === slug);
  if (!boutique) return res.status(400).json({ message: 'Renouvellement disponible depuis votre boutique en ligne (avec son code boutique).' });

  const planData = mainDb.prepare('SELECT * FROM plans_abonnement WHERE code=? AND actif=1').get(req.body.plan);
  if (!planData) return res.status(400).json({ message: 'Formule invalide.' });
  if (!(process.env.JEKO_API_KEY && process.env.JEKO_API_KEY_ID && process.env.JEKO_STORE_ID))
    return res.status(503).json({ message: 'Le paiement en ligne est momentanément indisponible. Contactez le support.' });

  const result = mainDb.prepare(`
    INSERT INTO abonnements (slug, plan, montant, statut, nom_boutique, email, created_at)
    VALUES (?, ?, ?, 'en_attente', ?, ?, datetime('now'))
  `).run(slug, planData.code, planData.prix, boutique.nom, boutique.email);
  const aboId = result.lastInsertRowid;
  const reference = `MYBOGO-${slug}-${aboId}`;
  const appUrl = process.env.APP_URL || 'https://mybogo-cloud-production.up.railway.app';

  try {
    const paiement = await creerPaiement({
      montant: planData.prix,
      reference,
      successUrl: `${appUrl}/paiement/success?ref=${reference}`,
      errorUrl: `${appUrl}/paiement/error?ref=${reference}`,
      methode: req.body.methode || 'wave',
    });
    mainDb.prepare('UPDATE abonnements SET jeko_payment_id=? WHERE id=?').run(paiement.id, aboId);
    res.json({ redirect_url: paiement.redirectUrl });
  } catch (err) {
    console.error('[Jèko] Erreur création paiement (renouvellement):', err.message);
    mainDb.prepare("UPDATE abonnements SET statut='echec' WHERE id=?").run(aboId);
    res.status(502).json({ message: "Impossible de lancer le paiement. Réessayez dans un instant." });
  }
}

function confirmerPaiement(req, res) {
  const { abonnement_id, wave_ref } = req.body;
  const abo = mainDb.prepare("SELECT * FROM abonnements WHERE id=? AND statut='en_attente'").get(abonnement_id);
  if (!abo) return res.status(404).json({ message: 'Abonnement non trouvé ou déjà traité.' });

  const planData = mainDb.prepare('SELECT * FROM plans_abonnement WHERE code=?').get(abo.plan);
  try {
    const dateFin = activerAbonnement(abo, planData, wave_ref || 'MANUEL');
    res.json({ message: 'Abonnement activé avec succès.', slug: abo.slug, email: abo.email, date_fin: dateFin });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

function statutPaiement(req, res) {
  const ref = parseReference(req.params.reference);
  if (!ref) return res.status(404).json({ message: 'Introuvable' });
  const abo = mainDb.prepare(
    'SELECT slug, statut, nom_boutique, email FROM abonnements WHERE id=? AND slug=?'
  ).get(ref.aboId, ref.slug);
  if (!abo) return res.status(404).json({ message: 'Introuvable' });
  res.json(abo);
}

function listerAbonnements(req, res) {
  const abos = mainDb.prepare(
    'SELECT id,slug,nom_boutique,email,plan,montant,statut,date_debut,date_fin,jeko_payment_id,created_at FROM abonnements ORDER BY created_at DESC'
  ).all();
  res.json(abos);
}

module.exports = { getPlans, initierAbonnement, demarrerEssai, renouvelerLicence, webhookJeko, confirmerPaiement, statutPaiement, listerAbonnements };
