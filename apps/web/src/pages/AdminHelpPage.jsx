import React from 'react';
import HelpLayout from '@/components/HelpLayout.jsx';
import {
  ShieldCheck, LayoutGrid, ShoppingBag, ChefHat, Receipt, CalendarDays, DoorOpen,
  UtensilsCrossed, Printer, MessageSquare, Globe, Settings, FileText, Clock, ConciergeBell,
  BellRing, ArrowRight, Trash2, BarChart3, PackageCheck,
} from 'lucide-react';

/**
 * Admin Help page.
 *
 * Documents every visible admin button and control across the Admin
 * Dashboard and its related pages: what each does, required
 * permissions/conditions, expected next view or state, confirmations/
 * warnings, and admin-only actions. Reflects the current implementation.
 */
export default function AdminHelpPage() {
  const sections = [
    {
      id: 'access',
      icon: ShieldCheck,
      title: 'Access & Permissions',
      intro: 'The Admin Dashboard is restricted to authenticated admin accounts. Waiters and KDS users cannot access it. An admin may also open the Waiter and KDS dashboards using their own admin session — no separate staff login is required.',
      tables: [
        {
          headers: ['Role', 'Admin Dashboard', 'Waiter Dashboard', 'KDS Dashboard'],
          rows: [
            ['Admin', 'Full access', 'Full access (admin session)', 'Full access (admin session)'],
            ['Waiter', 'No access', 'Full access', 'No access'],
            ['KDS', 'No access', 'No access', 'Full access'],
          ],
        },
      ],
      notes: [
        'Sign in at the Admin Login page. After login, the public site header shows an Admin Dashboard button and a Logout button.',
        'Reservation approval, menu editing, table configuration, waiter management, print settings, and all configuration are admin-only.',
      ],
    },
    {
      id: 'pending-panel',
      icon: BellRing,
      title: 'Pending Reservation Requests Panel',
      intro: 'When one or more reservations are genuinely pending (status Pending AND no table assigned yet), a sticky, blinking panel appears at the top of the dashboard. It updates instantly from realtime events and disappears once every request is handled.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Review Requests', 'Switches to the Reservations tab (Timeline view), jumps to the date of the first pending request, focuses it on the timeline, and scrolls to the reservations section.', 'Shown only while at least one pending request exists.'],
            ['Pending request row (click)', 'Switches to the Reservations Timeline on that request’s date and focuses that specific reservation.', 'Each row shows guest name, date, time, party size, and a Pending badge.'],
          ],
        },
      ],
      notes: [
        'The panel uses realtime updates plus a short polling fallback, so new pending requests appear immediately without a manual refresh.',
        'Once a request is assigned a table or its status changes from Pending, it leaves this panel automatically.',
      ],
    },
    {
      id: 'quick-access',
      icon: ArrowRight,
      title: 'Quick Access to Staff Dashboards',
      intro: 'Three buttons let an admin jump directly into the operational dashboards using the same authenticated admin session.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Next view'],
          rows: [
            ['Open Waiter Dashboard', 'Opens the Waiter Station with admin permissions (printing enabled, Back to Admin available).', 'Waiter Dashboard.'],
            ['Open KDS Dashboard', 'Opens the Kitchen Display with admin permissions (printing enabled, Back to Admin available).', 'KDS Dashboard.'],
            ['Open Stock Dashboard', 'Opens the Stock & Waste area with admin permissions (inventory, waste recording, audit history; Back to Admin available).', 'Stock Dashboard.'],
          ],
        },
      ],
    },
    {
      id: 'tabs',
      icon: LayoutGrid,
      title: 'Dashboard Tabs',
      intro: 'On desktop, a row of tab buttons switches the active section. On mobile, the same sections appear as collapsible accordions. Each tab is described in its own section below.',
      tables: [
        {
          headers: ['Tab', 'Purpose'],
          rows: [
            ['Orders', 'Manage customer online orders (status, delete, export).'],
            ['KOTs', 'Live view of all kitchen order tickets with delayed-state highlighting.'],
            ['Billing', 'Open/active waiter orders; mark billing completed after external OnlineBon.'],
            ['Reservations', 'Reservation timeline (Gantt) and list, with table fitting and approval.'],
            ['Tables', 'Configure available tables, rooms, and capacity.'],
            ['Menu', 'Manage menu items and categories (add, edit, delete, CSV).'],
            ['KOT Print Order', 'Reorder categories for printed kitchen tickets.'],
            ['Feedback', 'Approve or decline customer feedback shown on the homepage.'],
            ['Translations', 'Edit English/German interface text.'],
            ['Settings', 'Online ordering, branding, printing, marquee, closures, notifications, and more.'],
            ['Logs', 'Activity logs.'],
            ['Timesheets', 'Waiter shift timesheets by date range and waiter.'],
            ['Waiters', 'Create, edit, delete waiter accounts (CSV supported).'],
            ['Stock Managers', 'Create, edit, delete Stock Manager accounts for the Stock & Waste dashboard.'],
            ['Analysis', 'Read-only operational analytics: top items, category performance, KOT prep/serving times, waiter performance, volume, combos, pending/late KOTs, and exports.'],
          ],
        },
      ],
    },
    {
      id: 'orders',
      icon: ShoppingBag,
      title: 'Orders Tab',
      intro: 'Manages customer online orders placed through the public website (the orders collection).',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Search', 'Filters orders by order number, customer name, or email.', 'Applies as you type/submit.'],
            ['Status select (per row)', 'Changes an order’s payment status (e.g. pending, completed, failed).', 'Shows a success toast; updates realtime.'],
            ['Delete (per row)', 'Opens a confirmation, then permanently deletes the order.', 'Destructive — cannot be undone.'],
            ['CSV Export', 'Exports the current orders list to a CSV file.', 'Export-only for this collection.'],
            ['Refresh', 'Re-fetches the orders list.', 'Disabled while loading.'],
          ],
        },
      ],
    },
    {
      id: 'kots',
      icon: ChefHat,
      title: 'KOTs Tab',
      intro: 'A live, read-only view of every kitchen order ticket (KOT), with delayed-state highlighting for tickets pending 5+ minutes.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Refresh', 'Re-fetches all KOTs and combined-table membership.', 'Disabled while refreshing.'],
            ['CSV Export', 'Exports KOTs to a CSV file.', 'Export-only.'],
            ['Kitchen Status filter', 'Filters by All, Active, Delayed (pending 5+ min), Pending, Preparing, Ready, Completed, or Cancelled.', 'Display filter only.'],
            ['Sort (created)', 'Newest first or Oldest first.', '—'],
            ['Reset filters', 'Clears the status filter and sort back to defaults.', 'Visible only while a filter is active.'],
          ],
        },
      ],
      notes: [
        'Summary cards show Total KOTs, Active, Delayed, and how many match the current filters.',
        'Combined/Shared table membership is shown live (e.g. “Linked: 4 + 5 + 6” or “Shared Order”).',
        'An “Items Ordered” column shows a preview of the items on each ticket; click any KOT row to open a full itemized breakdown (name, category, quantity, spice level, unit price, line total, order notes, and KOT total).',
        'This view is read-only — ticket status is advanced from the KDS Dashboard.',
      ],
    },
    {
      id: 'billing',
      icon: Receipt,
      title: 'Billing Tab',
      intro: 'Shows open/active waiter orders. Mark an order Completed once the external OnlineBon billing process is finished.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Refresh', 'Re-fetches open orders.', 'Disabled while refreshing.'],
            ['CSV Export', 'Exports open billing orders to a CSV file.', 'Export-only.'],
            ['View Items', 'Opens a read-only dialog with the order’s items, notes, and totals for manual OnlineBon entry.', 'Available for every open order.'],
            ['Mark Completed', 'Sets the order’s billing status to Completed.', 'Disabled once already completed. Does not close the order or free the table — that happens in the Waiter workflow.'],
          ],
        },
      ],
      notes: [
        'Summary cards show Open Orders, Not Completed, and Completed counts.',
        'The View Items dialog is read-only; it does not change payment, order status, or tables.',
      ],
    },
    {
      id: 'reservations',
      icon: CalendarDays,
      title: 'Reservations Tab',
      intro: 'Manage reservations on a visual timeline (Gantt) or in a list. The timeline shows lunch (11:00–14:00) and dinner (17:00–21:00) serving windows; closed hours between them are collapsed. Wednesdays are closed.',
      tables: [
        {
          caption: 'Reservations overview header',
          headers: ['Control', 'What it does', 'Next view / state'],
          rows: [
            ['Timeline / List toggle', 'Switches between the Gantt timeline and the full reservation list.', 'Changes the view below.'],
            ['Refresh', 'Re-fetches pending requests and the timeline.', 'Shows a spinner briefly.'],
            ['Approval Dashboard', 'Opens the dedicated Reservation Approvals page.', 'Navigates to /admin/reservations.'],
          ],
        },
        {
          caption: 'Timeline (Gantt) controls',
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Previous / Next day', 'Moves the timeline one day back or forward.', '—'],
            ['Today', 'Jumps the timeline to today.', '—'],
            ['Date picker', 'Jumps to a specific date.', 'Closed days show a closure notice.'],
            ['Empty grid cell (click)', 'Opens the reservation editor pre-filled with that table and start time.', 'Creates a new reservation on save.'],
            ['Reservation block (click)', 'Opens the reservation editor for that reservation.', 'Edit or delete on save.'],
            ['Unassigned reservations list', 'Click a pending reservation to open the editor and assign it.', 'Shown only when unassigned reservations exist.'],
          ],
        },
        {
          caption: 'Reservation editor modal',
          headers: ['Control', 'What it does', 'Conditions & warnings'],
          rows: [
            ['Guest Name / Party Size / Email / Phone / Date / Start Time / End Time', 'Required reservation details.', 'Required fields are marked.'],
            ['Assigned Tables', 'Checkboxes to choose one or more tables for the party.', 'Only configured tables are listed.'],
            ['Status', 'Sets the reservation status: Pending, Confirmed (Approved), Completed, or Cancelled (Declined).', '—'],
            ['Admin Notes', 'Optional internal note.', '—'],
            ['WhatsApp', 'Opens a WhatsApp chat with an auto-generated reservation message.', 'Disabled if no valid phone number is on the reservation.'],
            ['Email', 'Opens Gmail compose with an auto-generated reservation message.', 'Disabled if no email is on the reservation.'],
            ['Auto Fit', 'Places the reservation on the first free table that fits the party (conflicts prevented), then opens a review dialog to confirm and save.', 'If no fitting table/slot is found, suggests Manual Fit. Never seats a party on a too-small table.'],
            ['Manual Fit', 'Opens the calendar editor pre-loaded with the reservation so you can choose the table and time yourself, then opens a review dialog.', 'The placement is staged, not finalized, until you save in the review dialog.'],
            ['Delete', 'Permanently deletes the reservation.', 'Destructive — confirmation required.'],
            ['Cancel', 'Closes the modal without saving changes.', 'Safe.'],
            ['Save', 'Persists the reservation details and any table assignment.', 'Disabled while saving.'],
          ],
        },
        {
          caption: 'Fit review dialog',
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Save & Confirm', 'Finalizes the proposed table/time assignment and marks the reservation Approved.', 'This is where Auto/Manual Fit proposals are actually persisted.'],
            ['Cancel', 'Closes the review without finalizing the fit.', 'Safe — the reservation stays unassigned.'],
          ],
        },
      ],
      notes: [
        'Cancel reservation (from a block) sets the status to Cancelled (Declined) after a browser confirmation.',
        'Auto Fit and Manual Fit only stage a proposal; the assignment is finalized in the Fit Review dialog.',
      ],
    },
    {
      id: 'tables',
      icon: DoorOpen,
      title: 'Tables Tab',
      intro: 'Configure the restaurant’s physical seating layout. Tables configured here are available for quick assignment in the Reservations timeline and used by the Waiter Station.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Max Table Number', 'Sets the maximum table number allowed for manual entry.', 'Used when no explicit table configurations exist.'],
            ['Add Table', 'Creates a new table with a name/number, room, and optional capacity.', '—'],
            ['Edit Table', 'Edits an existing table’s name, room, or capacity.', '—'],
            ['Delete Table', 'Removes a table configuration.', 'Destructive — confirmation may apply.'],
            ['CSV Export / Import', 'Bulk export or import table configurations.', 'Matched by ID or Name.'],
          ],
        },
      ],
    },
    {
      id: 'menu',
      icon: UtensilsCrossed,
      title: 'Menu Tab',
      intro: 'Manage digital menu items and categories. Categories are dynamic (sourced from the categories collection) and drive both the public menu and KOT printing.',
      tables: [
        {
          caption: 'Menu items',
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Add New Item', 'Opens the menu item form to create a dish (name, German name, price, category, description, dietary flags, image).', 'Hidden while the form is open.'],
            ['Edit Item', 'Opens the form pre-filled with an existing item.', '—'],
            ['Delete Item', 'Removes a menu item.', 'Destructive.'],
            ['Menu Items CSV Export / Import', 'Bulk export or import menu items.', 'Matched by ID or Name (EN).'],
          ],
        },
        {
          caption: 'Categories',
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Add Category', 'Opens a modal to create a category (English name, German name, description, display order).', '—'],
            ['Edit Category', 'Opens the modal pre-filled with an existing category.', '—'],
            ['Delete Category', 'Removes the category from the list. Existing menu items keep their current category value.', 'Destructive — confirmation required. Reassign items individually if needed.'],
            ['Categories CSV Export / Import', 'Bulk export or import categories.', 'Matched by ID or Name.'],
          ],
        },
      ],
    },
    {
      id: 'kot-print-order',
      icon: Printer,
      title: 'KOT Print Order Tab',
      intro: 'Reorder categories so printed kitchen tickets follow your preferred sequence (e.g. Appetizers first, Main Courses next). Categories without an explicit order sort last (alphabetically); Uncategorized always prints last.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Up / Down arrows', 'Moves a category up or down in the print sequence.', 'Changes are staged until saved.'],
            ['Save Order', 'Persists the new sequence as print order values.', 'Disabled until a change is made (dirty).'],
            ['Reset', 'Reloads the saved sequence, discarding staged changes.', '—'],
          ],
        },
      ],
    },
    {
      id: 'feedback',
      icon: MessageSquare,
      title: 'Feedback Tab',
      intro: 'Review customer feedback submissions. Approved feedback is displayed on the homepage; declined feedback is hidden.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Approve', 'Sets a feedback item’s status to Approved so it appears on the homepage.', 'Hidden if already approved.'],
            ['Decline', 'Sets a feedback item’s status to Declined so it is hidden from the homepage.', 'Hidden if already declined.'],
          ],
        },
      ],
      notes: [
        'The list updates in realtime as new feedback arrives.',
      ],
    },
    {
      id: 'translations',
      icon: Globe,
      title: 'Translations Tab',
      intro: 'Edit the English and German text for interface strings used across the site. Changes take effect site-wide after saving.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['English Text / German Text fields', 'Edits the translation for each key.', '—'],
            ['Save', 'Persists the edited translations.', '—'],
          ],
        },
      ],
    },
    {
      id: 'settings',
      icon: Settings,
      title: 'Settings Tab',
      intro: 'A stacked set of configuration panels. Each panel is independent and saves its own changes.',
      tables: [
        {
          headers: ['Panel / Control', 'What it does', 'Conditions'],
          rows: [
            ['Enable Online Orders toggle', 'Turns customer online ordering on or off across the public site.', 'When off, the Order Now button and cart are hidden from customers.'],
            ['Logo Settings', 'Upload/replace the site logo shown in headers.', 'Falls back to the text wordmark if no logo is set.'],
            ['Print Settings', 'Master switch and role permissions for KOT printing.', 'When off, print controls are hidden for Waiter and KDS; admins always retain print access.'],
            ['Restaurant Section Settings', 'Configure restaurant sections/rooms.', '—'],
            ['Marquee Settings', 'Configure the scrolling marquee bar message and visibility.', 'Auto-shows a closure message when the restaurant is closed.'],
            ['Reservation Form Settings', 'Edit the placeholder text for the reservation form’s “Additional Wishes” textarea (EN/DE).', 'Max 250 characters each.'],
            ['Closure Settings', 'Configure the weekly closed weekday and holiday/closure date ranges.', 'Closed dates are blocked on the reservation calendar.'],
            ['WhatsApp Notification Settings', 'Configure WhatsApp notification behavior for new reservations.', '—'],
            ['Email Template Settings', 'Configure email templates for reservation confirmation/decline.', '—'],
            ['PDF Menu Settings', 'Upload German/English PDF menus and images, and toggle their display.', 'When enabled, the public menu shows PDF links/images; otherwise the interactive digital menu is shown.'],
            ['Table Capacity Settings', 'Configure total available tables and max bookings per slot.', 'Used by reservation capacity calculations.'],
            ['Time Slot Configuration', 'Configure the bookable reservation time slots.', '—'],
          ],
        },
      ],
    },
    {
      id: 'logs',
      icon: FileText,
      title: 'Logs Tab',
      intro: 'View activity logs recorded by the system, and retrieve/export all application database data via the read-only Data Explorer.',
      tables: [
        {
          headers: ['Control', 'What it does'],
          rows: [
            ['System Logs / Data Explorer toggle', 'Switches between the activity log viewer and the read-only Data Explorer.'],
            ['Logs list', 'Shows recorded activity entries grouped by day.'],
            ['Collection selector (Data Explorer)', 'Pick any application collection to browse — orders, reservations, menu items, KOTs, billing, staff chat, waiters, settings, and more.'],
            ['Search current page', 'Client-side filter of the loaded page of records.'],
            ['Per page', 'Choose 25 / 50 / 100 / 200 records per page.'],
            ['Pagination (Prev / Next)', 'Move through pages of records.'],
            ['Row click / View', 'Opens a dialog with the full record as JSON.'],
            ['Page CSV / Page JSON', 'Download the currently loaded (and filtered) page.'],
            ['Export ALL (CSV / JSON)', 'Fetches every record in the collection and downloads it. Confirmation required; sensitive collections are flagged.'],
          ],
        },
        {
          headers: ['Note', 'Detail'],
          rows: [
            ['Read-only', 'The Data Explorer never creates, edits, or deletes records.'],
            ['Access rules apply', 'Owner-scoped collections (users, guests, KDS/admin users, OTPs, KOT counters) may return only your own record or be restricted.'],
            ['Sensitive data', 'Collections holding personal/auth data are labelled with a lock icon — handle exports responsibly.'],
          ],
        },
      ],
    },
    {
      id: 'timesheets',
      icon: Clock,
      title: 'Timesheets Tab',
      intro: 'Review waiter shift timesheets by date range and waiter.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Start Date / End Date', 'Sets the date range to query.', 'Start must be on or before End.'],
            ['Waiter filter', 'Filters timesheets to a specific waiter.', 'All shows every waiter.'],
            ['Sort', 'Newest first or Oldest first.', '—'],
            ['Apply', 'Runs the query with the selected range/filter/sort.', 'Shows an error toast if the date range is invalid.'],
          ],
        },
      ],
    },
    {
      id: 'waiters',
      icon: ConciergeBell,
      title: 'Waiters Tab',
      intro: 'Create, edit, and delete waiter staff accounts. Waiters log in with a Username + Password (an internal email is auto-generated and never shown).',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Add New', 'Opens a dialog to create a waiter (username, display name, password).', 'Password must be at least 8 characters. Username must be unique.'],
            ['Edit', 'Opens a dialog to edit username/display name. Password is optional — leave blank to keep the current password.', '—'],
            ['Delete', 'Opens a confirmation, then permanently deletes the waiter account.', 'Destructive — cannot be undone.'],
            ['Waiters CSV Export / Import', 'Bulk export or import waiter accounts.', 'Password required to create new accounts; leave blank on updates to keep the current password.'],
          ],
        },
      ],
    },
    {
      id: 'stock-managers',
      icon: PackageCheck,
      title: 'Stock Managers Tab',
      intro: 'Create, edit, and delete Stock Manager accounts. Stock Managers log in with a Username + Password (an internal email is auto-generated and never shown) and can access only the Stock & Waste dashboard.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Add New Stock Manager', 'Opens a dialog to create a stock manager (username, display name, password).', 'Password must be at least 8 characters. Username must be unique.'],
            ['Edit', 'Opens a dialog to edit username/display name. Password is optional — leave blank to keep the current password.', '—'],
            ['Delete', 'Opens a confirmation, then permanently deletes the stock manager account.', 'Destructive — cannot be undone.'],
          ],
        },
      ],
    },
    {
      id: 'analysis',
      icon: BarChart3,
      title: 'Analysis Tab',
      intro: 'Read-only operational analytics computed from existing kitchen orders (KOTs), their stored items, and waiter/timestamp data. No records are modified.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Refresh', 'Re-fetches all KOTs (with parent order expanded) and recalculates every metric.', 'Disabled while refreshing.'],
            ['Export JSON', 'Downloads the full filtered analysis (summary, items, categories, waiters, tables, rooms, volume, combos) as JSON.', '—'],
            ['From / To date', 'Restricts the analysis to KOTs created within the date range.', 'Optional; either or both may be blank.'],
            ['Waiter filter', 'Restricts to KOTs placed by a specific waiter.', 'Populated from loaded data.'],
            ['Category filter', 'Restricts to KOTs containing at least one item in the selected category.', '—'],
            ['Status filter', 'Restricts to a KOT status (Pending, Preparing, Ready, Completed, Cancelled).', '—'],
            ['Search', 'Free-text filter across item names, table, order ID, waiter, status, and notes.', '—'],
            ['Reset filters', 'Clears every filter.', 'Visible only while a filter is active.'],
            ['Items CSV', 'Exports the ranked item table (quantity, order count, revenue).', '—'],
            ['Waiters CSV', 'Exports the waiter performance table (KOTs, completed, cancelled, avg/fastest/slowest serve).', '—'],
          ],
        },
      ],
      notes: [
        'Summary cards: Total KOTs, Items Served, Revenue, and Cancelled count + rate.',
        'Timing cards: Avg/Peak Time-to-Served (completed KOTs) and Avg Time-to-Ready (ready KOTs), plus the top item.',
        'Waiter highlights name the fastest and slowest waiter by average time-to-served.',
        'Charts: Top 10 items by quantity, category performance (quantity + revenue), order volume over time, and waiter avg time-to-served.',
        'Tables: most frequently ordered items, waiter performance, category performance, popular item combinations, pending/late KOTs, busiest tables, and room trends.',
        'Timestamp transparency: preparation/serving times are approximated from each KOT’s created→updated timestamps (PocketBase has no dedicated ready/served timestamp). Values that cannot be measured are shown as “—” and excluded from averages.',
        'This tab is admin-only and read-only; waiters and public users cannot access it.',
      ],
    },
    {
      id: 'approval-page',
      icon: CalendarDays,
      title: 'Reservation Approvals Page',
      intro: 'A dedicated page (opened from the Reservations tab “Approval Dashboard” button) for reviewing incoming booking requests and sending confirmation/decline emails.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Back arrow', 'Returns to the Admin Dashboard.', '—'],
            ['Search (Code or Name)', 'Filters reservations by reservation code or guest name.', 'Submit to apply.'],
            ['Date filter', 'Filters to a specific date.', '—'],
            ['Status filter', 'Filters by All, Pending, Approved, or Declined.', '—'],
            ['Refresh', 'Re-fetches reservations for the current filters.', 'Disabled while loading.'],
            ['CSV Export / Import', 'Bulk export or import reservations.', 'Matched by ID or Code.'],
            ['Email (per row)', 'Opens Gmail compose addressed to the guest.', 'Available for any reservation.'],
            ['Approve (per row)', 'Sets status to Approved and sends a confirmation email to the guest.', 'Only shown for Pending reservations.'],
            ['Decline (per row)', 'Opens a decline modal to write a message and optionally suggest an alternative date/time, then sets status to Declined and sends a decline email.', 'Only shown for Pending reservations.'],
            ['Daily Capacity sidebar', 'Shows total, booked, and available tables for the selected date, with a progress bar.', 'Booked counts every active (Pending or Approved) reservation for the date.'],
          ],
        },
      ],
      notes: [
        'Decline modal: the message is required; suggested date/time are optional.',
        'The capacity sidebar updates in realtime as reservations change.',
      ],
    },
    {
      id: 'staff-chat',
      icon: MessageSquare,
      title: 'Staff Chat (Admin)',
      intro: 'A floating staff-chat control is available on the Admin Dashboard. As an admin you can chat with Kitchen (KDS) and individual waiters, and start/accept voice calls.',
      tables: [
        {
          headers: ['Control', 'What it does', 'Conditions'],
          rows: [
            ['Chat toggle', 'Opens/closes the floating chat panel.', 'Available while authenticated.'],
            ['Kitchen (KDS) / Waiters tabs', 'Selects the Kitchen conversation or the Waiters roster.', 'Waiters roster is admin/KDS only.'],
            ['Waiters dropdown', 'Selects an individual waiter conversation.', 'Admin/KDS only.'],
            ['Sound toggle', 'Turns incoming chat sound on or off.', 'Stored for the browser.'],
            ['Call', 'Starts a WebRTC voice call with the active target.', 'Disabled while another call is active. Microphone permission required.'],
            ['Message field / Send', 'Types and sends a chat message.', 'Enter sends; Shift+Enter adds a new line.'],
            ['Accept / Decline (incoming call)', 'Accepts or declines an incoming voice call.', 'Accept requires microphone permission.'],
            ['Mute / Unmute, End call', 'Controls an active call.', 'Visible while connected.'],
          ],
        },
      ],
    },
    {
      id: 'admin-only',
      icon: ShieldCheck,
      title: 'Admin-Only Actions',
      tables: [
        {
          headers: ['Action', 'Who can do it'],
          rows: [
            ['Approve / decline reservations and assign tables', 'Admin only.'],
            ['Create / edit / delete menu items and categories', 'Admin only.'],
            ['Configure tables, capacity, and time slots', 'Admin only.'],
            ['Create / edit / delete waiter accounts', 'Admin only.'],
            ['Create / edit / delete stock manager accounts', 'Admin only.'],
            ['Edit translations and all Settings panels', 'Admin only.'],
            ['Reorder KOT print categories', 'Admin only.'],
            ['Approve / decline homepage feedback', 'Admin only.'],
            ['Mark billing completed', 'Admin only.'],
            ['Manage print settings (master switch + role permissions)', 'Admin only.'],
            ['View activity logs and timesheets', 'Admin only.'],
          ],
        },
      ],
    },
    {
      id: 'destructive',
      icon: Trash2,
      title: 'Destructive & Persistent Actions Checklist',
      intro: 'Before using a control that changes or deletes persistent data, verify the target.',
      tables: [
        {
          headers: ['Action', 'Effect'],
          rows: [
            ['Delete order (Orders tab)', 'Permanently deletes a customer order.'],
            ['Mark Completed (Billing tab)', 'Persistently sets billing status to Completed.'],
            ['Cancel reservation (timeline)', 'Sets reservation status to Cancelled (Declined).'],
            ['Delete reservation (editor)', 'Permanently deletes the reservation.'],
            ['Delete table / menu item / category / waiter', 'Permanently removes that record.'],
            ['Approve / Decline feedback', 'Persistently changes whether feedback shows on the homepage.'],
            ['Enable/Disable Online Orders', 'Persistently changes customer ordering availability.'],
            ['Save KOT Print Order', 'Persistently changes the printed ticket category sequence.'],
            ['Save translations / settings', 'Persistently changes site-wide configuration.'],
          ],
        },
      ],
    },
  ];

  return (
    <HelpLayout
      title="Admin Help"
      subtitle="A complete guide to every button and control in the Admin Dashboard — what each does, when it is available, what to expect next, and which actions are admin-only."
      backTo="/admin-dashboard"
      backLabel="Back to Dashboard"
      sections={sections}
      footerNote="This guide reflects the current Admin Dashboard. Waiter and KDS staff have their own dashboards with a smaller, role-specific set of controls; see the Waiter Help page for those."
    />
  );
}
