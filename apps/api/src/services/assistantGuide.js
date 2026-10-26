// What the staff assistant knows about the Tripti Staff app, per role.
// Keep this in step with staff_flutter/lib/ui. Screen keys must match
// SCREENS below and the app's assistant navigation (lib/ui/common/assistant.dart).

export const SCREENS = {
  waiter: ['tables', 'tickets', 'pickups', 'chat'],
  cashier: ['tables', 'bills', 'receipts', 'tickets', 'pickups', 'chat'],
  kitchen: ['tickets', 'preorders', 'recipes', 'chat'],
  kitchen_manager: ['tickets', 'preorders', 'recipes', 'soldout', 'stock', 'chat'],
  stock: ['stock', 'requests', 'goodsin', 'giveout', 'waste', 'history'],
  auditor: ['receipts'],
  admin: [],
};

export const ROLE_NAMES = {
  waiter: 'Waiter',
  cashier: 'Cashier',
  kitchen: 'Kitchen',
  kitchen_manager: 'Kitchen manager',
  stock: 'Stock manager',
  auditor: 'Auditor',
  admin: 'Admin',
};

const COMMON = `
# Tripti Staff app (Android), shared by all staff
- Restaurant: Tripti Genusswelt, Villach (Austria). Indian food. Staff speak German and English.
- One sign-in screen for every role. The top bar shows the role, the name and (waiters, cashiers) the shift.
- Top bar buttons: speech-bubble = Team chat (waiters, kitchen and admin message each other; waiters also have an "Alert" button that pings kitchen/admin), circle arrow = refresh, three dots = More (language English/Deutsch, clock in/out for waiters and cashiers, sign out).
- Phone button in the top bar = Call: "One person" (tap a name) or "Group" (tick people and/or whole roles: Everyone, Waiters, Cashiers, Kitchen, Kitchen managers, Stock, Admin), then Call. Incoming calls show a full screen with Answer / Decline; during a call the green bar has speaker, mute and hang up. Calls ring only while the app is open.
- The assistant (this chat) is the sparkle button in the top bar. It can answer questions and open screens. It cannot change orders, payments or stock; staff press the buttons themselves. Staff can also tell it about problems and ideas: it notes them for the admin's improvement report (admin dashboard -> Staff feedback).

# Restaurant rules the server enforces (explain them when staff are stuck)
- Order loop: waiter sends dishes to the kitchen (a ticket/KOT) -> kitchen presses Start (Cooking) -> marks dishes or the whole ticket Ready -> waiter serves each dish (or "Serve all"/"Serve N ready") -> when every ticket is served the waiter can ask the cashier for the bill and ask to end the order -> cashier takes payment (cash or card, an RKSV receipt is signed and printed) and ends the order -> the table is freed.
- Bill request, ending an order and payment are refused while any ticket is still waiting, cooking or ready (not served). Serve every dish first.
- Only the cashier (or admin) takes payments and ends orders. Waiters ask the cashier.
- A waiter can cancel a ticket only before the kitchen presses Start. After that only the kitchen manager or admin can cancel it.
- A table can only be freed after the order was ended.
- Combined tables: "Combine" on the Tables screen. "One bill" = one shared order for all tables; "Separate bills" = each table keeps its own order, the kitchen sees them together. The X on a combination chip separates the tables again.
`;

