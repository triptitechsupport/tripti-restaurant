# Waiter GUI Button & Control Reference

**Application:** Tripti Genusswelt — Waiter Station  
**Audience:** Waiters using `/waiter-login` and `/waiter-dashboard`  
**Reference basis:** Current waiter-facing React implementation

This document describes the controls that a real waiter can see, what each control does, the expected result, and the conditions that can disable or hide it. Labels may appear in German when the `DE` language is selected; the behavior is the same.

## 1. Access and permissions at a glance

- A waiter must authenticate against the `waiter_users` staff account collection.
- A successful waiter login automatically attempts to clock the waiter in, then opens the Waiter Dashboard.
- The waiter dashboard can place and manage table orders, but it does **not** grant admin functions.
- Waiters can send orders to the kitchen and update their own visible order workflow.
- Waiters can mark ready tickets as served, cancel still-pending tickets, settle payments, end eligible orders, and free eligible tables.
- Waiters cannot print KOTs from this interface. KOT print controls are gated out for the waiter role, even when the shared order component is also used by an administrator.
- Reservation approval, reservation calendar management, menu editing, table configuration, waiter management, print settings, and other administration controls are not part of the waiter GUI.

## 2. Sign-in screen — `/waiter-login`

| Control | Where it appears | Capability and expected result | Conditions, warnings, and unavailable states |
|---|---|---|---|
| **Login ID** field | Waiter Login card | Enters the waiter username/login identifier. | Required. The form does not submit successfully when it is empty. |
| **Password** field | Waiter Login card | Enters the staff password. The password is obscured. | Required. The field is disabled while authentication is in progress. |
| **Sign In** button | Waiter Login card | Authenticates the entered credentials. On success, shows a success message, attempts automatic clock-in, and navigates to `/waiter-dashboard`. | Disabled while authenticating. Invalid or missing credentials remain on the login screen and show an error. A clock-in failure does not block a successful login. |
| **Install the Waiter app on this device** / **How to install** | Below the login card when the app is not installed | On a browser that provides an install prompt, opens the native install prompt. Otherwise expands manual Android Chrome and iPhone Safari installation instructions. | If the app is already installed or running standalone, this control is replaced by an “app installed” status message. Installation is optional and does not change permissions. |

### Login failure behavior

- **Missing fields:** the form stays on the login screen and asks for all required fields.
- **Invalid credentials:** the form stays on the login screen and displays an authentication error.
- **Successful login:** the dashboard is the next view; the waiter is not sent to the public customer navigation.

## 3. Waiter header and shift controls

The authenticated dashboard uses a deliberately minimal header: logo on the left and language controls on the right. The normal customer header, cart, public navigation, and WhatsApp button are not shown on the waiter dashboard.

| Control | Icon/label | Where it appears | Capability and expected result | Conditions and important behavior |
|---|---|---|---|---|
| **Tripti Genusswelt logo / wordmark** | Restaurant logo or wordmark | Left side of the sticky waiter header | Navigates to `/waiter-dashboard?tab=place` and switches the order interface to **New Order**. It also scrolls the order interface to the top. | If no valid waiter or admin staff session exists, it navigates to `/waiter-login` instead. On a normal authenticated waiter session it does not log out or reload the app. |
| **EN** | Language switcher | Right side of header | Changes the interface language to English. | The selection is persisted for later visits. |
| **DE** | Language switcher | Right side of header | Changes the interface language to German. | The selection is persisted for later visits. |
| **Clock In** | Login/clock icon, “Clock In” | Dashboard header when no active timesheet exists | Creates an active waiter timesheet and changes the header to the clocked-in state. | Disabled while the clock-in request is running. A failure leaves the waiter unclocked and shows an error. Login already attempts this automatically. |
| **Clock Out** | Exit/login icon rotated, “Clock Out” | Dashboard header when an active timesheet exists | Closes the active timesheet and changes the header to the not-clocked-in state. | Disabled while the request is running. Clocking out does not navigate away or log out. Logout also attempts to clock out automatically. |
| **Quick Alert** | Warning triangle; full label on larger screens | Dashboard header | Opens the urgent staff alert dialog for contacting Kitchen/KDS or Admin without leaving the dashboard. | Available to the waiter. It sends a staff-chat alert, not an order or reservation. |
| **Waiter Mode** | Lightning icon, “Waiter Mode” | Dashboard header | Activates the **New Order** tab and scrolls to the top of the order interface. | It is a navigation shortcut, not a permission switch and not a separate mode stored in the database. |
| **Logout** | Exit icon, “Logout” | Dashboard header | For a waiter, attempts to clock out, tears down the waiter realtime subscriptions, clears the waiter session, and navigates to `/waiter-login`. | This is an explicit destructive session action. It does not delete orders or drafts. A hard redirect safety net may follow if the route does not change. |
| **Back to Admin** | Back arrow and “Admin” | Only when an administrator is viewing the waiter dashboard | Returns the administrator to `/admin-dashboard` without clearing the admin session. | Not visible to an ordinary waiter. It is an admin convenience control, not a waiter capability. |

