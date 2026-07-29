// ============================================================
// api/s.js — Portier Open Graph pour une VITRINE (boutique)
// URL : https://<projet>.vercel.app/s/<vendeuseUid>
// ------------------------------------------------------------
// WhatsApp reçoit un aperçu : couverture de la boutique + nom + slogan.
// Le vrai client est redirigé vers la vitrine Firebase
// (/catalogue?v=<uid>).
// ============================================================

const { fetchShop, ogHtml } = require('./_og');

const APP_BASE = 'https://mboacatalog.web.app';

module.exports = async (req, res) => {
  try {
    const uid = (req.query && (req.query.v || req.query.uid))
      || (req.url.split('/').pop() || '').split('?')[0];

    if (!uid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<p>Boutique introuvable.</p>');
    }

    const shop = await fetchShop(uid);

    const redirectUrl = `${APP_BASE}/catalogue?v=${encodeURIComponent(uid)}&src=partage`;
    const canonicalUrl = `https://${req.headers.host}/s/${encodeURIComponent(uid)}`;


    if (!shop) {
      const html = ogHtml({
        title: 'MboaCatalog — Boutique',
        description: 'Découvrez cette boutique et commandez sur WhatsApp.',
        image: null,
        canonicalUrl,
        redirectUrl,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    }

    const nomBoutique = shop.nom_boutique || 'Boutique';
    // Image PREMIUM générée par @vercel/og (deux zones : vitrine + produit vedette).
    // On pointe vers notre propre route de génération d'image.
    const image = `https://${req.headers.host}/api/vitrine-image?v=${encodeURIComponent(uid)}`;
    const html = ogHtml({
      title: `Visitez la vitrine de ${nomBoutique}`,
      description: shop.bio || 'Découvrez tout notre stock et commandez directement sur WhatsApp.',
      image,
      canonicalUrl,
      redirectUrl,
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(html);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<p>Erreur temporaire.</p>');
  }
};
