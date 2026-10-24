import express from 'express';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import PocketBase from 'pocketbase';
import adminPb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';
import { guideFor, ROLE_NAMES, SCREENS } from '../services/assistantGuide.js';

// Staff assistant: answers "how do I ..." questions and questions about live
// data. Every data tool reads with the staff member's own sign-in, so
// PocketBase rules decide what each role may see. The only thing it writes is
// staff feedback (problems and ideas), which the admin turns into an
// improvement report (/feedback routes below).
const router = express.Router();

const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.ASSISTANT_EFFORT || 'low';
const PB_URL = 'http://127.0.0.1:8090';
const COLLECTIONS = ['admin_users', 'waiter_users', 'kds_users', 'stock_users', 'auditor_users'];
const MAX_STEPS = 6;

let client = null;
const anthropic = () => (client ??= new Anthropic());

// One assistant question every 3 seconds per person is plenty for staff.
const limit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many questions. Please wait a moment.' },
  validate: { trustProxy: false },
});

function roleOf(collection, record) {
  const r = record.role || '';
  if (collection === 'admin_users') return 'admin';
  if (collection === 'waiter_users') return r === 'cashier' ? 'cashier' : 'waiter';
  if (collection === 'kds_users') return r === 'kitchen_manager' ? 'kitchen_manager' : 'kitchen';
  if (collection === 'stock_users') return 'stock';
  return 'auditor';
}

async function signIn(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Staff sign-in required.' });
  for (const name of COLLECTIONS) {
    const pb = new PocketBase(PB_URL);
    pb.autoCancellation(false);
    pb.authStore.save(token);
    try {
      const auth = await pb.collection(name).authRefresh();
      const rec = auth.record;
      req.staff = { pb, id: rec.id, role: roleOf(name, rec), name: rec.displayName || rec.username || rec.email || name };
      return next();
    } catch { /* try the next account type */ }
  }
  return res.status(401).json({ message: 'Staff session is invalid or expired.' });
}

// ---------- read-only tools ----------
const viennaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const ageMin = (iso) => Math.round((Date.now() - new Date(String(iso).replace(' ', 'T')).getTime()) / 60000);
const time = (iso) => (iso ? new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' }).format(new Date(String(iso).replace(' ', 'T'))) : '');
const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v || '[]') : (v || []); } catch { return []; } };
const itemsText = (items) => parse(items).map((i) => `${i.quantity || 1}x ${i.name}`).join(', ');

const TOOLS = [
  {
    name: 'open_tables',
    description: 'Open table orders right now: table, order number, total, payment status, whether the bill or the end of the order was requested, and how many tickets are not served yet. Use for questions about tables, bills, who still has to pay.',
    input_schema: { type: 'object', properties: { table: { type: 'string', description: 'Only this table number (optional).' } }, required: [], additionalProperties: false },
  },
  {
    name: 'kitchen_tickets',
    description: 'Kitchen tickets (KOTs) that are not served yet: table, status (waiting, cooking, ready), dishes, age in minutes, who placed it. Use for "what is waiting", "is table 4 ready", "how long".',
    input_schema: { type: 'object', properties: { table: { type: 'string', description: 'Only this table number (optional).' } }, required: [], additionalProperties: false },
  },
  {
    name: 'menu',
    description: 'Menu dishes with price, category, vegetarian flag and whether they are sold out. Optional search text.',
    input_schema: { type: 'object', properties: { search: { type: 'string' } }, required: [], additionalProperties: false },
  },
  {
    name: 'stock_items',
    description: 'Stock items with quantity, unit, minimum, price per unit and expiry. Optional search text, or only low/out items.',
    input_schema: { type: 'object', properties: { search: { type: 'string' }, low_only: { type: 'boolean' } }, required: [], additionalProperties: false },
  },
  {
    name: 'stock_requests',
    description: 'Weekly stock requests from the kitchen manager to the stock manager: week, status, items requested and given.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'pickup_orders',
    description: 'Online pickup orders for today and the next days: number, customer, pickup time, status, dishes.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'payments_today',
    description: "Today's payments (cashier, admin and auditor only): count, total, and each payment with table and amount.",
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'record_feedback',
    description: 'Save a problem, idea, missing feature or confusing part of the app for the admin\'s improvement report. Use it once you know what happened (screen, what they did, what went wrong or what they want, how often, how much it hurts their work). One entry per separate issue. Write summary and details in English, whatever language the staff member uses.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['problem', 'idea', 'missing', 'confusing'], description: 'problem = something goes wrong; idea = an improvement wish; missing = the app cannot do what they need; confusing = they could not find or understand how to do something.' },
        area: { type: 'string', description: 'Screen or part of the work, e.g. "Bills / payment", "Kitchen tickets", "Goods in".' },
        summary: { type: 'string', description: 'One clear sentence, max 200 characters.' },
        details: { type: 'string', description: 'What they did, what happened, what they expected, how often, any table/ticket/item names, and their own suggestion.' },
        impact: { type: 'string', enum: ['low', 'medium', 'high'], description: 'high = blocks work or money/guests affected; medium = slows them down; low = small annoyance.' },
      },
      required: ['kind', 'area', 'summary', 'details', 'impact'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_screen',
    description: 'Open a screen of the staff app for the user, when they want to go there or it is the place to do what they asked. Only screens listed for their role in the system prompt.',
    input_schema: { type: 'object', properties: { screen: { type: 'string' } }, required: ['screen'], additionalProperties: false },
  },
];