### Header behavior on small screens

- Header labels may collapse to icons to preserve space, but the same controls remain available and keep touch-friendly hit areas.
- The logo and `EN`/`DE` controls remain visible.
- There is no waiter hamburger menu; public customer navigation is intentionally omitted.

## 4. Ready-for-pickup notification

When Kitchen changes a KOT to **Ready to Pickup**, the waiter receives a realtime alert. The browser may vibrate and play a chime when supported, and a persistent green banner remains at the top of the waiter interface until acknowledged.

| Control | Where it appears | Capability and expected result | Conditions and warnings |
|---|---|---|---|
| **View Active Orders** | Ready-for-pickup banner | Acknowledges the ready tickets and switches to the **Active** tab so the waiter can review and serve them. | The banner is removed from the acknowledged list, but the KOT remains in its Ready state until the waiter marks it served. |
| **Dismiss** | Ready-for-pickup banner | Acknowledges the ready ticket(s) without navigating away from the current tab. | For one ticket, only that ticket is dismissed. For multiple tickets, all currently shown ready tickets are acknowledged. The tickets are not served or cancelled. |
| **Ready-for-pickup toast action** | Temporary notification toast | Performs the same action as **View Active Orders**. | The toast is secondary; the persistent banner is the durable visual reminder. |

Opening the **Active** tab also acknowledges currently ready pickup notifications because the waiter is now viewing the relevant order list.

## 5. Main order navigation tabs

| Control | Icon/label | Expected next view or state | Conditions |
|---|---|---|---|
| **New Order** | Plus icon | Opens the table selection and menu-building view. | Always available. |
| **Order** | Shopping-cart icon and quantity badge | Opens the current draft order review. The badge shows the total quantity currently in the draft. | The tab can be opened even when empty; the empty view offers **Back to New Order**. |
| **Active (n)** | List icon and active-order count | Opens the active-order and order-history management view. | Visible on the normal waiter dashboard. The count reflects currently active grouped orders/KOTs and may update realtime. |
| **View Order** | Floating shopping-cart pill with quantity and total | Opens the **Order** tab from the New Order view. | Visible only while the draft contains at least one item. It is fixed near the bottom of the viewport, so it remains reachable while browsing the menu. |

Changing tabs scrolls the page to the top. A draft is preserved across ordinary backgrounding, sleep, focus changes, or app switching; it is not silently cleared by those events.

## 6. New Order — table selection and combination controls

The menu is shown after a valid table context exists: a selected single table, a shared combination with at least two tables, or an active linked table.

### 6.1 Single-table flow

| Control | Where it appears | Capability and expected result | Conditions, warnings, and next state |
|---|---|---|---|
| **Table Number** select | New Order → Select a Table | Opens the configured table list. Selecting a table fills the table number and its room, then reveals the menu. | Only active configured tables within the admin-configured range are offered. A table with an open order can be selected to add another KOT to that order. An ended-but-not-freed or combined table is blocked. |
| **Table Number** numeric field | Same location when no table configurations are available | Manually enters a table number and reveals the menu once valid. | Must be a valid positive table number within the configured maximum. Invalid values are rejected when sending. |
| **Combine Tables** switch | Select a Table card | Turns the multi-table workflow on or off. Enabling clears the single-table selection and enters combination setup. Disabling exits combination mode and returns to the single-table flow. | Turning off an unfinished linked combination cleans up its placeholder group so tables become selectable again. A real linked group with orders remains managed through Active Orders. |

