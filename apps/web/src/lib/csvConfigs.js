// CSV export/import configurations for each Admin-managed collection.
// Import these into the relevant Admin pages and pass to <CsvImportExport/>.
import { parseBool, parseNumber, parseList } from '@/lib/csvUtils.js';

/** Parse a date/datetime cell into an ISO string (or null when empty/invalid). */
function parseDateIso(v) {
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Validate a PocketBase relation id (15-char [a-z0-9]); drop invalid values. */
function validateRelationId(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (/^[a-z0-9]{15}$/.test(s)) return s;
  return null;
}

/* ----------------------------- Menu Items ----------------------------- */
export const menuItemsExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'nameEN', label: 'Name (EN)' },
  { key: 'nameDE', label: 'Name (DE)' },
  { key: 'descriptionEN', label: 'Description (EN)' },
  { key: 'descriptionDE', label: 'Description (DE)' },
  { key: 'price', label: 'Price (EUR)', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'category', label: 'Category' },
  { key: 'isVegetarian', label: 'Vegetarian', format: (v) => (v ? 'true' : 'false') },
  { key: 'availability', label: 'Available', format: (v) => (v ? 'true' : 'false') },
  { key: 'allergens', label: 'Allergens', format: (v) => (Array.isArray(v) ? v.join(';') : '') },
  { key: 'allergies', label: 'Allergies' },
];

export const menuItemsImportConfig = {
  idField: 'id',
  matchFields: ['nameEN'],
  fieldMap: {
    'id': 'id',
    'name (en)': 'nameEN', 'nameen': 'nameEN', 'name en': 'nameEN', 'english name': 'nameEN',
    'name (de)': 'nameDE', 'namede': 'nameDE', 'name de': 'nameDE', 'german name': 'nameDE',
    'description (en)': 'descriptionEN', 'descriptionen': 'descriptionEN', 'description en': 'descriptionEN',
    'description (de)': 'descriptionDE', 'descriptionde': 'descriptionDE', 'description de': 'descriptionDE',
    'price (eur)': 'price', 'price': 'price', 'price eur': 'price', 'price euro': 'price', 'price euros': 'price',
    'category': 'category',
    'vegetarian': 'isVegetarian', 'is vegetarian': 'isVegetarian', 'veg': 'isVegetarian',
    'available': 'availability', 'availability': 'availability', 'is available': 'availability',
    'allergens': 'allergens', 'allergen': 'allergens',
    'allergies': 'allergies', 'allergy': 'allergies',
  },
  required: ['nameEN', 'price', 'category'],
  immutableFields: ['id', 'created', 'updated', 'image'],
  transformers: {
    price: (v) => parseNumber(v),
    isVegetarian: (v) => parseBool(v),
    availability: (v) => parseBool(v),
    allergens: (v) => parseList(v),
  },
  defaults: { availability: true, isVegetarian: false },
  preValidate: (payload) => {
    if (payload.price != null && parseNumber(payload.price) <= 0) {
      return 'Price must be greater than 0';
    }
    return null;
  },
  createDefaults: (payload) => ({
    // Legacy `name` field is still required by the schema on create; mirror
    // the English name. Also backfill nameDE if the importer left it blank.
    name: payload.nameEN || payload.name || '',
    nameDE: payload.nameDE || payload.nameEN || '',
  }),
};

/* ------------------------------ Categories ----------------------------- */
export const categoriesExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name (EN)' },
  { key: 'name_de', label: 'Name (DE)' },
  { key: 'description', label: 'Description' },
  { key: 'display_order', label: 'Display Order' },
  { key: 'print_order', label: 'Print Order' },
];

export const categoriesImportConfig = {
  idField: 'id',
  matchFields: ['name'],
  fieldMap: {
    'id': 'id',
    'name (en)': 'name', 'name': 'name', 'name en': 'name', 'english name': 'name',
    'name (de)': 'name_de', 'name de': 'name_de', 'german name': 'name_de', 'name_de': 'name_de',
    'description': 'description',
    'display order': 'display_order', 'displayorder': 'display_order', 'order': 'display_order',
    'print order': 'print_order', 'printorder': 'print_order',
  },
  required: ['name', 'name_de'],
  immutableFields: ['id', 'created', 'updated'],
  transformers: {
    display_order: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
    print_order: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
  },
};