// Which data each role may ask about (PocketBase rules enforce the same).
const ROLE_TOOLS = {
  waiter: ['open_tables', 'kitchen_tickets', 'menu', 'pickup_orders'],
  cashier: ['open_tables', 'kitchen_tickets', 'menu', 'pickup_orders', 'payments_today'],
  kitchen: ['kitchen_tickets', 'menu', 'pickup_orders'],
  kitchen_manager: ['open_tables', 'kitchen_tickets', 'menu', 'pickup_orders', 'stock_items', 'stock_requests'],
  stock: ['stock_items', 'stock_requests', 'menu'],
  auditor: ['payments_today'],
  admin: ['open_tables', 'kitchen_tickets', 'menu', 'pickup_orders', 'stock_items', 'stock_requests', 'payments_today'],
};
const EVERY_ROLE = ['record_feedback'];
const toolsFor = (role) => TOOLS.filter((t) => t.name === 'open_screen' ? (SCREENS[role] || []).length > 0 : EVERY_ROLE.includes(t.name) || (ROLE_TOOLS[role] || []).includes(t.name));

async function runTool(staff, name, input, out) {
  if (name !== 'open_screen' && !EVERY_ROLE.includes(name) && !(ROLE_TOOLS[staff.role] || []).includes(name)) return { error: 'Not allowed for this role.' };
  const pb = staff.pb;
  const table = input.table ? String(input.table).trim() : '';
  switch (name) {
    case 'open_tables': {
      const orders = await pb.collection('waiter_orders').getFullList({ filter: 'orderStatus = "open" && freed != true && pickupOrder = ""', sort: 'tableNumber' });
      const kots = await pb.collection('kitchen_orders').getFullList({ filter: 'status != "completed" && status != "cancelled"', fields: 'parentOrder,status' });
      return orders.filter((o) => !table || o.tableNumber === table).map((o) => ({
        table: o.tableNumber,
        order: o.orderId,
        opened: time(o.created),
        openedBy: o.placedBy,
        total: o.totalAmount,
        payment: o.paymentStatus || 'unpaid',
        billRequested: !!o.billRequestedAt && (!o.billReadyAt || o.billReadyAt < o.billRequestedAt),
        endRequested: !!o.endRequestedAt && !o.endedAt,
        ended: !!o.endedAt,
        ticketsNotServed: kots.filter((k) => k.parentOrder === o.id).length,
      }));
    }
    case 'kitchen_tickets': {
      const kots = await pb.collection('kitchen_orders').getFullList({ filter: 'status != "completed" && status != "cancelled"', sort: 'created' });
      return kots.filter((k) => !table || k.tableNumber === table || String(k.tableLabel || '').includes(table)).map((k) => ({
        table: k.tableLabel || k.tableNumber,
        status: { pending: 'waiting', preparing: 'cooking', ready: 'ready' }[k.status] || k.status,
        dishes: itemsText(k.items),
        minutesAgo: ageMin(k.created),
        placedBy: k.placedBy,
        notes: k.notes || undefined,
      }));
    }
    case 'menu': {
      const q = String(input.search || '').toLowerCase();
      const items = await pb.collection('menu_items').getFullList({ sort: 'category,name', fields: 'name,nameDE,price,category,isVegetarian,availability' });
      return items.filter((m) => !q || `${m.name} ${m.nameDE} ${m.category}`.toLowerCase().includes(q)).slice(0, 80)
        .map((m) => ({ name: m.name, nameDE: m.nameDE || undefined, price: m.price, category: m.category, vegetarian: m.isVegetarian, soldOut: m.availability === false }));
    }
    case 'stock_items': {
      const q = String(input.search || '').toLowerCase();
      const items = await pb.collection('stock_items').getFullList({ sort: 'name' });
      return items
        .filter((s) => !q || `${s.name} ${s.category} ${s.barcode}`.toLowerCase().includes(q))
        .filter((s) => !input.low_only || s.quantity <= 0 || (s.minStock > 0 && s.quantity <= s.minStock))
        .slice(0, 100)
        .map((s) => ({ name: s.name, quantity: s.quantity, unit: s.unit, minimum: s.minStock || undefined, pricePerUnit: s.unitCost || undefined, expiry: s.expiry ? String(s.expiry).slice(0, 10) : undefined, category: s.category || undefined }));
    }
    case 'stock_requests': {
      const reqs = await pb.collection('stock_requests').getFullList({ sort: '-weekStart', filter: 'status != "draft"' });
      return reqs.slice(0, 10).map((r) => ({
        week: String(r.weekStart).slice(0, 10),
        neededBy: r.neededBy ? String(r.neededBy).slice(0, 10) : undefined,
        status: r.status,
        by: r.requestedByName,
        items: parse(r.items).map((l) => `${l.name}: ${l.qty} ${l.unit || ''} requested, ${l.fulfilledQty || 0} given`),
        received: !!r.receivedAt,
      }));
    }
    case 'pickup_orders': {
      const today = viennaToday();
      const orders = await pb.collection('orders').getFullList({ filter: pb.filter('orderType = "pickup" && pickupDate >= {:d}', { d: today }), sort: 'pickupDate,pickupTime' });
      return orders.slice(0, 40).map((o) => ({ number: o.orderNumber, customer: o.customerName, date: o.pickupDate, time: o.pickupTime, status: o.status, dishes: itemsText(o.items), total: o.totalPrice }));
    }
    case 'payments_today': {
      if (!['cashier', 'admin', 'auditor'].includes(staff.role)) return { error: 'Only the cashier, admin or auditor can see payments.' };
      const today = viennaToday();
      const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString().replace('T', ' ');
      const vDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date(String(iso).replace(' ', 'T')));
      const list = (await adminPb.collection('payment_settlements').getFullList({ filter: adminPb.filter('created >= {:s}', { s: since }), sort: 'created' }))
        .filter((p) => vDay(p.created) === today);
      const total = list.reduce((s, p) => s + Number(p.amount || 0), 0);
      return { count: list.length, total: Math.round(total * 100) / 100, payments: list.map((p) => ({ table: p.tableNumber, order: p.orderId, amount: p.amount, time: time(p.created) })) };
    }
    case 'record_feedback': {
      const clip = (v, n) => String(v || '').trim().slice(0, n);
      const summary = clip(input.summary, 300);
      if (!summary) return { error: 'A summary is needed.' };
      const kind = ['problem', 'idea', 'missing', 'confusing'].includes(input.kind) ? input.kind : 'problem';
      const impact = ['low', 'medium', 'high'].includes(input.impact) ? input.impact : 'medium';
      if ((out.saved || 0) >= 3) return { error: 'Already saved 3 entries in this answer.' };
      await adminPb.collection('staff_feedback').create({
        kind, impact, summary, status: 'new',
        area: clip(input.area, 120), details: clip(input.details, 4000),
        role: staff.role, staffName: clip(staff.name, 120), staffId: staff.id,
      });
      out.saved = (out.saved || 0) + 1;
      return { ok: true, saved: 'It is in the admin\'s improvement list now.' };
    }
    case 'open_screen': {
      const screen = String(input.screen || '');
      if (!(SCREENS[staff.role] || []).includes(screen)) return { error: `No screen "${screen}" for this role.` };
      out.screen = screen;
      return { ok: true };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

function systemPrompt(staff, lang) {
  const screens = (SCREENS[staff.role] || []).join(', ') || 'none';
  return `You are the help assistant inside the Tripti Staff app of Tripti Genusswelt, an Indian restaurant in Villach, Austria. You help staff who are busy and often on their feet: answer short and clear, in plain words, like a helpful colleague.

How to answer:
- Reply in the language the staff member writes or speaks (German or English). Their app language is ${lang === 'de' ? 'German' : 'English'}.
- Keep answers to 1-4 short sentences or a short list. Your answer may be read aloud, so avoid tables, markdown headings and long lists.
- For "how do I" questions, give the exact buttons to press, using the names below, and open the right screen with open_screen when that helps.
- For questions about live data (tables, tickets, stock, menu, pickups, payments), call the tools; never guess numbers. Say when something is empty.
- You can only read. You cannot send orders, take payments, change stock or press buttons. If asked to do something, explain the steps and open the screen.

Problems and ideas (collect them for the admin):
- When someone has a problem with the app or the work, first try to help: explain the rule or the steps.
- Then make it a useful report. If you don't know yet, ask at most two short questions at a time: which screen, what they did, what happened versus what they expected, how often, and how much it slows them down. Don't interrogate; if they are busy, save what you have.
- Save it with record_feedback, then tell them in one sentence that it is noted for the admin.
- Also save it, without extra questions, when they wish for something the app can't do (kind missing), when they share an idea (kind idea), or when they clearly struggled to find how to do something (kind confusing).
- Don't save plain questions you answered well, and never save passwords or guests' personal details.
- You only have tools for data this role may see. If asked about other data, say politely that this role can't see it and who can.
- If you don't know, say so and suggest asking the manager.

Signed-in staff member: ${staff.name}, role: ${ROLE_NAMES[staff.role] || staff.role}.
Screens open_screen can open for this role: ${screens}.

${guideFor(staff.role)}`;
}

router.post('/chat', limit, signIn, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ message: 'The assistant is not set up yet: the server has no ANTHROPIC_API_KEY.' });
  }
  const body = req.body || {};
  const lang = body.lang === 'de' ? 'de' : 'en';
  const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ message: 'Ask a question.' });

  const staff = req.staff;
  const out = {};
  const system = systemPrompt(staff, lang);
  try {
    let reply = '';
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: toolsFor(staff.role),
        messages,
      });
      if (response.stop_reason === 'refusal') {
        reply = lang === 'de' ? 'Dabei kann ich leider nicht helfen.' : "Sorry, I can't help with that.";
        break;
      }
      messages.push({ role: 'assistant', content: response.content });
      const uses = response.content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !uses.length) {
        reply = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        break;
      }
      const results = [];
      for (const u of uses) {
        let result;
        try {
          result = await runTool(staff, u.name, u.input || {}, out);
        } catch (err) {
          result = { error: err?.status === 403 || err?.status === 404 ? 'Not allowed for this role.' : 'Could not read this right now.' };
          logger.warn(`[assistant] tool ${u.name}: ${err.message}`);
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result).slice(0, 20000), ...(result?.error ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }
    if (!reply) reply = lang === 'de' ? 'Das hat zu lange gedauert. Bitte frag noch einmal kürzer.' : 'That took too long. Please ask again in fewer words.';
    logger.info(`[assistant] ${staff.role} ${staff.name}: ${messages.length} msgs${out.screen ? `, open ${out.screen}` : ''}`);
    return res.json({ reply, screen: out.screen || null });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ message: 'The assistant is busy. Please try again in a moment.' });
    if (err instanceof Anthropic.AuthenticationError) {
      logger.error('[assistant] invalid ANTHROPIC_API_KEY');
      return res.status(503).json({ message: 'The assistant is not set up correctly (API key).' });
    }
    if (err instanceof Anthropic.APIError) {
      logger.error(`[assistant] API ${err.status}: ${err.message}`);
      return res.status(502).json({ message: 'The assistant could not answer. Please try again.' });
    }
    logger.error(`[assistant] ${err.message}`);
    return res.status(500).json({ message: 'The assistant could not answer. Please try again.' });
  }
});