### 6.2 Combine Tables flow

When enabled, the waiter chooses one of two visible modes:

| Control | Icon/label | Capability and expected result | Conditions and billing behavior |
|---|---|---|---|
| **Linked Orders** | Layers icon; “separate bills” | Groups selected tables for convenience while keeping a separate order, KOT stream, payment, End Order action, and bill for each table. | Requires at least two available tables. Items are added to one active table at a time and are never copied automatically to the other linked tables. |
| **Shared Order** | Utensils icon; “one combined bill” | Creates one parent order and one combined bill for all selected tables. | Requires at least two available tables. The first selected table is the primary stored table value, while all selected tables remain displayed as the group. |
| **Table checkbox** | Checkbox beside each configured table | Selects or deselects that table for a new combination. | Disabled for occupied or already-combined tables. At least two available tables are required. The list can show `Occupied` or `Combined` reasons. |
| **Start Linked Order** | Layers icon | Creates the linked table group and enters the active-table phase. The first selected table becomes active, and each selected table receives its own empty working cart. | Only visible for Linked Orders after at least two tables are selected. Disabled while creating the group. It reserves the combination even before the first item is sent; exiting before any order is sent cleans up the placeholder. |
| **Linked table selector** | Table-name buttons with table icon and quantity badge | Switches the active table receiving items. Saves the current table’s draft cart and loads the selected table’s independent cart. | Only visible after **Start Linked Order**. Switching tables does not transfer items or notes between tables. The active table is visually highlighted. |
| **Done — Exit Combine Tables** | X-circle icon | Leaves the linked active-table phase and returns to ordinary table selection. | If no linked order was sent, the placeholder group is closed and its tables are released. Existing sent linked orders remain in the Active view and are not deleted. |

### 6.3 Table availability rules

- A table with an open order is selectable for an additional KOT; sending adds to that existing parent order rather than creating a second open order.
- A table with an ended order remains occupied until **Free Table** is completed.
- A table in an active combination cannot be selected as an unrelated standalone order.
- These states update through realtime subscriptions and are also checked again when the order is sent.

## 7. New Order — menu, categories, quantities, and notes

| Control | Where it appears | Capability and expected result | Conditions and behavior |
|---|---|---|---|
| **Search dishes…** field | Above the menu categories | Filters menu items by English name, German name, or stored name while typing. Matching categories automatically expand. | Visible after a valid table context exists. Clearing the field restores the normal category view. |
| **Category accordion header** | Menu category list | Expands or collapses a category to show or hide its dishes. The badge shows the number of draft units from that category. | Multiple categories can be open. Categories with no matching search results are hidden during a search. |
| **Menu item card** | Inside an expanded category | Adds one unit of that dish to the current draft. If already present, the quantity increases by one. | Available only after a table context is selected. The displayed price is the current menu price. |
| **Spice level select on menu card** | Bottom of each dish card | Selects the spice level that will be used when the dish is added. If the dish is already in the draft, updates its current spice level too. | Default is `Medium`; options come from the current spice-level list. This is a draft setting, not a separate server record until the order is sent. |
| **− quantity button** | Dish card after the item is in the draft | Decreases the draft quantity by one. When quantity reaches zero, the dish is removed from the draft. | Only shown for items already in the draft. |
| **+ quantity button** | Dish card after the item is in the draft | Increases the draft quantity by one. | Only shown for items already in the draft. |
| **Draft quantity badge** | Top-right of an item card | Displays the current quantity. | Informational; it is not a separate button. |

## 8. Order review and sending to Kitchen