/* --------------------------- Table Reservations ------------------------ */
export const reservationsExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'reservationCode', label: 'Reservation Code' },
  { key: 'guestName', label: 'Guest Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'reservationDate', label: 'Date', format: (v) => (v ? String(v).slice(0, 10) : '') },
  { key: 'reservationTime', label: 'Time' },
  { key: 'partySize', label: 'Party Size' },
  { key: 'numberOfGuests', label: 'Number of Guests' },
  { key: 'status', label: 'Status' },
  { key: 'assignedTable', label: 'Assigned Table' },
  { key: 'adminNotes', label: 'Admin Notes' },
  { key: 'childrenChairsNeeded', label: 'Children Chairs', format: (v) => (v ? 'true' : 'false') },
  { key: 'numberOfChildrenChairs', label: 'Children Chairs Count' },
  { key: 'kidsUnder4', label: 'Kids Under 4', format: (v) => (v ? 'true' : 'false') },
  { key: 'numberOfKidsUnder4', label: 'Kids Under 4 Count' },
];

export const reservationsImportConfig = {
  idField: 'id',
  matchFields: ['reservationCode'],
  fieldMap: {
    'id': 'id',
    'reservation code': 'reservationCode', 'code': 'reservationCode', 'reservationcode': 'reservationCode',
    'guest name': 'guestName', 'name': 'guestName', 'guestname': 'guestName',
    'email': 'email',
    'phone': 'phone',
    'date': 'reservationDate', 'reservation date': 'reservationDate', 'reservationdate': 'reservationDate',
    'time': 'reservationTime', 'reservation time': 'reservationTime', 'reservationtime': 'reservationTime',
    'party size': 'partySize', 'partysize': 'partySize',
    'number of guests': 'numberOfGuests', 'guests': 'numberOfGuests', 'numberofguests': 'numberOfGuests',
    'status': 'status',
    'assigned table': 'assignedTable', 'assignedtable': 'assignedTable', 'table': 'assignedTable',
    'admin notes': 'adminNotes', 'notes': 'adminNotes', 'adminnotes': 'adminNotes',
    'children chairs': 'childrenChairsNeeded', 'childrenchairs': 'childrenChairsNeeded',
    'children chairs count': 'numberOfChildrenChairs',
    'kids under 4': 'kidsUnder4', 'kidsunder4': 'kidsUnder4',
    'kids under 4 count': 'numberOfKidsUnder4',
  },
  required: ['guestName', 'email', 'phone', 'reservationDate', 'reservationTime', 'partySize'],
  immutableFields: ['id', 'created', 'updated', 'reservationCode', 'assignedTables', 'endTime', 'timeSlotId', 'paymentStatus'],
  transformers: {
    partySize: (v) => parseNumber(v),
    numberOfGuests: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
    childrenChairsNeeded: (v) => parseBool(v),
    numberOfChildrenChairs: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
    kidsUnder4: (v) => parseBool(v),
    numberOfKidsUnder4: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
    status: (v) => {
      const s = String(v || '').trim();
      const allowed = ['Pending', 'Approved', 'Declined', 'Completed'];
      const found = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
      return found || s;
    },
  },
  preValidate: (payload) => {
    const date = String(payload.reservationDate || '').slice(0, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'Date must be YYYY-MM-DD';
    }
    if (payload.partySize && parseNumber(payload.partySize) < 1) {
      return 'Party size must be at least 1';
    }
    return null;
  },
  createDefaults: () => ({
    reservationCode: 'RES-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    paymentStatus: 'unpaid',
  }),
};

