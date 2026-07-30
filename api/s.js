// ============================================================
// api/s.js — Portier Open Graph pour une VITRINE (boutique)
// URL : https://<projet>.vercel.app/s/<vendeuseUid>
// ------------------------------------------------------------
// WhatsApp reçoit un aperçu : couverture de la boutique + nom + slogan.
// Le vrai client est redirigé vers la vitrine Firebase
// (/catalogue?v=<uid>).
// ============================================================

const { fetchShop, ogHtml, isCrawler } = require('./_og');

const APP_BASE = 'https://mboacatalog.web.app';

function searchParamsOrQuery(req) {
  if (req.query) return req.query;
  try { const u = new URL(req.url, 'http://x'); const o = {}; u.searchParams.forEach((v,k)=>o[k]=v); return o; } catch(e){ return {}; }
}

module.exports = async (req, res) => {
  try {
    // Extraction robuste de l'uid, quels que soient les paramètres en plus
    // (?fresh=, ?x=, etc.). On lit d'abord ?v=, sinon le segment de chemin /s/<uid>.
    let uid = null;
    try {
      const u = new URL(req.url, `https://${req.headers.host || 'x'}`);
      uid = u.searchParams.get('v') || u.searchParams.get('uid');
      if (!uid) {
        const parts = u.pathname.split('/').filter(Boolean);
        uid = parts[parts.length - 1] || null;
      }
    } catch (e) {
      uid = (req.query && (req.query.v || req.query.uid)) || null;
    }

    if (!uid) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<p>Boutique introuvable.</p>');
    }

    const isBot = isCrawler(req.headers['user-agent']);
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
        isBot,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    }

    const nomBoutique = shop.nom_boutique || 'Boutique';
    // Image PREMIUM générée par @vercel/og (deux zones : vitrine + produit vedette).
    // On pointe vers notre propre route de génération d'image.
    // Domaine du portier en dur : plus fiable que req.headers.host, qui peut
    // renvoyer un host interne Vercel et casser l'URL vue par WhatsApp.
    const OG_HOST = 'mboa-og-63f8.vercel.app';
    const CLOUD = 'dxadpnvi7';
    // Chaîne finale : @vercel/og génère l'image (belle mais lourde, ~1 Mo),
    // PUIS Cloudinary la récupère (fetch) et la COMPRESSE en JPG léger.
    // WhatsApp reçoit alors une image légère qu'il accepte (comme les produits).
    const ogPng = `https://${OG_HOST}/vitrine/${encodeURIComponent(uid)}.png`;
    const image = `https://res.cloudinary.com/${CLOUD}/image/fetch/w_1200,h_630,c_fill,f_jpg,q_auto/${encodeURIComponent(ogPng)}`;

    // Mode diagnostic lisible sur mobile : ?show=1 affiche l'URL og:image et
    // charge l'image directement (pour voir si elle s'affiche).
    if (searchParamsOrQuery(req).show) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(
        '<html><head><meta charset=utf-8></head><body style="font-family:sans-serif;padding:16px;word-break:break-all;background:#111;color:#eee;">' +
        '<h3>Ce que WhatsApp va lire</h3>' +
        '<p><b>og:image =</b><br>' + image + '</p>' +
        '<p><b>L\'image se charge-t-elle ci-dessous ?</b></p>' +
        '<img src="' + image + '" style="width:100%;border:1px solid #444;">' +
        '<p style="color:#888;font-size:12px;">Si tu vois la belle image deux zones ici, l\'URL est bonne.</p>' +
        '</body></html>'
      );
    }
    const html = ogHtml({
      title: `Visitez la vitrine de ${nomBoutique}`,
      description: shop.bio || 'Découvrez tout notre stock et commandez directement sur WhatsApp.',
      image,
      canonicalUrl,
      redirectUrl,
      isBot,
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
      