| Control | Icon/label | Capability and expected result | Conditions and important behavior |
|---|---|---|---|
| **Back to New Order** | Arrow icon and label | Returns to the menu/table-building view without clearing the draft. | Available on the empty-order view and the order review header. |
| **Back** | Arrow icon and label | Returns from order review to New Order so the waiter can change the table or add dishes. | Does not discard the current draft. |
| **Cancel** | Trash icon and label | Opens a browser confirmation asking whether to clear the order and notes. On confirmation, clears the draft and resets the normal single-table flow. | Destructive and cannot be undone from the UI. In an active linked-table phase it clears only the current table’s cart and preserves the linked group and other table carts. If the draft is already empty, it simply returns to New Order. |
| **Walk-in** | Door icon and label | Selects the visible order type. | This is the currently available waiter order type and is selected by default. |
| **Pre-order** | — | Not currently visible or selectable in the waiter GUI; its button is commented out in the implementation. | Do not document it as an available waiter action. |
| **Spice level select in review** | Flame icon | Changes the spice level for an item already in the draft. | Changes only the draft until **Send to Kitchen** is used. |
| **− quantity button in review** | Minus icon | Decreases one draft line quantity; removes the line at zero. | Does not modify a previously sent KOT because this is still the unsent draft. |
| **+ quantity button in review** | Plus icon | Adds one unit to the draft line. | Does not send anything until the main send action is used. |
| **Remove item** | Trash icon | Removes the entire dish line from the draft. | Destructive for that draft line, but it does not affect a previously sent ticket. |
| **Notes / Special instructions** | Textarea | Adds free-text instructions to the outgoing KOT. | The text is sent with the KOT. It can be edited until the order is sent. |
| **Send to Kitchen** | Send icon | Creates or reuses the appropriate parent waiter order, creates a pending KOT, sends the selected dishes and notes to Kitchen, shows a success notification, and clears the completed draft for the next order. | Disabled until the required table context, order type, and at least one dish are present. While sending, it shows a progress state. For a failed KOT creation after the parent order was saved, the same Order ID is retained and the waiter is told to tap the button again to retry; this avoids duplicate parent orders. |

### After a successful send

- The KOT starts as **Pending** in Active Orders.
- The waiter remains in the Waiter Station and can start a new draft.
- The table remains occupied according to the active parent order.
- Any subsequent send to the same open table becomes another KOT on that same parent order.
- Waiters do not receive an auto-print button or a manual print button in this interface. Printing is an admin-controlled capability and is hidden for the waiter role.

## 9. Active Orders and Order History

### 9.1 View and filter controls

| Control | Where it appears | Capability and expected result | Conditions and behavior |
|---|---|---|---|
| **Active Orders** | Active view sub-tab | Shows parent orders that are not yet closed, including open, ended-but-not-freed, or paid-but-not-freed orders. | Selected by default. End Order and payment do not move an order to History; Free Table closes it. |
| **Order History** | Active view sub-tab | Shows parent orders whose table was freed and whose order status is closed. | Legacy unparented KOTs do not appear in this history sub-tab. |
| **Kitchen Status** select | Active view filters | Filters groups when at least one child KOT has the selected status: All, Pending, Preparing, Ready to Pickup, Completed, or Cancelled. | This is a display filter only; it does not update a ticket. |
| **Table** select | Active view filters | Filters by the selected configured table. | `All Tables` shows all tables. The control reflects current admin table configuration. |
| **Refresh** | Refresh icon and label | Re-fetches waiter parent orders and kitchen KOTs, then updates the last-refreshed time. | Disabled while refreshing. Realtime updates and polling normally keep the view current even without pressing it. |
| **Reset** | X-circle icon and label | Clears the Kitchen Status and Table filters and returns both to `All`. | Visible only while one or more filters are active. |

### 9.2 KOT status actions

