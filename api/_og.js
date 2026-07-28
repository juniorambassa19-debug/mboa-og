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

function ogProductBanner(product) {
  if (!product) return null;
  const pid = extractPublicId(product.photo_url);
  if (!pid) return null;
  const base = 'w_1200,h_630,c_fill';
  const prix = `l_text:Arial_58_bold:${cloudinaryText(fmtPrice(product.prix))},co_rgb:FFFFFF,g_south_west,x_50,y_50`;
  const nom = `l_text:Arial_34_bold:${cloudinaryText(product.nom)},co_rgb:E5C158,g_south_west,x_50,y_125`;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${base}/${prix}/${nom}/${pid}`;
}

// ---- Firestore REST (lecture publique, sans SDK ni secret) ----

// Convertit un document Firestore REST ({ fields: { nom: { stringValue }... } })
// en objet JS plat.
function flattenFirestore(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else out[k] = null; // types complexes ignorés (pas nécessaires pour l'aperçu)
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

// ---- Échappement HTML (sécurité : jamais injecter du texte brut) ----
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Page HTML minimale : balises OG pour WhatsApp + redirection client ----
function ogHtml({ title, description, image, canonicalUrl, redirectUrl }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">` : ''}
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(redirectUrl)}">
</head>
<body>
<script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
<p>Redirection vers la boutique…</p>
</body>
</html>`;
}

module.exports = {
  CLOUD_NAME, FIRESTORE_PROJECT,
  extractPublicId, ogProductBanner, fmtPrice,
  fetchProduct, fetchShop, flattenFirestore,
  esc, ogHtml,
};
    
