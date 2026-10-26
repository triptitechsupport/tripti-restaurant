import express from 'express';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';
import { signIn } from './assistant.js';

// Stock helpers for the staff app:
// - POST /recognize  photo of a product (mode "item") or of a supplier bill /
//   delivery note (mode "delivery") -> fields to fill in, matched against the
//   items already in the store. Claude reads the photo.
// - GET /barcode/:code  product name and pack size for a shop barcode
//   (EAN/UPC) from the free Open Food Facts database.
const router = express.Router();

const MODEL = process.env.STOCK_AI_MODEL || process.env.ASSISTANT_MODEL || 'claude-opus-5-5';
const ROLES = ['stock', 'kitchen_manager', 'admin'];
const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack', 'bottle', 'can'];
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'];

let client = null;
const anthropic = () => (client ??= new Anthropic());

const limit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many photos. Please wait a moment.' },
  validate: { trustProxy: false },
});

const stockRole = (req, res, next) => (ROLES.includes(req.staff?.role) ? next() : res.status(403).json({ message: 'Only stock staff, the kitchen manager and the admin can use this.' }));

const nul = (type) => ({ type: [type, 'null'] });
const DATE = { type: ['string', 'null'], description: 'YYYY-MM-DD, or null' };

// JSON answer shapes (structured outputs).
const ITEM_SCHEMA = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'brand', 'category', 'unit', 'quantityPerPack', 'barcode', 'expiry', 'perishable', 'storage', 'allergens', 'matchId', 'confidence', 'note'],
    properties: {
      name: { type: 'string', description: 'Short generic stock name a kitchen would use, without the brand (e.g. "Basmati rice", "Coconut milk", "Paneer").' },
      brand: nul('string'),
      category: { type: 'string', description: 'Stock category. Reuse one of the existing categories when it fits.' },
      unit: { type: 'string', enum: UNITS, description: 'Unit the store counts this item in. Loose goods by weight or volume: kg or l. Things counted per piece: pcs, can, bottle, pack, box.' },
      quantityPerPack: { type: ['number', 'null'], description: 'How many of `unit` one package holds (a 5 kg bag with unit kg -> 5; a 400 ml can with unit can -> 1). null if not visible.' },
      barcode: { type: ['string', 'null'], description: 'Digits of the barcode printed on the pack if clearly readable, else null.' },
      expiry: DATE,
      perishable: { type: 'boolean', description: 'True for fresh, chilled or frozen food that spoils quickly.' },
      storage: { type: ['string', 'null'], enum: ['dry', 'chilled', 'frozen', null] },
      allergens: { type: 'array', items: { type: 'string' }, description: 'EU allergens named on the label (e.g. milk, gluten, nuts). Empty if none seen.' },
      matchId: { type: ['string', 'null'], description: 'id of the existing stock item that is the same product, else null.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      note: { type: 'string', description: 'One short sentence for the stock person: what you saw and what to check.' },
    },
  },
};

const DELIVERY_SCHEMA = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['supplier', 'billNumber', 'billDate', 'lines', 'note'],
    properties: {
      supplier: nul('string'),
      billNumber: nul('string'),
      billDate: DATE,
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'matchId', 'quantity', 'unit', 'unitPrice', 'expiry'],
          properties: {
            description: { type: 'string', description: 'Line text as printed.' },
            matchId: { type: ['string', 'null'], description: 'id of the existing stock item this line is, else null.' },
            quantity: { type: ['number', 'null'], description: 'Quantity in the matched item\'s unit (convert: 2 x 5 kg bags into an item counted in kg -> 10).' },
            unit: { type: ['string', 'null'], enum: [...UNITS, null] },
            unitPrice: { type: ['number', 'null'], description: 'Net price in EUR per `unit`, if printed or computable from the line total.' },
            expiry: DATE,
          },
        },
      },
      note: { type: 'string', description: 'One short sentence: anything unreadable or to check.' },
    },
  },
};

async function storeItems(staff) {
  try {
    const list = await staff.pb.collection('stock_items').getFullList({ batch: 500, sort: 'name' });
    return list.map((r) => ({ id: r.id, name: r.name, unit: r.unit || '', category: r.category || '', barcode: r.barcode || '' }));
  } catch (err) {
    logger.warn(`[stock-ai] items: ${err.message}`);
    return [];
  }
}