const ROLE_GUIDES = {
  waiter: `
# Waiter screens (bottom bar: Tables, Tickets)
- Tables: grid of tables. Green dot = free, burgundy = open order, grey = ended. Tap a free table to start an order; tap an open table for its sheet (Add dishes, Request bill from cashier, Ask cashier to end order, Free table after it was ended).
- Ordering: search or pick a category, tap + to add, "Review order" to see the cart, add notes/spice, then "Send to kitchen".
- Tickets: your tickets with their status. Green badge = dishes ready to pick up. Tap a ready dish to mark it served, or "Serve N ready"/"Serve all". "Cancel" only while the ticket is still waiting.
- Combine tables: "Combine" above the grid, pick free tables, choose One bill or Separate bills, then order. With One bill you can choose which table each dish is for.
- Pickups (shopping bag icon in the top bar): today's online pickup orders.
- Clock in/out: three dots -> Clock in. Signing out also clocks you out.
`,
  cashier: `
# Cashier screens (bottom bar: Tables, Bills, Receipts, Tickets)
- Everything a waiter can do (Tables, ordering, Tickets), plus:
- Bills: boxes at the top (bill requests, end requests, open bills, still to pay). Bill requests (red edge) and End order requests (amber edge) from waiters, then Other open bills. "Take payment" opens the payment sheet: tick the items to pay (split bills are possible), choose Cash or Card, then confirm. The RKSV receipt is signed and can be printed (80 mm printer via Android print).
- "Take payment" stays disabled ("Serve all dishes first") while tickets are not served.
- End order: on an end request, or from the table sheet. Then the waiter (or cashier) frees the table.
- Receipts: today's (or all) payments with Cash/Card totals, receipt status (Signed, Outage, Failed). Print icon reprints; Retry re-signs a failed one.
`,
  kitchen: `
# Kitchen screens (bottom bar: Tickets, Pre-orders, Recipes)
- Tickets: boxes Waiting / Cooking / Ready (tap one to filter, tap again for all). Each card shows the table (or "Tables 1 + 2"), the ticket number, the age and who placed it. Red banner = tickets waiting over 5 minutes.
- "Start" moves a ticket to Cooking (and prints it if auto-print is on). Tick each dish when it is prepared, or press "Ready" for the whole ticket. The waiter then serves it.
- Speaker icon = sound on/off for new tickets. Printer icon on a card prints the KOT.
- Pre-orders: online pickup orders for today and the next days. "Start now" sends one to the kitchen early, "Seen" confirms you saw it, "Ready" when it is packed.
- Recipes: read-only recipes with ingredients and method.
`,
  kitchen_manager: `
# Kitchen manager screens (bottom bar: Tickets, Pre-orders, Recipes, Sold out, Stock)
- Tickets and Pre-orders: like the kitchen (see below), plus the manager may confirm and cancel pickup orders and cancel tickets that were already started.
- Tickets: boxes Waiting / Cooking / Ready (tap to filter). "Start" -> Cooking, tick dishes or "Ready". Red banner = waiting over 5 minutes.
- Recipes: boxes (dishes with a recipe, average food cost, dishes above 35%). Tap a dish to write its recipe: portions, ingredients linked to stock items with amounts, method, notes. Cost per portion and food-cost % are calculated from stock prices.
- Sold out: switch a dish off when it runs out; it disappears from the website and online orders. Switch it on again later.
- Stock: weekly stock requests to the stock manager. "New request": pick the week, "Plan from recipes" (uses last week's sales plus extra %) or "Copy week", add items, then "Send to stock manager". When goods arrive, open the request and confirm receipt, noting anything missing.
`,
  stock: `
# Stock manager screens (bottom bar: Stock, Requests, Goods in, Give out, Waste; History is the clock icon in the top bar)
- Stock: boxes Items / Low / Out / Expiring (tap Low or Out to show only those). Each item shows quantity, minimum, price and a level bar. Tap an item -> "Change quantity" (restock, correction, waste or initial count, with a reason) or "Edit item". "New item" adds one (name, unit, minimum, price, barcode, perishable).
- Scanning and photos on Stock: "Scan barcode" (also the scan icon in the search box) opens the camera; a known item opens with Change quantity / Edit item, an unknown barcode offers a new item and fills the name from the online product database. "Product photo" (or "Fill in from a photo" in the item form) reads the pack: name, category, unit, barcode, expiry, allergens; if the product is already in stock it offers to open it. Always check the filled fields before saving. Every item search box (Goods in, Give out, Waste) also has a scan icon.
- Requests: weekly lists from the kitchen manager. Open one, enter how much to give per line ("Give"), then "Give out". What is missing goes on the shopping list. "Shopping list for all open requests" prints one list. Progress shows e.g. "8/9 given".
- Goods in: book a delivery. Supplier, bill number, then one line per item with quantity, price per unit, optional lot barcode (scan icon) and expiry (required for perishable items). "Upload supplier bill (PDF)" (or "Photo of a paper bill") reads the whole bill: cartons and packs become kg / l / pieces, lines are matched to stock items (new items are created), and after a check "Book all" books everything at once (new items, lots, prices, history). A bill already booked is flagged. Booking by hand: fill the lines, then "Receive goods".
- Stock tab, "Supplier catalogue (AEKSHEA)": search the AEKSHEA product list (3,849 products, name or article number), tick the products you buy, optionally change the stock name and unit (pencil), then "Add to stock". Items start at quantity 0; the same name joins all pack sizes into one item. The article number is saved, so AEKSHEA bills match these items automatically.
- Give out: give stock to a staff member by staff ID; the oldest expiry goes out first (FIFO).
- Waste: record spoiled/damaged/expired goods with a reason; linked stock items go down. The waste log lists earlier entries.
- History: every stock movement (restock, correction, issue, waste) with who and when.
`,
  auditor: `
# Auditor screens
- Receipts (read-only): all payments with totals and receipt status; open or print a receipt. DEP7 export (download icon in the top bar) shares the RKSV journal of a cash register for the tax office.
`,
  admin: `
# Admin
- The admin screens are not in this app yet. Admins use the Tripti website admin dashboard (staff accounts, menu, reports) or the older Tripti Staff app.
`,
};

export function guideFor(role) {
  return `${COMMON}\n${ROLE_GUIDES[role] || ''}`;
}
