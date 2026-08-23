# Tripti Genusswelt — Complete Application Documentation

> **Tripti Genusswelt – The Indian Restaurant** is a full-stack restaurant
> management and ordering platform: a bilingual (English/German) customer-facing
> website combined with a complete staff operations suite (Admin, Kitchen
> Display System, and Waiter stations) built on the Horizons stack
> (React + Vite + Tailwind, Express, and PocketBase).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Structure](#2-file-structure)
3. [Feature Documentation](#3-feature-documentation)
4. [Local Setup Instructions](#4-local-setup-instructions)
5. [Database Schema](#5-database-schema)
6. [API Routes](#6-api-routes)
7. [Component Documentation](#7-component-documentation)
8. [Configuration Guide](#8-configuration-guide)
9. [Troubleshooting](#9-troubleshooting)
10. [Deployment Guide](#10-deployment-guide)

---

## 1. Project Overview

### Project name and purpose
**Tripti Genusswelt** is an authentic Indian restaurant located at Italiener
Straße 17, Villach 9500, Austria (phone `+43 664 1219289`). The application
serves two audiences:

- **Guests** — browse the menu (interactive, PDF, or image-based), place online
  orders, and reserve tables, all in English or German.
- **Staff** — manage menu items, reservations, tables, and live kitchen orders
  through dedicated Admin, KDS (Kitchen Display System), and Waiter dashboards,
  with real-time chat and voice calling between roles.

### Features overview
- Bilingual (EN/DE) UI with database-backed translations.
- Menu display modes: interactive digital menu, downloadable PDF menu (per
  language), and menu images (per language) — admin toggleable.
- Online ordering with cart and checkout (cash on delivery / card).
- Table reservations with date/time slots, party size, and kids-under-4 handling.
- Admin dashboard: booking management, reservation approvals, table status grid,
  menu management, settings (branding logo, email templates, notifications).
- KDS (Kitchen Display System) with live orders, timers, and sound alerts.
- Waiter dashboard: place orders, view active orders, free tables, print KOT.
- KOT (Kitchen Order Ticket) printing optimized for 80mm thermal printers.
- Spice levels per dish (None/Mild/Medium/Hot/Very Hot).
- Auto-generated unique table IDs (T001, T002, …).
- Real-time staff chat + WebRTC voice calls between Admin / Waiter / KDS.
- Email notifications (PocketBase mailer) and WhatsApp alerts (CallMeBot).
- PWA installability for the main site and a dedicated Waiter app.

### Technology stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 7, React Router 7, Tailwind CSS 3, shadcn/ui, Framer Motion, lucide-react |
| Forms/validation | react-hook-form, zod |
| Backend API | Node.js 22, Express 5 (ESM) |
| Database / Auth / Storage / Mail | PocketBase (SQLite) |
| Payments | Stripe (server-side) |
| Realtime | PocketBase subscriptions + WebRTC (voice) |
| Tooling | ESLint 9, PostCSS, Autoprefixer |

### Architecture overview
A monorepo (npm workspaces) with three apps that run concurrently:

```
Browser (React SPA :3000)
   │   ├── PocketBase client  → /hcgi/platform  → PocketBase :8090 (data/auth/files/mail)
   │   └── API client         → /hcgi/api       → Express :3001 (Stripe, reservation emails)
```

- The React app talks **directly** to PocketBase for CRUD, auth, realtime, and
  file access. Collection access rules are the authorization layer.
- The Express API is only used for third-party/secret work (Stripe checkout,
  reservation confirmation orchestration).
- Email is sent by PocketBase hooks (`pb_hooks/*.pb.js`) via the built-in mailer.

### Key components
- `apps/web/src/App.jsx` — routing + global providers (Auth, Language, Cart, Subscriptions).
- Context providers: `AdminAuthContext`, `LanguageContext`, `CartProvider`, `SubscriptionAuthContext`.
- Staff clients (`staffClients.js`) — separate PocketBase auth stores so KDS and
  Waiter can be logged in simultaneously alongside Admin.
- Dashboards: `AdminBookingDashboard`, `KdsDashboard`, `WaiterDashboard`.

---

## 2. File Structure

```
public_html/
├── apps/
│   ├── web/         # React + Vite frontend (port 3000)
│   ├── api/         # Express API server (port 3001)
│   └── pocketbase/  # PocketBase binary, migrations, hooks (port 8090)
├── vault/           # wiki, skills, runtime journals
├── package.json     # monorepo root (npm workspaces + concurrently scripts)
└── DOCUMENTATION.md # this file
```

### `apps/web` (frontend)
```
apps/web/
├── src/
│   ├── App.jsx                # Routes + provider tree
│   ├── index.css              # Tailwind layers + theme tokens (burgundy/gold/cream)
│   ├── pages/                 # Route-level pages (see below)
│   ├── components/            # Reusable UI + feature components
│   │   └── ui/                # shadcn/ui primitives (do not edit)
│   ├── contexts/              # React context providers
│   ├── hooks/                 # Custom hooks (useCart, useStaffCall, etc.)
│   ├── lib/                   # Clients & utilities (pocketbaseClient, staffClients, kotPrint, translations)
│   ├── utils/                 # gmailComposer and helpers
│   ├── api/                   # EcommerceApi + subscription API wrappers
│   └── config/               # Route constants
└── public/                    # manifests, service worker, static assets
```

**Important frontend files**
| File | Purpose |
|------|---------|
| `src/App.jsx` | Declares all routes and wraps app in providers. |
| `src/lib/pocketbaseClient.js` | Default PocketBase client at `/hcgi/platform` (admin/guest/public). **Read-only.** |
| `src/lib/staffClients.js` | `kdsPb` and `waiterPb` clients with independent auth stores. |
| `src/lib/apiServerClient.js` | Express API client at `/hcgi/api`. **Read-only.** |
| `src/lib/kotPrint.js` | Builds and opens KOT (80mm thermal) tickets; `SPICE_LEVELS`. |
| `src/lib/translations.js` | Default EN/DE translation map + category name helper. |
| `src/utils/gmailComposer.js` | Generates Gmail compose URLs + email templates. |
| `src/contexts/AdminAuthContext.jsx` | Admin/guest auth + OTP methods. |
| `src/contexts/LanguageContext.jsx` | Language state, ordering-enabled flag, DB translations. |
| `src/hooks/useCart.jsx` | localStorage-backed cart. |
| `src/hooks/useStaffCall.js` | WebRTC voice-call management + signaling. |
| `public/manifest.webmanifest` | Main PWA manifest. |
| `public/waiter-manifest.webmanifest` | Waiter PWA manifest. |
| `public/service-worker.js` | Offline caching. |

**Pages** (`src/pages/`): `HomePage`, `MenuPage`, `TableReservationPage`,
`ReservationConfirmationPage`, `ContactPage`, `CartPage`, `CheckoutPage`,
`OrderConfirmationPage`, `PrivacyPolicyPage`, `TermsOfServicePage`,
`AdminLoginPage`, `AdminBookingDashboard`, `AdminMenuPage`,
`AdminReservationApprovalPage`, `AdminPlaceOrderPage`, `GuestDashboard`,
`KdsLoginPage`, `KdsDashboard`, `WaiterLoginPage`, `WaiterDashboard`,
`SubscriptionsPage`, `KotPrintPage`.

### `apps/api` (backend)
```
apps/api/src/
├── main.js                     # Express entry (CORS, middleware, mounts routes)
├── routes/
│   ├── reservations.js         # Reservation confirm / email endpoints
│   ├── orders.js               # Order create/get endpoints
│   ├── stripe.js               # Stripe checkout + session lookup
│   └── subscriptions.js        # Subscription management
├── middleware/                 # error handler, pocketbase-auth
└── utils/                      # logger, pocketbaseClient (server-side escape hatch)
```

### `apps/pocketbase` (database)
```
apps/pocketbase/
├── pb_migrations/   # Schema + seed migrations (applied on reload)
└── pb_hooks/        # Server-side JS event hooks (email + WhatsApp)
```

**Key migrations**
| Migration | Purpose |
|-----------|---------|
| `..._001_create_user_admin_at_restaurant_com.js` | Creates `admin_users` + admin account. |
| `..._create_kds_waiter_and_kitchen_orders.js` | `kds_users`, `waiter_users`, `kitchen_orders`. |
| `..._fix_kds_waiter_demo_credentials.js` | Ensures demo KDS/Waiter logins. |
| `..._add_table_ids_spice_kot.js` | `tableId`, `isReserved` on tables; `spice_level` on order items. |
| `..._create_staff_messages.js` | `staff_messages` chat collection. |
| `..._create_staff_calls.js` | `staff_calls` WebRTC signaling collection. |
| `..._add_menu_images_to_pdf_menu_settings.js` | Menu image fields. |
| `..._create_site_branding.js` | `site_branding` (logo). |
| `..._create_notification_settings.js` | `notification_settings` (WhatsApp). |
| `..._create_email_templates.js` | `email_templates`. |

**Key hooks**
| Hook | Purpose |
|------|---------|
| `reservation-new-email.pb.js` | Emails admin on new reservation. |
| `reservation-approved-email.pb.js` | Emails guest on approval. |
| `whatsapp-reservation-notify.pb.js` | WhatsApp alert on new reservation (CallMeBot). |

### Configuration files
- Root `package.json` — workspaces + `dev`/`build`/`start`/`lint` scripts.
- `apps/web/vite.config.js`, `jsconfig.json`, ESLint config — build tooling (read-only).
- `apps/api/.env` — Express secrets (e.g. `STRIPE_SECRET_KEY`).
- `apps/web/public/.htaccess`, `manifest.webmanifest` — hosting/PWA config.

---

## 3. Feature Documentation

### Menu management
- Admins manage dishes in **Admin → Menu** (`AdminMenuPage` + `MenuItemEditModal`),
  stored in the `menu_items` collection with bilingual name/description
  (`nameEN`/`nameDE`, `descriptionEN`/`descriptionDE`), price, category, image,
  vegetarian flag, allergens, and availability.
- Public display (`MenuPage`, `HomePage`) chooses a mode based on
  `pdf_menu_settings`:
  - **PDF menu** (`pdfMenuEnabled` + uploaded `pdfMenuDE/EN`),
  - **Image menu** (`imageMenuEnabled` + `menuImageDE/EN`),
  - **Interactive digital menu** (fallback) — filter by dietary type & category.

### Reservations system
- Guests submit `TableReservationPage` → creates a `table_reservations` record
  (status `Pending`). Time slots validated to be ≥15 min in the future; Wednesdays
  disabled (restaurant closed).
- On create, PocketBase hooks email the admin and (if configured) send a WhatsApp
  alert. Admin approves/declines in `AdminReservationApprovalPage`; guest receives
  a status email (via Gmail composer templates or approval hook).
- Each reservation carries a `reservationCode` used on the confirmation page
  (`/reservation-confirmation/:code`).

### Order placement
- Guest flow: `MenuPage` → cart (`useCart`) → `CartPage` → `CheckoutPage` →
  creates an `orders` record → `OrderConfirmationPage`.
- Staff flow: Admin/Waiter place orders via `OrderPlacement` into `kitchen_orders`
  with per-item spice levels; placing an order marks the table reserved.

### KOT printing
- `kotPrint.js` builds an 80mm thermal ticket (left-aligned, huge bold black text)
  showing restaurant/table ID, order time, dishes with quantities + spice levels,
  special requests, and order ID. `openKOT(order)` navigates to
  `/kot-print/:orderId` (`KotPrintPage`) with Print + Cancel buttons. Used by
  Waiter/Admin, not KDS.

### KDS (Kitchen Display System)
- `KdsLoginPage` → `KdsDashboard`. Shows active `kitchen_orders` in real time with
  running timers, dish lists, and Mark Ready/Completed actions, plus ~2s multi-tone
  sound alerts (volume controllable). Uses the independent `kdsPb` client.

### Waiter dashboard
- `WaiterLoginPage` → `WaiterDashboard`. Tabs: **New Order** (`OrderPlacement`)
  and **Active** orders. Actions: Mark Served, Print KOT, Free Table (sets order
  `completed` and marks table available). Uses `waiterPb` client.

### Admin dashboard
- `AdminBookingDashboard` — bookings, table status grid (color-coded availability),
  reservation notifications, settings (branding logo, email templates, WhatsApp).
- `AdminReservationApprovalPage` — approve/decline with per-row details + Gmail email button.
- `AdminMenuPage` — menu CRUD. `AdminPlaceOrderPage` — place kitchen orders.

### Staff chat and voice calls
- `StaffChat` component (on Admin/KDS/Waiter dashboards) uses `staff_messages` for
  real-time text chat (per recipient role, unread badges, sound alerts).
- Voice calls use `useStaffCall` + `staff_calls` for WebRTC signaling
  (offer/answer, ICE), with incoming-call modal, mute, duration timer, and
  end-call. Requires microphone permission; works on mobile.

### Table management
- `table_configurations` holds tables (name, room, capacity, `tableId`,
  `isReserved`, `reservedInfo`). Admin manages tables; reservations/orders update
  reserved status in real time.

### Spice levels
- Defined in `kotPrint.js` (`SPICE_LEVELS = ['None','Mild','Medium','Hot','Very Hot']`),
  chosen per item in `OrderPlacement`, stored on `kitchen_orders.items[].spiceLevel`,
  and shown on dashboards + KOT.

### Unique table IDs
- Auto-generated (`T001`, `T002`, …) via migration backfill; editable in Admin →
  Tables; displayed throughout reservation/order/KOT workflows.

---

## 4. Local Setup Instructions

### Prerequisites
- **Node.js 22** (see `.nvmrc`) and **npm 10**
- **git**
- The PocketBase binary is included at `apps/pocketbase/pocketbase`.

> In the Hostinger sandbox, application lifecycle (start/stop/restart) is managed
> automatically — you do **not** run `npm run dev` manually there. The steps below
> describe a plain local machine.

### Clone repository
```bash
git clone <your-repo-url>
cd public_html
```

### Install dependencies
From the monorepo root (installs all workspaces):
```bash
npm install
```

### Environment setup
Create `apps/api/.env` for the Express server:
```env
STRIPE_SECRET_KEY=sk_test_xxx
PORT=3001
```
PocketBase uses `PB_ENCRYPTION_KEY` (set in the environment) as referenced by its
start scripts.

### Database setup
Migrations in `apps/pocketbase/pb_migrations/` are applied automatically on start
(and on `reload_app` in the sandbox). To apply manually:
```bash
npm run migrations:up --prefix apps/pocketbase
```
This also seeds the admin, KDS, and Waiter demo accounts.

### Run locally
From the root, run all three services concurrently:
```bash
npm run dev
```
- Frontend → http://localhost:3000
- Express API → http://localhost:3001
- PocketBase → http://localhost:8090 (admin UI at `/_/`)

### Access local application
- Customer site: `http://localhost:3000/`
- Admin login: `http://localhost:3000/admin-login`
- KDS login: `http://localhost:3000/kds-login`
- Waiter login: `http://localhost:3000/waiter-login`

### Test credentials
| Role | Login | Password |
|------|-------|----------|
| Admin | `admin@restaurant.com` | `SecureAdmin2026!Pwd` |
| KDS | `kds001` | `KdsPass123!` |
| Waiter | `waiter001` | `WaiterPass123!` |

---

## 5. Database Schema

PocketBase collections (SQLite). Rules are enforced per collection; `admin_users`
have full staff access.

### `menu_items` (base)
Dishes. Fields: `name`, `nameEN`, `nameDE`, `description`, `descriptionEN`,
`descriptionDE`, `price` (number), `category` (select: Breakfast, Appetizers,
Beverages, Main Courses, Snacks, Desserts, Sides & Accompaniments, Kids Menu),
`image` (file), `availability` (bool), `isVegetarian` (bool), `allergies` (text),
`allergens` (multi-select A–R), `created`, `updated`.

### `orders` (base)
Online orders. Fields: `customerId`, `customerName`, `customerEmail`,
`customerPhone`, `deliveryAddress`, `items` (json), `totalPrice`, `paymentStatus`
(pending/completed/failed), `orderNumber` (unique), `estimatedDeliveryTime`.

### `kitchen_orders` (base)
Staff-placed orders. Fields: `tableNumber`, `tableId`, `room`, `items` (json —
each `{ name, quantity, spiceLevel }`), `status` (pending/preparing/ready/
completed), `totalPrice`, `placedBy`, `placedByRole`, `notes`, `created`, `updated`.
Realtime-subscribed by KDS/Waiter/Admin.

### `table_configurations` (base)
Tables. Fields: `name`, `room` (Room 1/Room 2), `capacity`, `tableId` (T001…),
`isReserved` (bool), `reservedInfo` (text).

### `table_reservations` (base)
Guest reservations. Fields: `guestName`, `email`, `phone`, `reservationDate`
(date), `reservationTime` (text), `numberOfGuests`, `partySize`, `status`
(Pending/Approved/Declined), `reservationCode` (required), `assignedTable`,
`kidsUnder4` (bool), `numberOfKidsUnder4`, `childrenChairsNeeded`,
`numberOfChildrenChairs`, `chairsAdjustment`, `paymentStatus` (unpaid),
`adminNotes`, `timeSlotId` (relation → `time_slots`).

### `time_slots` (base)
Reservation slots. Fields: `name`, `startTime`, `endTime`, `slotType`
(lunch/dinner), `order`.

### `staff_messages` (base)
Chat. Fields: `senderRole`, `recipientRole` (admin/waiter/kds), `senderName`,
`content`, `read` (bool). Index on `(senderRole, recipientRole)`.

### `staff_calls` (base)
WebRTC signaling. Fields: `callerRole`, `calleeRole` (admin/waiter/kds),
`callerName`, `status` (ringing/connected/ended/declined/missed), `offer` (json),
`answer` (json), `durationSec`. Index on `(callerRole, calleeRole)`.

### `pdf_menu_settings` (base)
Menu display config. Fields: `pdfMenuEnabled`, `pdfMenuDE`/`pdfMenuEN` (file),
`imageMenuEnabled`, `menuImageDE`/`menuImageEN` (file).

### `site_branding` (base)
`logo` (file) — replaces text branding in header.

### `notification_settings` (base)
`whatsappEnabled` (bool), `whatsappNumber`, `whatsappApiKey` (CallMeBot).

### `email_templates` (base)
Approved/Declined/Pending subject + message + restaurant contact fields, with
`{placeholder}` support.

### `order_settings` (base)
`isOrderingEnabled` / `ordersEnabled`, `startTime`, `endTime`.

### `translations` (base)
`key` (unique), `englishText`, `germanText`, `category`.

### Auth collections
- `admin_users` (auth) — admin staff.
- `kds_users` (auth) — `username`, `displayName`; KDS logins.
- `waiter_users` (auth) — `username`, `displayName`; waiter logins.
- `users` (auth) — general/guest users (supports OTP).
- `otps` (base) — OTP codes for passwordless flow.

### Relationships
- `table_reservations.timeSlotId` → `time_slots` (relation).
- `table_reservations.assignedTable` / `kitchen_orders.tableId` reference
  `table_configurations` logically (by id / tableId).
- `staff_messages` / `staff_calls` link roles, not record relations.

---

## 6. API Routes

Express base path in the browser: `/hcgi/api` (server port 3001). Most CRUD/auth
goes directly to PocketBase; Express handles Stripe and reservation-email
orchestration.

### Reservations (`routes/reservations.js`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/reservations` | Admin (Bearer + admin check) | List all reservations. |
| POST | `/reservations/confirm` | — | Marks a reservation confirmed; body `{ reservationId, customerEmail, customerPhone }`. |
| POST | `/reservations/send-confirmation-email` | — | Creates a confirmation record; PocketBase hook sends email. |
| POST | `/reservations/send-decline-email` | — | Creates a decline record; hook sends email. |

### Orders (`routes/orders.js`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/orders` | Create order; body `{ customerId, items[], totalPrice, paymentStatus, deliveryAddress, customerEmail, customerPhone }` → `{ orderId, estimatedDeliveryTime }`. |
| GET | `/orders/:orderId` | Retrieve an order. |

### Stripe (`routes/stripe.js`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/stripe/create-checkout` | Creates a Checkout Session; body `{ items[], customerEmail, customerName, successUrl, cancelUrl, deliveryAddress }` → `{ sessionId, url }`. |
| GET | `/stripe/session/:sessionId` | Retrieve session + stored metadata. |

### Subscriptions (`routes/subscriptions.js`)
Subscription management endpoints (platform ecommerce subscriptions).

**Response format**: JSON. Errors return `{ error: "message" }` with 4xx status.
**Auth**: Admin-only endpoints require a Bearer token whose user id belongs to
`admin_users`; PocketBase collection rules govern direct client access.

---

## 7. Component Documentation

Reusable/feature components live in `apps/web/src/components/`. UI primitives in
`components/ui/` come from shadcn/ui (imported via `@/components/ui/<name>`) and
must not be edited.

| Component | Purpose | Key props |
|-----------|---------|-----------|
| `Header` | Sticky nav, language switch, cart, admin controls, logo. | `setIsCartOpen` |
| `Footer` | Site footer + legal links. | — |
| `ShoppingCart` | Slide-over cart drawer. | `isCartOpen`, `setIsCartOpen` |
| `ScrollToTop` | Scrolls to top on route change. | — |
| `ProtectedAdminRoute` | Guards admin routes; redirects unauthenticated. | `children` |
| `DishCard` | Menu dish card. | `dish`, `onClick` |
| `DishDetailModal` | Dish detail popup. | `dish`, `isOpen`, `onClose` |
| `PdfMenuDisplay` | Renders PDF/image menu per language. | `pdfSettings`, `language`, `t` |
| `MenuItemsList` | Admin list of menu items. | `refreshTrigger`, `onEdit` |
| `MenuItemEditModal` | Add/edit a menu item. | `isOpen`, `onClose`, `initialData`, `onSuccess` |
| `OrderPlacement` | Staff order builder (table, items, spice, notes). | `pbClient`, `placedBy`, `placedByRole`, `onPlaced` |
| `StaffChat` | Real-time chat + voice call launcher. | `role`, `pbClient`, `displayName` |
| `WhatsAppButton` | Floating WhatsApp CTA (hidden on staff dashboards). | — |
| `GlobalReservationNotifications` | Real-time new-reservation alerts for admin. | — |
| `FlowerPetal`, `TempleFloating`, `DecorativeElements` | Hero animations. | e.g. `count` |

**Contexts**: `AdminAuthContext` (`useAuth`), `LanguageContext` (`useLanguage`),
`CartProvider` (`useCart`), `SubscriptionAuthContext`.

**Hooks**: `useCart`, `useOrderSettings`, `useMobile`,
`useTableReservationConfirmation`, `useUserTier`, `useSubscriptionPolling`,
`useStaffCall`.

**Usage example** (Waiter placing an order):
```jsx
import { waiterPb as pb } from '@/lib/staffClients.js';
import OrderPlacement from '@/components/OrderPlacement.jsx';

<OrderPlacement
  pbClient={pb}
  placedBy="Waiter"
  placedByRole="waiter"
  onPlaced={() => refetchOrders()}
/>
```

---

## 8. Configuration Guide

### Environment variables
- `apps/api/.env`:
  - `STRIPE_SECRET_KEY` — Stripe secret key for checkout.
  - `PORT` — Express port (default 3001).
- `PB_ENCRYPTION_KEY` — PocketBase data encryption key (from environment).

### Settings (runtime, via Admin dashboard)
- **Online ordering toggle** — `order_settings.isOrderingEnabled` (controls
  order buttons site-wide).
- **Menu display** — `pdf_menu_settings` (PDF vs image vs interactive; per-language files).
- **Branding logo** — `site_branding.logo`.
- **Email templates** — `email_templates` (Approved/Declined/Pending with placeholders).
- **WhatsApp alerts** — `notification_settings` (`whatsappNumber` + `whatsappApiKey`).
- **Translations** — `translations` collection overrides default EN/DE strings.

### Customization options
- Theme colors/tokens: `apps/web/src/index.css` (`--primary` burgundy, `--secondary`
  gold, cream background, earth-green accents; light + dark variants).
- Time slots: `TIME_SLOTS` in `TableReservationPage.jsx` and the `time_slots`
  collection.
- Spice levels: `SPICE_LEVELS` in `kotPrint.js`.
- KOT layout: `buildKOTHtml` in `kotPrint.js` / `KotPrintPage.jsx`.

---

## 9. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| KDS/Waiter login "invalid login credentials" | Wrong username/password or demo accounts not seeded. | Use `kds001`/`KdsPass123!`, `waiter001`/`WaiterPass123!`; re-run migrations to reseed. |
| KOT shows "order not found" on mobile | Waiter/KDS sessions use separate auth stores. | `KotPrintPage` tries default, waiter, and KDS clients in sequence — ensure you're logged into one of them. |
| Reservation update fails: `reservationCode cannot be blank` | Editing a reservation without preserving its code. | Always send `reservationCode` on PATCH; new reservations auto-generate one. |
| Blank page after selecting a time | Browser auto-translate mutated time nodes. | Time displays use `notranslate` / `translate="no"` — keep those attributes. |
| Voice call has no audio | Microphone permission denied or WebRTC blocked. | Grant mic permission; use HTTPS; check `useStaffCall` error state. |
| "Connection to server lost" banner | PocketBase health check failing. | Verify PocketBase is running on :8090 and reachable via `/hcgi/platform`. |
| Emails not sent | Mailer/SMTP not configured or hook error. | Check PocketBase settings mailer + hook logs. |
| WhatsApp alert not delivered | Missing/incorrect CallMeBot number or key, or disabled. | Set `whatsappEnabled`, `whatsappNumber`, `whatsappApiKey` in notification settings. |

**Debug tips**
- Read PocketBase errors via the admin UI logs (`/_/`) or the platform error viewer.
- Frontend: browser console + the session journal (auto-captured runtime events).
- Server: Express logs via `apps/api/src/utils/logger.js`.
- Confirm current schema before writing migrations.

---

## 10. Deployment Guide

### Production build
```bash
npm run build            # builds apps/web to dist/apps/web
npm run start            # starts API + PocketBase in production mode
```
The site is served by Hostinger; static frontend + the two backend services run
behind the platform proxy (`/hcgi/platform` → PocketBase, `/hcgi/api` → Express).

### Domain setup
- Production domain: `https://triptigenusswelt.at`.
- A preview `*.app-preview.com` domain is also available for staging.
- Point the domain's DNS to the Hostinger host; the platform maps it to the app.

### SSL / HTTPS
- HTTPS/SSL is provisioned by the hosting platform; all traffic (site, API,
  PocketBase, WebRTC signaling) runs over TLS. WebRTC voice requires HTTPS.

### Database backup
- PocketBase data lives in `apps/pocketbase/pb_data/` (SQLite).
- Use the PocketBase admin UI (`/_/` → Settings → Backups) to create/download
  backups, or copy the `pb_data` directory during a maintenance window.
- Schema changes must go through `pb_migrations/*.js` (never mutate schema via the
  runtime API) so environments stay reproducible.

### PWA / mobile
- The main site and a dedicated Waiter app are installable PWAs
  (`manifest.webmanifest`, `waiter-manifest.webmanifest`, `service-worker.js`).
- For a native Android `.apk`, convert the Waiter PWA with PWABuilder or Bubblewrap
  (requires Android build tools); the manifest is production-ready for conversion.

---

*Demo logins — Admin: `admin@restaurant.com` / `SecureAdmin2026!Pwd` · KDS:
`kds001` / `KdsPass123!` · Waiter: `waiter001` / `WaiterPass123!`*
