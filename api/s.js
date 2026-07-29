// ============================================================
// api/s.js — Portier Open Graph pour une VITRINE (boutique)
// URL : https://<projet>.vercel.app/s/<vendeuseUid>
// ------------------------------------------------------------
// WhatsApp reçoit un aperçu : couverture de la boutique + nom + slogan.
// Le vrai client est redirigé vers la vitrine Firebase
// (/catalogue?v=<uid>).
// ============================================================

const { fetchShop, fetchFeaturedProduct, ogShopBanner, ogProductBanner, ogHtml } = require('./_og');

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

    // MODE DEBUG : ?debug=1 affiche ce que le portier a lu et l'URL d'image,
    // sans rediriger. Sert à diagnostiquer quand l'aperçu ne s'affiche pas.
    if (req.query && req.query.debug) {
      const img = shop ? ogShopBanner(shop) : null;
      const vedette = await fetchFeaturedProduct(uid);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(
        '<html><head><meta charset=utf-8></head><body style="font-family:sans-serif;padding:16px;word-break:break-all;">' +
        '<h3>DEBUG vitrine</h3>' +
        '<p><b>Boutique lue ?</b> ' + (shop ? 'OUI' : 'NON (Firestore n\'a rien renvoyé)') + '</p>' +
        '<p><b>nom_boutique :</b> ' + (shop && shop.nom_boutique ? shop.nom_boutique : '(absent)') + '</p>' +
        '<p><b>photo_vitrine :</b> ' + (shop && shop.photo_vitrine ? shop.photo_vitrine : '(absent)') + '</p>' +
        '<p><b>URL image générée :</b><br>' + (img || '(aucune — pas de photo_vitrine)') + '</p>' +
        '<hr><p><b>PRODUIT VEDETTE trouvé ?</b> ' + (vedette ? 'OUI' : 'NON (aucun produit lu)') + '</p>' +
        '<p><b>nom vedette :</b> ' + (vedette && vedette.nom ? vedette.nom : '(absent)') + '</p>' +
        '<p><b>prix vedette :</b> ' + (vedette && vedette.prix ? vedette.prix : '(absent)') + '</p>' +
        '<p><b>ventes_count :</b> ' + (vedette && vedette.ventes_count != null ? vedette.ventes_count : '0 ou absent') + '</p>' +
        '<p><b>photo vedette :</b> ' + (vedette && vedette.photo_url ? vedette.photo_url : '(absent)') + '</p>' +
        (img ? '<p><b>Aperçu :</b></p><img src="' + img + '" style="width:100%;border:1px solid #ccc;">' : '') +
        '</body></html>'
      );
    }

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
    const image = ogShopBanner(shop);
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
        