// ---------- staff feedback for the admin ----------
const adminOnly = (req, res, next) => (req.staff?.role === 'admin' ? next() : res.status(403).json({ message: 'Only the admin can see staff feedback.' }));
const feedbackLimit = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false } });
const KIND = { problem: 'Problem', idea: 'Idea', missing: 'Missing feature', confusing: 'Hard to find / confusing' };
const viennaDateTime = (iso) => new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(iso).replace(' ', 'T')));

async function loadFeedback({ days, includeDone }) {
  const d = Math.min(Math.max(Number(days) || 30, 1), 366);
  const since = new Date(Date.now() - d * 86400000).toISOString().replace('T', ' ');
  const filter = adminPb.filter(includeDone ? 'created >= {:s}' : 'created >= {:s} && status != "done" && status != "dismissed"', { s: since });
  const list = await adminPb.collection('staff_feedback').getFullList({ filter, sort: '-created' });
  return { days: d, list };
}

router.get('/feedback', feedbackLimit, signIn, adminOnly, async (req, res) => {
  try {
    const { list } = await loadFeedback({ days: req.query.days, includeDone: req.query.all === '1' });
    return res.json({ items: list.map((f) => ({ id: f.id, kind: f.kind, role: f.role, staffName: f.staffName, area: f.area, summary: f.summary, details: f.details, impact: f.impact, status: f.status || 'new', adminNote: f.adminNote, created: f.created })) });
  } catch (err) {
    logger.error(`[assistant] feedback list: ${err.message}`);
    return res.status(500).json({ message: 'Could not load staff feedback.' });
  }
});

