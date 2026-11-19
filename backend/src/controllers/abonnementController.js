const { mainDb } = require('../config/database');
const { provisionnerBoutique } = require('../services/provisionnement');

function getPlans(req, res) {
  const plans = mainDb.prepare('SELECT * FROM plans_abonnement WHERE actif=1 ORDER BY prix').all();
  res.json(plans);
}

function initierAbonnement(req, res) {
  const { slug, nomBoutique, email, motDePasse, plan } = req.body;
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

  const waveNumero = process.env.WAVE_NUMERO || '0700000000';
  res.json({
    abonnement_id: result.lastInsertRowid,
    slug,
    montant: planData.prix,
    plan: planData.nom,
    wave_numero: waveNumero,
    wave_message: `MYBOGO-${slug}`,
    instructions: `Envoyez ${planData.prix} FCFA au ${waveNumero} avec la référence MYBOGO-${slug}`,
  });
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
    res.json({
      message: 'Boutique créée avec succès.',
      slug: abo.slug,
      email: abo.email,
      date_fin: dateFin,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

function listerAbonnements(req, res) {
  const abos = mainDb.prepare('SELECT id,slug,nom_boutique,email,plan,montant,statut,date_debut,date_fin,created_at FROM abonnements ORDER BY created_at DESC').all();
  res.json(abos);
}

module.exports = { getPlans, initierAbonnement, confirmerPaiement, listerAbonnements };