| Control | Where it appears | Capability and expected result | Conditions, warnings, and irreversibility |
|---|---|---|---|
| **Mark Served** | On a KOT with status **Ready to Pickup** | Changes the KOT status to `completed` / Served, refreshes the list, and removes its ready-to-pickup action. | Only available while the KOT is Ready. Serving a ticket is a persistent kitchen-order status change. It is required before its parent order can be ended. |
| **Decrease item quantity** | Minus control beside an item in Active Orders | Decreases that pending KOT line by one and recalculates the ticket total. If a line reaches zero while other lines remain, that line is removed. | Only shown for a KOT with status `pending` and at least two item lines. It is hidden once preparation has started. If removing the last remaining item would empty the KOT, the entire ticket is cancelled instead. |
| **Cancel Ticket** | On a KOT with status **Pending** | Opens a confirmation dialog. Confirming marks that KOT `cancelled`, keeps it visible in the order, refreshes payment totals, and leaves the parent order open. | Destructive ticket action. It is not available once the ticket is Preparing, Ready, Served, or already Cancelled. Those states show an explanatory non-button message instead. A cancelled ticket is considered resolved for End Order. |
| **KOT / Print KOT** | KOT card or last-order confirmation | Not visible to a waiter. In shared non-waiter contexts it opens the KOT print flow, subject to admin print permission and order state. | Admin/KDS-only capability in practice. Waiters should use the sent-to-kitchen workflow; they cannot initiate or reprint KOTs from the waiter GUI. |

### 9.3 Parent-order actions

| Control | Where it appears | Capability and expected result | Conditions, warnings, and irreversible effects |
|---|---|---|---|
| **End Order** | Parent order footer | Opens a confirmation dialog. Confirming records `endedAt`, refreshes the order, and leaves the table occupied for payment and freeing. | Enabled only when every child KOT is Served or Cancelled. Pending, Preparing, or Ready KOTs block it. Payment is **not** required to end an order. End Order does not itself close the order, release the table, or reverse the tickets. |
| **End Order confirmation — Cancel** | End Order alert dialog | Closes the dialog and leaves the order unchanged. | Safe, non-destructive. |
| **End Order confirmation — End Order** | End Order alert dialog | Performs the End Order action described above. | Persistent state change. The table is still not available for a new order. |
| **Free Table** | Parent order footer | Re-checks live order and payment state, then marks the parent closed/freed and releases the table. The table becomes available for a new order. | Disabled until the order is ended and outstanding payment is zero. This is the action that actually releases the table. It does not have an extra confirmation dialog, so verify the order and payment state before using it. |
| **Table Freed** | Parent order footer after freeing | Informational status replacing the Free Table button. | Not a button. The order is now closed and appears in Order History. |
| **Generate Bill** | Parent order footer | After End Order, shows an informational message that bill generation will be available in a later phase. It does not currently create a fiscal bill or receipt, change payment, or free the table. | Disabled before End Order. This is currently a gated placeholder, not a completed billing-generation function. |
| **Pay — €amount due** | Parent order payment section | Opens the payment settlement dialog for the order. | Only visible while outstanding payment is greater than zero. It does not itself settle anything until the waiter selects items and confirms. |
| **Fully settled** | Parent order payment section | Informational state replacing the Pay button. | Not a button. All currently payable item units are marked paid. |

### Parent-order lifecycle

1. **Open:** new KOTs can be added to an open table order.
2. **Ended:** all KOTs are Served or Cancelled and the waiter confirms End Order. The table is still occupied.
3. **Paid:** all payable units are settled; payment can occur before or after End Order.
4. **Freed/Closed:** End Order is complete and payment is fully settled, then the waiter selects Free Table. Only this step releases the table and moves the order to history.

## 10. Combined table group actions

### Shared Order

A Shared Order is displayed as one parent card under a Shared Order heading. It has one combined payment total, one parent order, and one Free Table action that releases all member tables after its prerequisites are met.

### Linked Orders

Linked Orders are displayed under one group heading but retain a separate card and separate financial state for each member table.

| Control | Where it appears | Capability and expected result | Conditions and warnings |
|---|---|---|---|
| **End All (n)** | Linked group summary | Opens a confirmation dialog listing each member and whether it will be ended or blocked. Confirming ends only eligible members whose KOTs are all Served or Cancelled. | It never force-closes unresolved members. Payment is not required for End All. The result can be partial: eligible orders end while blocked orders remain open. |
| **End all orders in this group? — Cancel** | Group End All dialog | Closes the dialog without changing any member. | Safe. |
| **End Eligible Orders** | Group End All dialog | Runs End Order validation independently for every linked member. | Persistent changes can affect several orders, but blocked members are skipped rather than forced closed. |
| **Free All (n)** | Linked group summary | Opens a confirmation dialog listing each member and whether it will be freed or blocked. Confirming frees only members that are ended and fully settled. | It never force-frees an open or unpaid member. The result can be partial. Each linked member keeps its own payment state and order history. |
| **Free all tables in this group? — Cancel** | Group Free All dialog | Closes the dialog without changing any member. | Safe. |
| **Free Eligible Tables** | Group Free All dialog | Re-checks live state and releases every eligible member table. | Persistent and potentially multi-table. Unpaid, open, missing, or otherwise ineligible members are skipped and reported. |

