const nodemailer = require('nodemailer');

// Configuration par variables d'environnement Railway (n'importe quel fournisseur SMTP) :
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (ex: "MYBOGO-STOCK <contact@exemple.com>").
function configure() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport = null;
function getTransport() {
  if (!transport) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR');

// Ne lève jamais d'erreur : un e-mail qui échoue ne doit pas empêcher la création de la boutique.
async function envoyerAcces({ email, nomBoutique, slug, finLicence, essai }) {
  if (!configure()) {
    console.warn('[MAIL] SMTP non configuré — e-mail non envoyé à', email);
    return false;
  }
  const appUrl = process.env.APP_URL || 'https://mybogo-cloud-production.up.railway.app';
  const lien = `${appUrl}/login`;
  const sujet = essai ? `Votre boutique ${nomBoutique} est prête — essai gratuit de 15 jours` : `Votre abonnement MYBOGO-STOCK est activé — ${nomBoutique}`;
  const intro = essai
    ? `Votre essai gratuit de 15 jours a démarré. Il se termine le ${fmtDate(finLicence)}.`
    : `Votre paiement est confirmé. Votre abonnement est valable jusqu'au ${fmtDate(finLicence)}.`;

  const texte = [
    `Bonjour,`, ``, `Votre boutique "${nomBoutique}" est prête.`, intro, ``,
    `Pour vous connecter :`, `  Adresse : ${lien}`, `  Code boutique : ${slug}`, `  Email : ${email}`,
    `  Mot de passe : celui que vous avez choisi lors de l'inscription`, ``,
    `Conservez ce message : le code boutique est nécessaire à chaque connexion.`, ``, `L'équipe MYBOGO-STOCK`,
  ].join('\n');

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <h2 style="color:#1d4ed8;margin-bottom:4px">MYBOGO-STOCK</h2>
  <p>Bonjour,</p>
  <p>Votre boutique <strong>${esc(nomBoutique)}</strong> est prête.<br>${esc(intro)}</p>
  <table style="width:100%;border-collapse:collapse;background:#eff6ff;border-radius:10px">
    <tr><td style="padding:10px 14px;color:#6b7280">Code boutique</td><td style="padding:10px 14px"><strong style="font-size:18px;letter-spacing:1px">${esc(slug)}</strong></td></tr>
    <tr><td style="padding:10px 14px;color:#6b7280">Email</td><td style="padding:10px 14px">${esc(email)}</td></tr>
    <tr><td style="padding:10px 14px;color:#6b7280">Mot de passe</td><td style="padding:10px 14px">celui choisi à l'inscription</td></tr>
  </table>
  <p style="margin:22px 0"><a href="${esc(lien)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Me connecter</a></p>
  <p style="font-size:13px;color:#6b7280">Conservez ce message : le code boutique est nécessaire à chaque connexion.</p>
</div>`;

  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: sujet,
      text: texte,
      html,
    });
    return true;
  } catch (err) {
    console.error('[MAIL] Échec envoi à', email, ':', err.message);
    return false;
  }
}

// Pour le bouton de test du panneau d'administration : renvoie la vraie raison d'un échec.
async function tester(destinataire) {
  const manquantes = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter(k => !process.env[k]);
  if (manquantes.length) return { ok: false, message: `Variables absentes sur le serveur : ${manquantes.join(', ')}. Vérifiez les noms et que Railway a bien redéployé.` };
  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: destinataire,
      subject: 'Test MYBOGO-STOCK',
      text: "Si vous lisez ce message, l'envoi d'e-mails de MYBOGO-STOCK fonctionne.",
    });
    return { ok: true, message: `E-mail de test envoyé à ${destinataire}.` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = { envoyerAcces, configure, tester };
