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

  // c_pad,b_white : le PRODUIT ENTIER est visible (rien coupé), sur fond blanc
  // épuré facon boutique haut de gamme. f_jpg,q_auto : conversion + compression
  // (robuste tous formats/poids, y compris PNG UHD IA).
  const base = 'w_1200,h_630,c_pad,b_white,f_jpg,q_auto';

  // Prix en OR ANTIQUE (#8B7500), discret, bas-droite dans le negative space.
  const prix = `co_rgb:8B7500,l_text:Arial_44:${cloudinaryText('Prix : ' + fmtPrice(product.prix))},g_south_east,x_50,y_50`;

  // Label « Négociable » en TAUPE (#A39C92), au-dessus du prix, seulement si
  // le produit est négociable. Rien si prix fixe (épure maximale).
  const layers = [base, prix];
  if (isNegotiable(product)) {
    // on remonte le prix pour laisser la place au label en dessous
    layers[1] = `co_rgb:8B7500,l_text:Arial_44:${cloudinaryText('Prix : ' + fmtPrice(product.prix))},g_south_east,x_50,y_95`;
    layers.push(`co_rgb:A39C92,l_text:Arial_30:${cloudinaryText('Négociable')},g_south_east,x_50,y_50`);
  }

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${layers.join('/')}/${pid}`;
}

// Bannière VITRINE (version simple) : photo de couverture + nom de la boutique.
// Champs boutique : nom_boutique, photo_vitrine, bio.
function ogShopBanner(shop) {
  if (!shop) return null;
  const pid = extractPublicId(shop.photo_vitrine);
  if (!pid) return null;
  // Transformation identique au produit (validée) : uniquement w/h/c_fill.
  // Pas de e_brightness (module non garanti sur ce compte). Juste le nom de
  // boutique en doré. Le slogan (souvent avec accents, fragile en URL) est
  // volontairement RETIRÉ de l'image pour l'instant.
  const base = 'w_1200,h_630,c_fill,f_jpg,q_auto';
  const nom = `l_text:Arial_60_bold:${cloudinaryText(shop.nom_boutique || 'Boutique')},co_rgb:F3E5AB,g_south_west,x_55,y_60`;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${base}/${nom}/${pid}`;
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

// Récupère LE produit vedette d'une boutique : l'épinglé en priorité, sinon le
// plus récent. Reproduit exactement le tri de l'app (public/views/catalogue.js).
// N'invente rien : si la boutique n'a aucun produit, renvoie null.
async function fetchFeaturedProduct(shopUid) {
  // runQuery : tous les produits de cette vendeuse (lecture publique autorisée).
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

  // rows = [{ document: {...} }, ...] ; on aplatit et on filtre les vides.
  const produits = (rows || [])
    .filter((r) => r.document)
    .map((r) => flattenFirestore(r.document))
    .filter((p) => p && p.actif !== false && p.photo_url);

  if (!produits.length) return null;

  // PRODUIT VEDETTE = le PLUS VENDU (ventes_count le plus élevé).
  // Repli si personne n'a encore de vente : le premier du catalogue (le plus
  // récent). L'épingle n'entre PAS dans ce choix (un vendeur épingle plusieurs
  // articles pour les garder visibles, ça ne désigne pas UNE vedette).
  const ventes = (p) => Number(p.ventes_count) || 0;
  const createdMs = (p) => {
    const t = p.created_at;
    if (t && typeof t === 'number') return t;
    if (t && t.seconds) return t.seconds * 1000;
    return 0;
  };
  produits.sort((a, b) => {
    const va = ventes(a), vb = ventes(b);
    if (va !== vb) return vb - va;               // 1. le plus vendu devant
    return createdMs(b) - createdMs(a);          // 2. sinon le plus récent
  });

  return produits[0];   // le vedette : plus vendu, sinon premier du catalogue
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
  extractPublicId, ogProductBanner, ogShopBanner, fmtPrice,
  fetchProduct, fetchShop, fetchFeaturedProduct, flattenFirestore,
  esc, ogHtml,
};
                            
