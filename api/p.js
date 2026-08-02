// ============================================================
// api/p.js — Portier Open Graph pour un PRODUIT
// URL : https://<projet>.vercel.app/p/<productId>
// ------------------------------------------------------------
// Rôle : quand WhatsApp lit ce lien, il reçoit un HTML avec l'aperçu du produit
// (photo + prix). Un vrai client, lui, est redirigé instantanément vers la
// vitrine Firebase du produit.
// ============================================================

const { fetchProduct, ogProductBanner, ogHtml, isCrawler, esc } = require('./_og');

// Base de l'app réelle (Firebase Hosting). Le client y est renvoyé.
const APP_BASE = 'https://mboacatalog.web.app';

module.exports = async (req, res) => {
  try {
    // L'id vient soit de /p/<id> (rewrite), soit de ?id=<id>.
    const id = (req.query && (req.query.id || req.query.productId))
      || (req.url.split('/').pop() || '').split('?')[0];

    if (!id) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<p>Produit introuvable.</p>');
    }

    const isBot = isCrawler(req.headers['user-agent']);
    const product = await fetchProduct(id);

    // Lien vers la vraie boutique. L'app ouvre une vitrine via
    // /catalogue?v=<uid_vendeuse> (routage existant). On y ajoute p=<id> pour
    // qu'elle puisse, plus tard, ouvrir directement la fiche du produit.
    const vendeuseUid = product && product.vendeuse_uid;
    const redirectUrl = vendeuseUid
      ? `${APP_BASE}/catalogue?v=${encodeURIComponent(vendeuseUid)}&p=${encodeURIComponent(id)}&src=partage`
      : APP_BASE;
    const canonicalUrl = `https://${req.headers.host}/p/${encodeURIComponent(id)}`;

    // Produit absent ou privé : on renvoie un aperçu générique plutôt qu'une
    // erreur (le client sera quand même redirigé).
    if (!product) {
      const html = ogHtml({
        title: 'MboaCatalog — Boutique',
        description: 'Découvrez cet article et commandez directement sur WhatsApp.',
        image: null,
        canonicalUrl,
        redirectUrl: APP_BASE,
        isBot,
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    }

    const image = ogProductBanner(product);

    // Mode diagnostic : ?show=1 affiche l'og:image et charge l'image.
    if (req.url && req.url.indexOf('show=1') !== -1) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(
        '<html><head><meta charset=utf-8></head><body style="font-family:sans-serif;padding:16px;word-break:break-all;background:#111;color:#eee;">' +
        '<h3>DEBUG produit</h3>' +
        '<p><b>Produit lu ?</b> ' + (product ? 'OUI — ' + (product.nom||'') : 'NON') + '</p>' +
        '<p><b>photo_url :</b> ' + (product && product.photo_url ? product.photo_url : '(absent)') + '</p>' +
        '<p><b>og:image =</b><br>' + (image || '(aucune)') + '</p>' +
        (image ? '<img src="' + image + '" style="width:100%;border:1px solid #444;">' : '') +
        '</body></html>'
      );
    }

    const prixTxt = product.prix ? `${Number(product.prix).toLocaleString('fr-FR')} FCFA` : '';
    const html = ogHtml({
      title: `${product.nom || 'Article'}${prixTxt ? ' — ' + prixTxt : ''}`,
      description: 'Disponible maintenant. Commandez directement sur WhatsApp.',
      image,
      canonicalUrl,
      redirectUrl,
      isBot,
    });

    // Cache CDN : l'aperçu d'un produit change rarement ; on autorise Vercel à
    // le mettre en cache 10 min (revalidation en arrière-plan).
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(html);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<p>Erreur temporaire.</p>');
  }
};
                   