## 11. Payment settlement dialog

Opening **Pay — €amount due** shows the current order total, paid amount, due amount, and unpaid units. The dialog starts with **individual units**: a line with quantity 3 appears as three separate 1× selectable rows.

| Control | Where it appears | Capability and expected result | Conditions and warnings |
|---|---|---|---|
| **Settle full order** | Payment dialog | Selects every unpaid unit, changes the display to the original grouped line quantities such as `3×` or `2×`, and updates the selected amount to the full unpaid amount. | It selects unpaid units only. Already paid units remain locked. It does not write payment until the confirmation button is used. |
| **Clear selection** | Payment dialog | Removes all payment selections and returns the display to individual 1× rows. | Safe. It does not mark anything unpaid or paid; it only clears the pending selection. |
| **Individual unpaid unit row** | Payment dialog in default mode | Selects or deselects exactly one unpaid unit and updates the selected-to-settle amount. | This is the default settlement method. Paid rows are disabled and cannot be toggled back to unpaid. |
| **Grouped unpaid line row** | Payment dialog after Settle full order | Selects or deselects all units in that line, such as all three units of a `3×` row. | Paid lines are disabled. Selecting a grouped line is still an explicit selection awaiting confirmation. |
| **Close** | Payment dialog footer | Closes the dialog and clears the temporary selection state without changing payment records. | Safe. No payment is recorded unless **Confirm €amount** is used. The dialog’s standard close control/Escape behavior may also close it. |
| **Confirm €amount** | Payment dialog footer | Persists payment for the selected units, recalculates the parent payment totals, shows a success message, refreshes Active Orders, and closes the dialog. | Disabled while saving or when no unit is selected. Payment is a persistent action: selected units become paid and cannot be toggled back to unpaid. |

### Partial payment behavior

- If only part of a quantity is selected, the implementation splits the line into a paid quantity and a remaining unpaid quantity.
- Example: selecting 1 of 3 items records 1 paid unit and leaves 2 unpaid units.
- A full-order selection settles all unpaid units, but already paid units are never selected again.
- Cancelled KOTs are excluded from settlement.

## 12. Ticket and confirmation dialogs

| Dialog/control | Capability and expected result | Important behavior |
|---|---|---|
| **Cancel Ticket — Keep Ticket** | Closes the cancellation dialog and leaves the pending KOT unchanged. | Safe. |
| **Cancel Ticket — Cancel Ticket** | Marks the selected pending KOT as Cancelled and refreshes the order/payment view. | Destructive and persistent. The KOT remains visible for history/audit; it is not deleted. |
| **Duplicate print dialog — Cancel** | Closes a reprint confirmation without printing. | This dialog is not available to ordinary waiters because KOT printing is hidden for the waiter role. |
| **Duplicate print dialog — Send Again** | Reprints a previously printed KOT in contexts where printing is permitted. | Admin/KDS-only in the waiter workflow. It is a confirmation against accidental duplicate printing, not a permanent block. |
| **Dialog close icon / Escape / outside close where provided** | Closes the currently open non-destructive modal when the underlying dialog primitive permits it. | Closing a dialog does not confirm its action. For destructive AlertDialogs, use the explicit Cancel/Keep Ticket action. |

## 13. Quick Alert dialog

The **Quick Alert** header button opens a separate urgent-message dialog. It does not open the full chat panel and leaves the waiter on the current dashboard view after sending.