/* -------------------------- Table Configurations ----------------------- */
export const tablesExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Table Name' },
  { key: 'room', label: 'Room' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'isReserved', label: 'Reserved', format: (v) => (v ? 'true' : 'false') },
  { key: 'isActive', label: 'Active', format: (v) => (v === false ? 'false' : 'true') },
  { key: 'reservedInfo', label: 'Reserved Info' },
];

export const tablesImportConfig = {
  idField: 'id',
  matchFields: ['name'],
  fieldMap: {
    'id': 'id',
    'table name': 'name', 'name': 'name', 'table': 'name',
    'room': 'room',
    'capacity': 'capacity', 'seats': 'capacity',
    'reserved': 'isReserved',
    'active': 'isActive', 'is active': 'isActive',
    'reserved info': 'reservedInfo', 'reservedinfo': 'reservedInfo',
  },
  required: ['name', 'room'],
  immutableFields: ['id', 'created', 'updated', 'tableId'],
  transformers: {
    capacity: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
    isReserved: (v) => parseBool(v),
    isActive: (v) => {
      if (String(v).trim() === '') return true;
      return parseBool(v);
    },
    room: (v) => {
      const s = String(v || '').trim();
      if (!s) return s;
      // accept "Room 1"/"room1"/"1" -> "Room 1"
      const m = s.match(/room\s*([12])/i) || s.match(/^([12])$/);
      return m ? `Room ${m[1]}` : s;
    },
  },
  preValidate: (payload) => {
    const room = String(payload.room || '').trim();
    if (room && !/^Room [12]$/.test(room)) {
      return 'Room must be "Room 1" or "Room 2"';
    }
    return null;
  },
};

/* ------------------------------ Waiters -------------------------------- */
export const waitersExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'username', label: 'Username' },
  { key: 'displayName', label: 'Display Name' },
];

const WAITER_EMAIL_DOMAIN = 'triptiwaiter.local';
const waiterEmailFor = (username) =>
  `${String(username || '').trim().toLowerCase()}@${WAITER_EMAIL_DOMAIN}`;

export const waitersImportConfig = {
  idField: 'id',
  matchFields: ['username'],
  fieldMap: {
    'id': 'id',
    'username': 'username', 'user name': 'username',
    'display name': 'displayName', 'displayname': 'displayName', 'name': 'displayName',
    'password': 'password', 'pwd': 'password',
  },
  required: ['username'],
  immutableFields: ['id', 'created', 'updated', 'email', 'emailVisibility', 'verified', 'tokenKey'],
  transformers: {
    username: (v) => String(v || '').trim().toLowerCase(),
    displayName: (v) => String(v || '').trim(),
  },
  preValidate: (payload, rawRow) => {
    if (!payload.username) return 'Username is required';
    if (payload.password && String(payload.password).length < 8) {
      return 'Password must be at least 8 characters';
    }
    return null;
  },
};

// Waiter create/update needs special handling (email auto-gen + passwordConfirm),
// so the page passes a custom apply via onImportComplete + a custom fetch.
// We expose the email helper for the page's custom import adapter.
export { waiterEmailFor };

/* --------------------------- Kitchen Orders (KOTs) --------------------- */
// KOTs are operational records with a JSON items field — export only.
export const kotsExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'tableNumber', label: 'Table' },
  { key: 'room', label: 'Room' },
  { key: 'status', label: 'Status' },
  { key: 'totalPrice', label: 'Total Price', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'placedBy', label: 'Placed By' },
  { key: 'placedByRole', label: 'Placed By Role' },
  { key: 'notes', label: 'Notes' },
  { key: 'kotSuffix', label: 'KOT Suffix' },
  { key: 'printCount', label: 'Print Count' },
  { key: 'created', label: 'Created', format: (v) => (v ? new Date(v).toISOString() : '') },
];

/* ------------------------------ Billing -------------------------------- */
// waiter_orders — export only (operational billing data).
export const billingExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'orderType', label: 'Order Type' },
  { key: 'tableNumber', label: 'Table' },
  { key: 'orderStatus', label: 'Order Status' },
  { key: 'billingStatus', label: 'Billing Status' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'totalAmount', label: 'Total Amount', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'paidAmount', label: 'Paid Amount', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'outstandingAmount', label: 'Outstanding', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'placedBy', label: 'Waiter' },
  { key: 'created', label: 'Created', format: (v) => (v ? new Date(v).toISOString() : '') },
];

