// What the staff assistant knows about the Tripti WEBSITE staff pages (waiter
// station, kitchen display, stock station, auditor and admin dashboards).
// The Android staff app has its own guide in assistantGuide.js.
// webHelp/*.txt is the text of the website's Help pages (/waiter-help,
// /stock-help, /admin-help), copied 2026-10-25; refresh it when they change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'webHelp');
const help = (name) => {
  try {
    return fs.readFileSync(path.join(dir, `${name}.txt`), 'utf8');
  } catch {
    return '';
  }
};

const COMMON = `
# Tripti website staff pages
- Restaurant: Tripti Genusswelt, Villach (Austria). Indian food. Staff speak German and English.
- Each role has its own page and sign-in: Waiter Station (/waiter-dashboard, waiters and cashiers), Kitchen Display (/kds-dashboard, kitchen and kitchen manager), Stock Station (/stock-dashboard), Auditor (/auditor-dashboard), Admin Dashboard (/admin). EN / DE in the header switches the language.
- Staff chat: the round speech-bubble button at the bottom right. The assistant (this chat) is the gold sparkle button at the bottom left. It answers questions; staff press the buttons themselves. Staff can also tell it about problems and ideas: it notes them for the admin's improvement report (Admin Dashboard -> Staff feedback).
- Green phone button at the bottom left (next to the assistant) = Call: "One person" or "Group" (pick people and/or whole roles such as Everyone, Waiters, Kitchen, Admin). The phone icon in the staff chat calls the open conversation. Incoming calls show Answer / Decline; the green call bar has mute and hang up. The browser asks once for the microphone.
- There is also the Android staff app "Tripti Staff" with the same functions; this guide is about the website.

# Restaurant rules the server enforces (these are current; if the help text below disagrees, these win)
- Order loop: waiter sends dishes to the kitchen (a ticket/KOT) -> kitchen presses Start (Preparing) -> marks the ticket Ready -> waiter collects and taps Mark Served -> when every ticket is served the waiter can ask the cashier for the bill and ask to end the order -> cashier takes payment (cash or card, an RKSV receipt is signed) and ends the order -> the table is freed.
- Bill request, ending an order and payment are refused while any ticket is still pending, preparing or ready (not served). Serve every dish first.
- Only the cashier (or admin) takes payments and ends orders. Waiters ask the cashier.
- A waiter can cancel a ticket only before the kitchen presses Start. After that only the kitchen manager or admin can cancel it.
- A table can only be freed after the order was ended.
`;

const PAGES = {
  waiter: `
# Waiter Station (website), as it looks now
- Header: Clock In / Clock Out, Pickups (online pickup orders), Quick Alert (urgent message to kitchen/admin), Help (full guide), Waiter Mode (back to New Order), Logout.
- Tabs: New Order (pick a table, Combine Tables, then dishes), Order (review the cart, notes, Send to Kitchen), Active (your open orders and tickets: Mark Served, cancel a pending ticket, request bill / end order from the cashier).
- Payments are taken by the cashier, not by waiters.

# Waiter Help page (reference; older parts about waiters taking payment no longer apply)
${help('waiter')}`,
  cashier: `
# Cashier on the Waiter Station (website), as it looks now
- Same page as waiters, header also has Receipts (today's payments and RKSV receipts, reprint), and a Live tab (all open tables, bill and end requests).
- Header: Clock In / Clock Out, Pickups, Receipts, Quick Alert, Help, Waiter Mode, Logout. Tabs: New Order, Order, Active, Live.
- The cashier takes payment (Pay dialog: choose items or settle the full order, cash or card, confirm), ends orders, and frees tables.

# Waiter Help page (reference for the shared controls)
${help('waiter')}`,
  kitchen: `
# Kitchen Display (website)
- Header: Pre-orders (online pickup orders for today and the next days), Settings (sound, auto-print), Refresh, Logout.
- Tabs: Tickets (new tickets: Start -> Preparing, then Ready; tickets waiting 5+ minutes are highlighted as delayed), Recipes (read-only).
- Quick message box: choose Waiter or Administrator, tick URGENT if needed, type and Send. Staff chat is the bubble at the bottom right.
`,
  kitchen_manager: `
# Kitchen Display for the kitchen manager (website)
- Header: Pre-orders, Sold out (switch dishes off/on for the website and online orders), Settings, Refresh, Logout.
- Tabs: Tickets (Start -> Preparing -> Ready; the manager may also cancel started tickets), Menu (edit dishes, prices, categories, photos and availability), Stock requests (weekly requests to the stock manager: plan from recipes or copy a week, send, then confirm receipt), Backup (download / restore kitchen data as CSV).
- Quick message box (Waiter / Administrator, URGENT, Send) and staff chat as for the kitchen.
`,
  stock: `
# Stock Station (website), as it looks now
- Header: Refresh, Help, Logout. Stock Alerts panel at the top (low / out / expiring items; View Inventory).
- Tabs: Inventory (search, Low stock only, Add Item, Supplier catalogue = search the AEKSHEA product list by name or article number, tick products, set stock name and unit, "Add to stock" (quantity 0, same name joins pack sizes, article number saved so AEKSHEA bills match), Adjust = restock/correct/waste with a reason, Edit, Delete, CSV export/import, print barcode), Kitchen requests (weekly requests from the kitchen manager; give out per line; Shopping list (all open)), Goods-In ("Upload bill": upload the supplier bill PDF or a photo, every line is read and converted to kg / l / pieces, matched to stock items or created new, check and "Book all"; or by hand: supplier, bill no., lines with quantity, unit cost, barcode, expiry, location; Receive Goods), Issue (give stock to a staff ID, oldest expiry first / FIFO), Lots (print lot and leftover labels), Locations (location tree), Barcodes (scan, assign, print labels), Backup, Waste (record wasted items with a reason; waste history), Stock History (every movement).

# Stock Help page (reference)
${help('stock')}`,
  auditor: `
# Auditor page (website, read-only)
- Billing list of receipts with Print per receipt, "Include closed orders" to see older ones, Refresh, and Download DEP7 (the RKSV journal export for the tax office). Log out in the header.
`,
  admin: `
# Admin Dashboard (website), as it looks now
- Buttons at the top: Open Waiter Dashboard, Open KDS Dashboard, Open Stock Dashboard (use the admin session).
- Tabs: Orders, KOTs, Billing, RKSV Diagnostics, Reservations, Tables, Menu, KOT Print Order, Feedback (customer feedback), Translations, Settings, Logs, Timesheets, Waiters, Stock Managers, Kitchen Managers, Cashiers, Auditors, Live overview, Staff app (download the Android app), Analysis, Staff feedback (problems and ideas staff told this assistant; "Create improvement report" makes one text document).

# Admin Help page (reference)
${help('admin')}`,
};

export function webGuideFor(role) {
  return `${COMMON}\n${PAGES[role] || ''}`;
}