| Control | Where it appears | Capability and expected result | Conditions and warnings |
|---|---|---|---|
| **Send to** select | Quick Alert dialog | Chooses the recipient role: **Kitchen & Admin**, **Kitchen (KDS)**, or **Admin**. | The default is Kitchen & Admin. One staff-message alert record is sent per selected recipient role. |
| **Message** textarea | Quick Alert dialog | Enters the alert text, for example a request for assistance at a table. | Required and limited to 500 characters. A character counter is shown. |
| **Cancel** | Quick Alert dialog footer | Closes the alert dialog and resets its temporary fields after the close animation. | Safe; no alert is sent. Disabled while sending. |
| **Send Alert** | Quick Alert dialog footer | Sends the text as an urgent staff-chat message with an alert badge, shows a sent confirmation, then automatically closes the dialog shortly afterward. | Disabled until a non-empty message exists and while sending. Failure leaves the dialog available for retry. |
| **Ctrl + Enter / ⌘ + Enter** | While typing in the alert message | Sends the alert without clicking the button. | Same validation and sending behavior as **Send Alert**. |

## 14. Staff Chat and voice calling

The floating staff-chat control is shown at the lower-right of the waiter dashboard. It is separate from Quick Alert.

### 14.1 Chat panel controls

| Control | Icon/label | Capability and expected result | Waiter visibility/conditions |
|---|---|---|---|
| **Staff chat toggle** | Message-circle icon when closed; X when open | Opens or closes the floating Staff Chat panel. An unread count badge appears on the closed button when messages are unread; an amber alert badge appears when urgent alerts are unread. | Available to an authenticated waiter. The panel overlays the dashboard and does not navigate away. |
| **Admin** conversation tab | Role tab | Selects the private/role-based Admin conversation and shows its messages. | Visible to waiters. Unread count may appear on the tab. |
| **Kitchen (KDS)** conversation tab | Role tab | Selects the Kitchen/KDS conversation and shows its messages. | Visible to waiters. Unread count may appear on the tab. |
| **Waiters** dropdown | Users icon and dropdown | Selects an individual waiter conversation in roles that can browse waiters. | Not visible to waiters. Admin and KDS can use it; waiters are not shown a waiter-to-waiter peer list. |
| **Sound toggle** | Volume or muted-volume icon | Turns incoming chat sound on or off. The preference is stored for the browser. | Available in the chat header. It affects chat pings, not necessarily all system/browser sounds. |
| **Close chat** | X icon in chat header | Closes the Staff Chat panel while leaving the session and any call running. | Safe. The floating toggle can reopen it. |
| **Call** | Phone icon beside the message field | Starts a WebRTC voice call with the active conversation target. For waiter conversations, the call targets the selected Admin or KDS role. | Disabled while another call is active or an incoming call is waiting. Browser microphone permission is required. |
| **Message field** | Text input at bottom of panel | Enters a normal staff-chat message. | Messages are sent to the currently selected Admin or KDS conversation. |
| **Send message** | Send icon | Sends the typed message, clears the input, and leaves the current conversation open. | Disabled while sending or when the input is empty. Pressing Enter without Shift has the same effect. |
| **Enter** | Keyboard action in message field | Sends the current chat message. | Shift+Enter can be used to avoid the single-line send behavior. |

Incoming messages are marked read when the active conversation is open. Alerts are visually marked as urgent and may produce a sound when enabled.

### 14.2 Incoming-call controls

| Control | Where it appears | Capability and expected result | Conditions and warnings |
|---|---|---|---|
| **Decline** | Full-screen incoming-call overlay | Declines the call, stops the ringing sound, and removes the incoming-call overlay. | No microphone permission is needed to decline. |
| **Accept** | Full-screen incoming-call overlay | Requests microphone access, connects the voice call, closes the overlay, and shows the active call bar with duration. | Requires microphone permission and a supported browser/device. If permission is denied or connection fails, an error is shown and the call returns to idle. |

### 14.3 Active-call controls

| Control | Icon/label | Capability and expected result | Conditions |
|---|---|---|---|
| **Mute / Unmute** | Microphone or crossed-microphone icon | Disables or re-enables the local microphone track during a connected call. | Visible only while connected. The icon reflects the current state. |
| **End call** | Phone-off icon | Ends the call, stops local media, clears the call bar, and records the call as ended. | Available while calling or connected. It does not close Staff Chat messages. |

