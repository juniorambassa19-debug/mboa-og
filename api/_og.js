// ============================================================
// api/_og.js — Helpers du portier Open Graph (aucun secret requis)
// ============================================================
// Ce module :
//  1) lit un produit / une boutique dans Firestore via l'API REST PUBLIQUE
//     (lecture seule, aucune clé privée — les règles Firestore autorisent déjà
//     la lecture publique des produits pour la vitrine) ;
//  2) construit l'URL Cloudinary de la bannière (repris de public/og-image.js,
//     version validée : w_1200,h_630,c_fill, sans g_auto qui n'est pas autorisé
//     sur ce compte).
// ============================================================

const CLOUD_NAME = 'dxadpnvi7';
const FIRESTORE_PROJECT = 'mboacatalog';

// ---- Cloudinary : construction de la bannière (validée en étape 1) ----

function extractPublicId(url) {
  try {
    if (!url || url.indexOf('/upload/') === -1) return null;
    let path = url.split('/upload/')[1];
    const vMatch = path.match(/v\d+\//);
    if (vMatch) path = path.slice(path.indexOf(vMatch[0]) + vMatch[0].length);
    const dot = path.lastIndexOf('.');
    if (dot > 0) path = path.slice(0, dot);
    return path;
  } catch (e) { return null; }
}

function cloudinaryText(txt) {
  return encodeURIComponent(String(txt || '').trim())
    .replace(/%2C/g, '%252C')
    .replace(/%2F/g, '%252F')
    .replace(/,/g, '%252C');
}

function fmtPrice(prix) {
  const n = Number(prix) || 0;
  return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + ' FCFA';
}

// Reproduit la logique de public/category.js : is_negotiable prioritaire,
// puis repli sur negotiable, puis price_tag === 'negociable'.
function isNegotiable(p) {
  if (!p) return false;
  if (typeof p.is_negotiable === 'boolean') return p.is_negotiable;
  if (typeof p.negotiable === 'boolean') return p.negotiable;
  return p.price_tag === 'negociable';
}

function ogProductBanner(product) {
  if (!product) return null;
  const pid = extractPublicId(product.photo_url);
  if (!pid) return null;

  const base = 'w_1200,h_630,c_pad,b_white,f_jpg,q_auto';

  const prix = `co_rgb:8B7500,l_text:Arial_44:${cloudinaryText('Prix : ' + fmtPrice(product.prix))},g_south_east,x_50,y_50`;

  const layers = [base, prix];
  if (isNegotiable(product)) {
    layers[1] = `co_rgb:8B7500,l_text:Arial_44:${cloudinaryText('Prix : ' + fmtPrice(product.prix))},g_south_east,x_50,y_95`;
    layers.push(`co_rgb:A39C92,l_text:Arial_30:${cloudinaryText('Négociable')},g_south_east,x_50,y_50`);
  }

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${layers.join('/')}/${pid}`;
}

function ogShopBanner(shop) {
  if (!shop) return null;
  const pid = extractPublicId(shop.photo_vitrine);
  if (!pid) return null;
  const base = 'w_1200,h_630,c_fill,f_jpg,q_auto';
  const nom = `l_text:Arial_60_bold:${cloudinaryText(shop.nom_boutique || 'Boutique')},co_rgb:F3E5AB,g_south_west,x_55,y_60`;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${base}/${nom}/${pid}`;
}

// ---- Firestore REST (lecture publique, sans SDK ni secret) ----

function flattenFirestore(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else out[k] = null;
  }
  return out;
}