router.post('/recognize', limit, signIn, stockRole, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ message: 'Photo recognition is not set up yet: the server has no ANTHROPIC_API_KEY.' });
  const mode = req.body?.mode === 'delivery' ? 'delivery' : 'item';
  const lang = req.body?.lang === 'de' ? 'de' : 'en';
  const mediaType = MEDIA.includes(req.body?.mediaType) ? req.body.mediaType : 'image/jpeg';
  const image = String(req.body?.image || '').replace(/^data:[^,]+,/, '');
  if (image.length < 100) return res.status(400).json({ message: 'No photo received.' });
  if (image.length > 7_000_000) return res.status(413).json({ message: 'The photo is too large.' });

  const items = await storeItems(req.staff);
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const listing = items.slice(0, 600).map((i) => `${i.id} | ${i.name} | ${i.unit} | ${i.category}${i.barcode ? ` | ${i.barcode}` : ''}`).join('\n') || '(none yet)';
  const language = lang === 'de' ? 'German' : 'English';
  const system = `You help the stock manager of Tripti Genusswelt, an Indian restaurant in Villach, Austria, book food and supplies. Products and bills are often German, Indian or English.
Read only what the photo shows. Never guess a barcode, expiry date, price or quantity you cannot read: use null. Write names, categories and notes in ${language}.
Today is ${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date())}.

Items already in the store (id | name | unit | category | barcode):
${listing}

Existing categories: ${categories.join(', ') || '(none yet)'}`;
  const ask = mode === 'item'
    ? 'This is a photo of one product (pack, bottle, crate or loose food). Describe it as a stock item. If it is the same product as an existing item, set matchId and reuse that item\'s name, unit and category.'
    : 'This is a photo of a supplier bill or delivery note. List every product line. Match lines to existing items where it is clearly the same product, and give quantity and unitPrice in that item\'s unit. Skip deposit (Pfand), delivery fee and total lines.';
  const { schema } = mode === 'item' ? ITEM_SCHEMA : DELIVERY_SCHEMA;
  try {
    const msg = await anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: mode === 'item' ? 4000 : 16000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } }, { type: 'text', text: ask }] }],
    }).finalMessage();
    let out = null;
    try {
      out = JSON.parse(msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    } catch { /* handled below */ }
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens' || !out || typeof out !== 'object') return res.status(422).json({ message: lang === 'de' ? 'Auf dem Foto wurde nichts erkannt. Bitte näher und schärfer fotografieren.' : 'Nothing could be read from the photo. Please take it closer and sharper.' });
    const known = new Set(items.map((i) => i.id));
    // Only keep matches to items that really exist.
    if (mode === 'item') {
      if (out.matchId && !known.has(out.matchId)) out.matchId = null;
      if (out.barcode && !/^\d{6,20}$/.test(String(out.barcode))) out.barcode = null;
      if (!UNITS.includes(out.unit)) out.unit = 'pcs';
    } else {
      out.lines = (out.lines || []).map((l) => ({ ...l, matchId: l.matchId && known.has(l.matchId) ? l.matchId : null }));
    }
    logger.info(`[stock-ai] ${mode} by ${req.staff.role} ${req.staff.name}${mode === 'delivery' ? `: ${out.lines.length} lines` : `: ${out.name}`}`);
    return res.json({ mode, result: out });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ message: 'Busy right now. Please try again in a moment.' });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ message: 'Photo recognition is not set up correctly (API key).' });
    logger.error(`[stock-ai] ${err.status || ''} ${err.message}`);
    return res.status(502).json({ message: lang === 'de' ? 'Das Foto konnte nicht gelesen werden. Bitte noch einmal versuchen.' : 'The photo could not be read. Please try again.' });
  }
});

// Shop barcodes (EAN-8/13, UPC-A): look the product up on Open Food Facts.
const offCache = new Map();
router.get('/barcode/:code', limit, signIn, stockRole, async (req, res) => {
  const code = String(req.params.code || '');
  if (!/^\d{8,14}$/.test(code)) return res.json({ found: false });
  if (offCache.has(code)) return res.json(offCache.get(code));
  let out = { found: false };
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_de,product_name_en,generic_name,brands,quantity,categories_tags`, {
      headers: { 'User-Agent': 'TriptiStaff/1.0 (restaurant stock app)' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = await r.json();
      const p = d.product;
      if (d.status === 1 && p) {
        const lang = req.query.lang === 'de' ? 'de' : 'en';
        const name = (lang === 'de' ? p.product_name_de : p.product_name_en) || p.product_name || p.generic_name || '';
        const cat = (p.categories_tags || []).map((c) => String(c).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')).pop() || '';
        out = { found: !!name, name, brand: String(p.brands || '').split(',')[0].trim(), quantity: p.quantity || '', category: cat };
      }
    }
  } catch (err) {
    logger.warn(`[stock-ai] barcode ${code}: ${err.message}`);
    return res.json({ found: false });
  }
  if (offCache.size > 500) offCache.clear();
  offCache.set(code, out);
  return res.json(out);
});

export default router;
