const nodemailer = require('nodemailer');

// Fournisseurs d'envoi, par ordre de priorité (le premier configuré est utilisé) :
//  1. Resend  : RESEND_API_KEY                      (HTTPS, nécessite un domaine vérifié)
//  2. Brevo   : BREVO_API_KEY                       (HTTPS, un simple e-mail expéditeur vérifié suffit)
//  3. SMTP    : SMTP_HOST, SMTP_USER, SMTP_PASS     (Railway bloque souvent ce port)
// MAIL_FROM : "MYBOGO-STOCK <adresse@exemple.com>"
function configure() {
  return !!(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY
    || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

function fournisseur() {
  if (process.env.RESEND_API_KEY) return 'Resend';
  if (process.env.BREVO_API_KEY) return 'Brevo';
  return 'SMTP';
}

function expediteur() {
  return process.env.MAIL_FROM
    || (process.env.RESEND_API_KEY ? 'MYBOGO-STOCK <onboarding@resend.dev>' : process.env.SMTP_USER);
}

function decouperExpediteur(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].trim() || 'MYBOGO-STOCK', email: m[2].trim() } : { name: 'MYBOGO-STOCK', email: String(from || '').trim() };
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

async function envoyer({ to, subject, text, html }) {
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: expediteur(), to: [to], subject, text, ...(html ? { html } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status} : ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: decouperExpediteur(expediteur()),
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(html ? { htmlContent: html } : {}),
      }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 300)}`);
    return;
  }
  await getTransport().sendMail({ from: expediteur(), to, subject, text, ...(html ? { html } : {}) });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function ligne(label, valeur) {
  return `<tr><td style="padding:10px 14px;color:#6b7280;white-space:nowrap">${esc(label)}</td><td style="padding:10px 14px">${valeur}</td></tr>`;
}

// Ne lève jamais d'erreur : un e-mail qui échoue ne doit pas empêcher la création de la boutique.
async function envoyerAcces({ email, nomBoutique, slug, finLicence, essai, telephone }) {
  if (!configure()) {
    console.warn('[MAIL] Aucun fournisseur d\'e-mail configuré — e-mail non envoyé à', email);
    return false;
  }
  const appUrl = process.env.APP_URL || 'https://mybogo-cloud-production.up.railway.app';
  const lien = `${appUrl}/login`;
  const sujet = essai
    ? `Bienvenue ${nomBoutique} — vos accès MYBOGO-STOCK (essai gratuit 15 jours)`
    : `Votre abonnement MYBOGO-STOCK est activé — ${nomBoutique}`;
  const intro = essai
    ? `Votre boutique a bien été créée. Votre essai gratuit de 15 jours est actif jusqu'au ${fmtDate(finLicence)}.`
    : `Votre paiement est confirmé. Votre abonnement est valable jusqu'au ${fmtDate(finLicence)}.`;

  const texte = [
    `Bonjour,`, ``, intro, ``,
    `RÉCAPITULATIF DE VOTRE BOUTIQUE`,
    `  Boutique : ${nomBoutique}`,
    `  Code boutique : ${slug}`,
    `  Email de connexion : ${email}`,
    ...(telephone ? [`  Téléphone : ${telephone}`] : []),
    `  Mot de passe : celui que vous avez choisi lors de l'inscription`,
    `  ${essai ? 'Fin de l\'essai' : 'Valable jusqu\'au'} : ${fmtDate(finLicence)}`,
    ``,
    `POUR VOUS CONNECTER`,
    `  1. Ouvrez ${lien}`,
    `  2. Saisissez votre code boutique (${slug}), votre email et votre mot de passe.`,
    ``,
    `Conservez ce message : le code boutique est nécessaire à chaque connexion.`,
    `Besoin d'aide ? Répondez simplement à cet e-mail.`, ``, `L'équipe MYBOGO-STOCK`,
  ].join('\n');

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:540px;margin:0 auto;color:#1f2937">
  <h2 style="color:#1d4ed8;margin-bottom:4px">MYBOGO-STOCK</h2>
  <p>Bonjour,</p>
  <p>${esc(intro)}</p>
  <p style="margin:18px 0 6px;font-weight:700">Récapitulatif de votre boutique</p>
  <table style="width:100%;border-collapse:collapse;background:#eff6ff;border-radius:10px">
    ${ligne('Boutique', `<strong>${esc(nomBoutique)}</strong>`)}
    ${ligne('Code boutique', `<strong style="font-size:18px;letter-spacing:1px">${esc(slug)}</strong>`)}
    ${ligne('Email de connexion', esc(email))}
    ${telephone ? ligne('Téléphone', esc(telephone)) : ''}
    ${ligne('Mot de passe', "celui choisi à l'inscription")}
    ${ligne(essai ? "Fin de l'essai" : "Valable jusqu'au", esc(fmtDate(finLicence)))}
  </table>
  <p style="margin:18px 0 6px;font-weight:700">Pour vous connecter</p>
  <ol style="margin:0 0 18px;padding-left:20px;line-height:1.7">
    <li>Ouvrez le lien ci-dessous</li>
    <li>Saisissez votre code boutique <strong>${esc(slug)}</strong>, votre email et votre mot de passe</li>
  </ol>
  <p style="margin:0 0 22px"><a href="${esc(lien)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">Me connecter</a></p>
  <p style="font-size:13px;color:#6b7280">Conservez ce message : le code boutique est nécessaire à chaque connexion.<br>Besoin d'aide ? Répondez simplement à cet e-mail.</p>
</div>`;

  try {
    await envoyer({ to: email, subject: sujet, text: texte, html });
    return true;
  } catch (err) {
    console.error('[MAIL] Échec envoi à', email, ':', err.message);
    return false;
  }
}

// Alerte pour le revendeur à chaque nouvelle inscription (variable ADMIN_NOTIFY_EMAIL).
async function notifierInscription({ nomBoutique, slug, email, telephone, finEssai }) {
  const dest = process.env.ADMIN_NOTIFY_EMAIL;
  if (!dest || !configure()) return false;
  try {
    await envoyer({
      to: dest,
      subject: `Nouvelle inscription : ${nomBoutique}`,
      text: [
        'Une nouvelle boutique vient de démarrer son essai gratuit.', '',
        `Boutique : ${nomBoutique}`, `Code : ${slug}`, `Email : ${email}`,
        `Téléphone : ${telephone || 'non renseigné'}`, `Fin d'essai : ${fmtDate(finEssai)}`,
      ].join('\n'),
    });
    return true;
  } catch (err) {
    console.error('[MAIL] Échec de la notification d\'inscription :', err.message);
    return false;
  }
}

// Pour le bouton de test du panneau d'administration : renvoie la vraie raison d'un échec.
async function tester(destinataire) {
  if (!configure()) return { ok: false, message: "Aucun fournisseur d'e-mail configuré sur le serveur : variable BREVO_API_KEY (ou RESEND_API_KEY) absente. Vérifiez le nom de la variable et que Railway a bien redéployé." };
  try {
    await envoyer({
      to: destinataire,
      subject: 'Test MYBOGO-STOCK',
      text: "Si vous lisez ce message, l'envoi d'e-mails de MYBOGO-STOCK fonctionne.",
    });
    return { ok: true, message: `E-mail de test envoyé à ${destinataire} via ${fournisseur()} (expéditeur : ${expediteur()}).` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = { envoyerAcces, notifierInscription, configure, tester };