async function fetchProduct(productId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/produits/${encodeURIComponent(productId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const doc = await res.json();
  return flattenFirestore(doc);
}

async function fetchShop(shopId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/vendeuses/${encodeURIComponent(shopId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return flattenFirestore(await res.json());
}

async function fetchFeaturedProduct(shopUid) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'produits' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'vendeuse_uid' },
          op: 'EQUAL',
          value: { stringValue: shopUid },
        },
      },
      limit: 50,
    },
  };
  let rows;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    rows = await res.json();
  } catch (e) { return null; }

  const produits = (rows || [])
    .filter((r) => r.document)
    .map((r) => flattenFirestore(r.document))
    .filter((p) => p && p.actif !== false && p.photo_url);

  if (!produits.length) return null;

  const ventes = (p) => Number(p.ventes_count) || 0;
  const createdMs = (p) => {
    const t = p.created_at;
    if (t && typeof t === 'number') return t;
    if (t && t.seconds) return t.seconds * 1000;
    return 0;
  };
  produits.sort((a, b) => {
    const va = ventes(a), vb = ventes(b);
    if (va !== vb) return vb - va;
    return createdMs(b) - createdMs(a);
  });

  return produits[0];
}

// ---- Échappement HTML (sécurité : jamais injecter du texte brut) ----
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Page HTML minimale : balises OG pour WhatsApp + redirection client ----
function ogHtml({ title, description, image, canonicalUrl, redirectUrl, isBot }) {
  // CLÉ : les robots (WhatsApp/Facebook) ne doivent PAS être redirigés, sinon
  // ils suivent la redirection jusqu'à l'app Firebase et lisent SES balises OG
  // (le logo) au lieu de notre belle image. On ne redirige donc QUE les humains.
  //
  // Redondance volontaire pour que la redirection parte à COUP SÛR sur tous les
  // navigateurs (meta refresh + script + repli lien cliquable). Le script tente
  // replace() puis href en secours si l'app met un instant à répondre.
  const redirect = isBot ? '' : `<meta http-equiv="refresh" content="0; url=${esc(redirectUrl)}">`;
  const redirectScript = isBot ? '' : `<script>
  (function(){
    var u = ${JSON.stringify(redirectUrl)};
    try { window.location.replace(u); } catch (e) {}
    setTimeout(function(){ try { window.location.href = u; } catch (e) {} }, 60);
  })();
  </script>`;
  const manualLink = isBot ? '' : `<p style="font-family:sans-serif;font-size:15px;">Redirection vers la boutique…<br><a href="${esc(redirectUrl)}" style="color:#00b85f;font-weight:bold;">Ouvrir la boutique</a></p>`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">` : ''}
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MboaCatalog">
<meta name="twitter:card" content="summary_large_image">
${redirect}
</head>
<body>
${redirectScript}
${manualLink || '<p>MboaCatalog</p>'}
</body>
</html>`;
}

// Détecte les ROBOTS d'aperçu de lien (WhatsApp, Facebook, Twitter, etc.).
//
// ⚠️ CORRECTION CLÉ : quand un HUMAIN tape le lien DANS WhatsApp, le lien
// s'ouvre dans le navigateur intégré de WhatsApp, dont l'UA contient aussi
// « whatsapp ». L'ancienne détection le prenait pour un robot et NE le
// redirigeait PAS -> écran blanc bloqué sur « Redirection… ».
//
// La nuance fiable : un VRAI navigateur (y compris le WebView WhatsApp) a un
// UA complet contenant « mozilla ». Le robot d'aperçu a un UA MINIMAL sans
// « mozilla » (ex. « WhatsApp/2.23 A », « facebookexternalhit/1.1 »). On ne
// traite donc en robot QUE les UA de bot SANS signature de navigateur.
function isCrawler(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  const isBotUA = /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|googlebot|bingbot|embedly|pinterest|vkshare|w3c_validator|og_scraper/.test(ua);
  if (!isBotUA) return false;
  // Signature d'un vrai navigateur -> c'est un HUMAIN (à rediriger), pas un robot.
  if (ua.includes('mozilla')) return false;
  return true;
}

module.exports = {
  CLOUD_NAME, FIRESTORE_PROJECT,
  extractPublicId, ogProductBanner, ogShopBanner, fmtPrice,
  fetchProduct, fetchShop, fetchFeaturedProduct, flattenFirestore,
  esc, ogHtml, isCrawler,
};
                                                                
