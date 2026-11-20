const { mainDb } = require('../config/database');
const { provisionnerBoutique } = require('../services/provisionnement');
const { creerPaiement, verifierSignature } = require('../services/jeko');

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
  if (existant) return res.status(400).json({ message: `Le code boutique "${slug}" est déjà utilisé.` });

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

  if (status !== 'success') {
    const slug = reference.replace(/^MYBOGO-/, '').split('-')[0];
    mainDb.prepare("UPDATE abonnements SET statut='echec' WHERE jeko_payment_id=? OR (slug=? AND statut='en_attente')")
      .run(req.body.id || '', slug);
    return res.json({ received: true });
  }

  // Trouver l'abonnement par jeko_payment_id ou par slug+référence
  const slug = reference.replace(/^MYBOGO-/, '').split('-')[0];
  const abo = mainDb.prepare(
    "SELECT * FROM abonnements WHERE statut='en_attente' AND (jeko_payment_id=? OR slug=?) ORDER BY id DESC LIMIT 1"
  ).get(req.body.id || '', slug);

  if (!abo) return res.json({ received: true, note: 'Abonnement introuvable ou déjà activé' });

  const planData = mainDb.prepare('SELECT * FROM plans_abonnement WHERE code=?').get(abo.plan);
  const dateDebut = new Date().toISOString();
  const dateFin = new Date(Date.now() + planData.duree_jours * 86400000).toISOString();

  try {
    provisionnerBoutique({ slug: abo.slug, nomBoutique: abo.nom_boutique, email: abo.email, motDePasse: abo.mdp_temp });
    mainDb.prepare("UPDATE abonnements SET statut='actif', date_debut=?, date_fin=?, wave_ref=?, mdp_temp=NULL WHERE id=?")
      .run(dateDebut, dateFin, reference, abo.id);
    console.log(`[Jèko] Boutique activée: ${abo.slug}`);
  } catch (err) {
    console.error('[Jèko] Erreur provisionnement:', err.message);
  }

  res.json({ received: true });
}

function confirmerPaiement(req, res) {
  const { abonnement_id, wave_ref } = req.body;
  const abo = mainDb.prepare("SELECT * FROM abonnements WHERE id=? AND statut='en_attente'").get(abonnement_id);
  if (!abo) return res.status(404).json({ message: 'Abonnement non trouvé ou déjà traité.' });

  const planData = mainDb.prepare('SELECT * FROM plans_abonnement WHERE code=?').get(abo.plan);
  const dateDebut = new Date().toISOString();
  const dateFin = new Date(Date.now() + planData.duree_jours * 86400000).toISOString();

  try {
    provisionnerBoutique({ slug: abo.slug, nomBoutique: abo.nom_boutique, email: abo.email, motDePasse: abo.mdp_temp });
    mainDb.prepare("UPDATE abonnements SET statut='actif', date_debut=?, date_fin=?, wave_ref=?, mdp_temp=NULL WHERE id=?")
      .run(dateDebut, dateFin, wave_ref || 'MANUEL', abonnement_id);
    res.json({ message: 'Boutique créée avec succès.', slug: abo.slug, email: abo.email, date_fin: dateFin });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

function statutPaiement(req, res) {
  const { reference } = req.params;
  const slug = reference.replace(/^MYBOGO-/, '').split('-')[0];
  const abo = mainDb.prepare(
    'SELECT slug, statut, nom_boutique, email FROM abonnements WHERE slug=? ORDER BY id DESC LIMIT 1'
  ).get(slug);
  if (!abo) return res.status(404).json({ message: 'Introuvable' });
  res.json(abo);
}

function listerAbonnements(req, res) {
  const abos = mainDb.prepare(
    'SELECT id,slug,nom_boutique,email,plan,montant,statut,date_debut,date_fin,jeko_payment_id,created_at FROM abonnements ORDER BY created_at DESC'
  ).all();
  res.json(abos);
}

module.exports = { getPlans, initierAbonnement, webhookJeko, confirmerPaiement, statutPaiement, listerAbonnements };