## 15. Reservation-related controls and visibility

There are **no reservation controls visible to a waiter** in the current waiter GUI.

- The global new-reservation popup, **Dismiss**, and **View Notification** controls are guarded by the admin authentication context and are not rendered for waiter sessions.
- Reservation approval, calendar/timeline fitting, reservation details, and reservation settings are admin-dashboard functions.
- The waiter can still use the normal table/order workflow; that does not approve, reject, or edit customer reservations.

## 16. Responsive and mobile behavior

The same capabilities remain available on mobile and tablet, with layout changes rather than permission changes:

- Header text labels may collapse to icons; the controls retain accessible labels/tooltips and touch-sized targets.
- The New Order, Order, and Active tabs remain available in a sticky tab bar.
- The ready-for-pickup banner stacks its message and actions vertically on narrow screens.
- Menu cards use a compact grid and keep the dish tap area, spice selector, and quantity controls available.
- The Order review item list becomes a scrollable region while the order actions remain reachable.
- Active-order action rows wrap when necessary; **Refresh**, **Reset**, payment, and group actions remain touch-friendly.
- Staff Chat uses a responsive floating panel and call bar; it does not change the conversation permissions.
- The WhatsApp customer button is intentionally hidden on waiter, KDS, and admin routes so it does not overlap staff controls.

## 17. Actions that are unavailable to waiters

The following are intentionally absent or disabled in the waiter GUI:

- KOT printing and duplicate KOT reprinting.
- Admin dashboard navigation as a waiter.
- Reservation approval/calendar controls.
- Menu item/category creation, editing, deletion, or pricing.
- Table configuration and occupancy-setting administration.
- Waiter account management and print-setting management.
- Staff Chat’s individual Waiters roster/dropdown.
- The commented-out **Pre-order** order-type button.
- Customer cart, checkout, public-site navigation, and WhatsApp contact control.

## 18. Destructive and persistent actions checklist

Before using a control that changes persistent data, verify the target table and order:

- **Cancel** in Order review clears the current draft after browser confirmation.
- **Remove item** and draft quantity minus controls change only the unsent draft.
- **Decrease item quantity** changes a pending KOT; removing its last item cancels the ticket.
- **Cancel Ticket** permanently changes the ticket status to Cancelled; it does not delete the ticket.
- **End Order** records the end time and prevents further normal order continuation, but does not free the table.
- **Pay / Confirm** permanently marks selected units as paid; paid units cannot be returned to unpaid through the GUI.
- **Free Table** closes/frees the eligible parent order and releases the table. It is the only normal waiter action that makes the table available again.
- **Logout** clears the waiter authentication session but does not delete drafts, orders, KOTs, or payment history.

## 19. Typical waiter workflows

### Place and send a normal order

1. Sign in.
2. Select **New Order** if necessary.
3. Select an available table.
4. Open a category, tap dishes, choose spice levels, and review the quantity badge.
5. Open **Order** or **View Order**.
6. Confirm **Walk-in**, adjust quantities/notes, then tap **Send to Kitchen**.
7. Watch Active Orders or wait for the Ready-for-Pickup notification.
8. Tap **Mark Served** after collecting and serving the ticket.

### Finish a table

1. Ensure every KOT is Served or Cancelled.
2. Tap **End Order** and confirm.
3. Open **Pay — €amount due** if money remains outstanding.
4. Select individual 1× units by default, or use **Settle full order**.
5. Tap **Confirm €amount**.
6. Tap **Free Table** once the order is ended and fully settled.

### Handle a pending correction

1. Open Active Orders.
2. On a Pending KOT with at least two item lines, use the item minus control to reduce a line by one.
3. If the last remaining item would be removed, confirm the **Cancel Ticket** dialog instead of leaving an empty ticket.
4. Do not expect the correction control after the KOT enters Preparing, Ready, or Served.

---

**Document scope:** This is a reference document only. It does not change application behavior, database records, authentication, permissions, or styling.
