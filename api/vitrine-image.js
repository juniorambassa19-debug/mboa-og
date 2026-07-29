// ============================================================
// api/vitrine-image.js — IMAGE premium de la vitrine via @vercel/og (ESM)
// URL : /vitrine-image?v=<uid>
// ------------------------------------------------------------
// Autonome (ESM) car @vercel/og tourne en Edge runtime, incompatible avec le
// CommonJS de _og.js. On réimplémente ici les lectures Firestore nécessaires.
//
// Deux zones nettes empilées :
//   HAUT : couverture boutique + nom
//   BAS  : produit vedette (photo + nom + prix) + badge « ARTICLE VEDETTE »
// Aucune info inventée : tout vient de la base ; champ absent = élément masqué.
// ============================================================

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const FIRESTORE_PROJECT = 'mboacatalog';

// ---- Lecture Firestore REST (publique, sans secret) ----
function flatten(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else out[k] = null;
  }
  return out;
}

async function fetchShop(uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/vendeuses/${encodeURIComponent(uid)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return flatten(await res.json());
}

async function fetchFeatured(uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'produits' }],
      where: { fieldFilter: { field: { fieldPath: 'vendeuse_uid' }, op: 'EQUAL', value: { stringValue: uid } } },
      limit: 50,
    },
  };
  let rows;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    rows = await res.json();
  } catch (e) { return null; }
  const produits = (rows || []).filter((r) => r.document).map((r) => flatten(r.document)).filter((p) => p && p.actif !== false && p.photo_url);
  if (!produits.length) return null;
  const ventes = (p) => Number(p.ventes_count) || 0;
  const created = (p) => (p.created_at && p.created_at.seconds ? p.created_at.seconds * 1000 : 0);
  produits.sort((a, b) => (ventes(b) - ventes(a)) || (created(b) - created(a)));
  return produits[0];
}

function fmtPrice(prix) {
  const n = Number(prix) || 0;
  return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ') + ' FCFA';
}

// Cloudinary : version optimisée (JPG compressé) pour un chargement rapide.
function optimized(url, w, h) {
  if (!url || url.indexOf('/upload/') === -1) return url;
  return url.replace('/upload/', `/upload/w_${w},h_${h},c_fill,f_jpg,q_auto/`);
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('v');
    if (!uid) return new Response('Boutique manquante', { status: 400 });

    const shop = await fetchShop(uid);
    const vedette = await fetchFeatured(uid);

    const nomBoutique = (shop && shop.nom_boutique) || 'Boutique';
    const bio = (shop && shop.bio) || '';
    const cover = shop && shop.photo_vitrine ? optimized(shop.photo_vitrine, 1200, 340) : null;

    const prodPhoto = vedette && vedette.photo_url ? optimized(vedette.photo_url, 300, 300) : null;
    const prodNom = vedette ? vedette.nom : null;
    const prodPrix = vedette && vedette.prix != null ? fmtPrice(vedette.prix) : null;

    const OR = '#C8A04E';
    const NOIR = '#0a0a0c';
    const h = (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children.filter(Boolean) } });

    // ZONE HAUTE
    const zoneHaut = h('div', { style: { display: 'flex', position: 'relative', width: '100%', height: '340px', overflow: 'hidden', alignItems: 'flex-end' } },
      cover ? h('img', { src: cover, width: 1200, height: 340, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
      h('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '170px', display: 'flex', background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0))' } }),
      h('div', { style: { display: 'flex', flexDirection: 'column', padding: '0 0 28px 50px', position: 'relative' } },
        h('div', { style: { fontSize: 54, fontWeight: 700, color: OR } }, nomBoutique),
        bio ? h('div', { style: { fontSize: 24, color: '#d8d2c4', marginTop: 6 } }, bio) : null
      )
    );

    // ZONE BASSE
    const zoneBas = h('div', { style: { display: 'flex', width: '100%', height: '290px', background: NOIR, borderTop: `3px solid ${OR}`, alignItems: 'center', padding: '0 50px' } },
      prodPhoto ? h('div', { style: { display: 'flex', width: '220px', height: '220px', borderRadius: '18px', overflow: 'hidden', background: '#fff', border: `2px solid ${OR}` } },
        h('img', { src: prodPhoto, width: 220, height: 220, style: { objectFit: 'cover' } })
      ) : null,
      h('div', { style: { display: 'flex', flexDirection: 'column', marginLeft: prodPhoto ? '40px' : '0' } },
        h('div', { style: { display: 'flex', background: OR, color: NOIR, fontSize: 20, fontWeight: 700, padding: '6px 16px', borderRadius: '8px' } }, 'ARTICLE VEDETTE'),
        prodNom ? h('div', { style: { fontSize: 42, fontWeight: 700, color: '#fff', marginTop: 16 } }, prodNom) : null,
        prodPrix ? h('div', { style: { fontSize: 46, fontWeight: 700, color: OR, marginTop: 6 } }, prodPrix) : null
      )
    );

    const tree = h('div', { style: { display: 'flex', flexDirection: 'column', width: '1200px', height: '630px', background: NOIR } }, zoneHaut, zoneBas);

    return new ImageResponse(tree, { width: 1200, height: 630 });
  } catch (e) {
    return new Response('Erreur : ' + e.message, { status: 500 });
  }
        }
      