router.patch('/feedback/:id', feedbackLimit, signIn, adminOnly, async (req, res) => {
  const data = {};
  if (['new', 'planned', 'done', 'dismissed'].includes(req.body?.status)) data.status = req.body.status;
  if (typeof req.body?.adminNote === 'string') data.adminNote = req.body.adminNote.slice(0, 1000);
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to change.' });
  try {
    await adminPb.collection('staff_feedback').update(String(req.params.id), data);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err?.status === 404 ? 404 : 500).json({ message: 'Could not update this entry.' });
  }
});

// Every entry, word for word, so nothing gets lost in the summary.
function feedbackListText(list) {
  return list.map((f, i) => [
    `${i + 1}. [${KIND[f.kind] || f.kind}, impact ${f.impact || '-'}, ${f.status || 'new'}] ${f.summary}`,
    `   From: ${f.staffName || '?'} (${ROLE_NAMES[f.role] || f.role || '?'}), ${viennaDateTime(f.created)}. Area: ${f.area || '-'}`,
    f.details ? `   Details: ${String(f.details).replace(/\s+/g, ' ')}` : '',
    f.adminNote ? `   Admin note: ${f.adminNote}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

const REPORT_PROMPT = `You write the improvement report for the admin of Tripti Genusswelt (Indian restaurant, Villach, Austria) from feedback the staff gave the assistant in the Tripti Staff app.
Write plain text (no markdown symbols like #, ** or tables), ready to print or paste into an email. Sections, with the titles in capitals:
SUMMARY: 3-5 sentences: how much feedback, from which roles, the main themes.
TOP PRIORITIES: the most important issues first (high impact and repeated ones). Merge entries about the same issue and say how many staff/times. For each: what the problem is, who it affects, and a concrete suggested fix in the app or in how the team works.
BY ROLE: for each role that gave feedback, 1-4 short points.
QUICK WINS: small changes that would help soon.
IDEAS FOR LATER: bigger wishes.
Only use what the feedback says; don't invent issues or numbers. Refer to entries by their number like (#3, #7).`;

router.post('/feedback/report', feedbackLimit, signIn, adminOnly, async (req, res) => {
  const lang = req.body?.lang === 'de' ? 'de' : 'en';
  try {
    const { days, list } = await loadFeedback({ days: req.body?.days, includeDone: !!req.body?.includeDone });
    const now = viennaDateTime(new Date().toISOString());
    const de = lang === 'de';
    const head = de
      ? `TRIPTI MITARBEITER-APP - VERBESSERUNGSBERICHT\nErstellt ${now} aus dem Mitarbeiter-Feedback der letzten ${days} Tage (${list.length} Einträge).\n`
      : `TRIPTI STAFF APP - IMPROVEMENT REPORT\nCreated ${now} from staff feedback of the last ${days} days (${list.length} entries).\n`;
    if (!list.length) return res.json({ text: `${head}\n${de ? 'Kein offenes Feedback in diesem Zeitraum.' : 'No open feedback in this period.'}\n`, entries: 0 });
    const listing = feedbackListText([...list].reverse());
    let analysis = '';
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const msg = await anthropic().beta.messages.stream({
          model: MODEL,
          max_tokens: 12000,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: REPORT_PROMPT,
          messages: [{ role: 'user', content: `Write the report in ${lang === 'de' ? 'German' : 'English'}.\n\nFeedback entries:\n\n${listing}` }],
        }).finalMessage();
        if (msg.stop_reason !== 'refusal') analysis = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      } catch (err) {
        logger.error(`[assistant] feedback report: ${err.message}`);
      }
    }
    const note = analysis ? '' : de ? '\n(Die Zusammenfassung konnte gerade nicht erstellt werden; alle Einträge stehen unten.)\n' : '\n(The written summary could not be created right now; all entries are listed below.)\n';
    const text = `${head}${note}\n${analysis ? `${analysis}\n\n` : ''}${de ? 'ALLE FEEDBACK-EINTRÄGE (Originaltext)' : 'ALL FEEDBACK ENTRIES'}\n\n${listing}\n`;
    return res.json({ text, entries: list.length, summarized: !!analysis });
  } catch (err) {
    logger.error(`[assistant] feedback report: ${err.message}`);
    return res.status(500).json({ message: 'Could not create the report.' });
  }
});

export default router;