/* ------------------------------- Orders -------------------------------- */
// Customer orders — export only.
export const ordersExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'orderNumber', label: 'Order Number' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerEmail', label: 'Customer Email' },
  { key: 'customerPhone', label: 'Customer Phone' },
  { key: 'deliveryAddress', label: 'Delivery Address' },
  { key: 'totalPrice', label: 'Total Price', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'estimatedDeliveryTime', label: 'Estimated Delivery' },
  { key: 'created', label: 'Created', format: (v) => (v ? new Date(v).toISOString() : '') },
];

/* ----------------------------- Stock Items ----------------------------- */
// Stock & Waste management — full import/export of stock_items.
// Barcode is numeric-only; uniqueness is enforced in the page's customApply
// (checked against existing item + lot barcodes). Prep/expiry ordering and
// barcode format are validated in preValidate.
export const stockItemsExportColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'unit', label: 'Unit' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'minStock', label: 'Min Stock' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'perishable', label: 'Perishable', format: (v) => (v ? 'true' : 'false') },
  { key: 'unitCost', label: 'Unit Cost', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { key: 'preparedAt', label: 'Prepared At', format: (v) => (v ? new Date(v).toISOString() : '') },
  { key: 'expiry', label: 'Expiry', format: (v) => (v ? new Date(v).toISOString() : '') },
  { key: 'menuItem', label: 'Menu Item ID' },
  { key: 'notes', label: 'Notes' },
];

export const stockItemsImportConfig = {
  idField: 'id',
  matchFields: ['name', 'barcode'],
  fieldMap: {
    'id': 'id',
    'name': 'name', 'item name': 'name', 'item': 'name',
    'category': 'category',
    'unit': 'unit',
    'quantity': 'quantity', 'qty': 'quantity',
    'min stock': 'minStock', 'minstock': 'minStock', 'minimum stock': 'minStock',
    'barcode': 'barcode',
    'perishable': 'perishable', 'is perishable': 'perishable',
    'unit cost': 'unitCost', 'unitcost': 'unitCost', 'cost': 'unitCost',
    'prepared at': 'preparedAt', 'preparedat': 'preparedAt', 'prepared': 'preparedAt', 'preparation': 'preparedAt',
    'expiry': 'expiry', 'expiry date': 'expiry',
    'menu item id': 'menuItem', 'menu item': 'menuItem', 'menuitem': 'menuItem', 'linked menu item': 'menuItem',
    'notes': 'notes', 'note': 'notes',
  },
  required: ['name'],
  immutableFields: ['id', 'created', 'updated'],
  transformers: {
    quantity: (v) => (String(v).trim() === '' ? 0 : parseNumber(v)),
    minStock: (v) => (String(v).trim() === '' ? 0 : parseNumber(v)),
    unitCost: (v) => (String(v).trim() === '' ? null : parseNumber(v)),
    perishable: (v) => parseBool(v),
    preparedAt: (v) => parseDateIso(v),
    expiry: (v) => parseDateIso(v),
    menuItem: (v) => validateRelationId(v),
  },
  defaults: { quantity: 0, minStock: 0, perishable: false },
  preValidate: (payload) => {
    const bc = String(payload.barcode || '').trim();
    if (bc && !/^\d+$/.test(bc)) return 'Barcode must contain digits only (0–9)';
    if (bc && bc.length > 40) return 'Barcode is too long (max 40 digits)';
    const prep = payload.preparedAt;
    const exp = payload.expiry;
    if (prep && exp) {
      const p = new Date(prep).getTime();
      const e = new Date(exp).getTime();
      if (Number.isFinite(p) && Number.isFinite(e) && e < p) {
        return 'Expiry must be on or after the preparation date/time';
      }
    }
    return null;
  },
};
