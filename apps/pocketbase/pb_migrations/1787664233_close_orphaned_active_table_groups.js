/// <reference path="../pb_data/types.d.ts" />

// One-time cleanup: close orphaned `table_groups` records that are still
// marked status='active' but have NO active `table_group_members` rows.
//
// The previous cleanup migration (1787664000_cleanup_stale_table_group_members)
// deactivated stale member rows (members whose parent group was closed or
// whose parent order was freed), but it did NOT close the parent group
// records. That left orphaned groups with status='active' and zero active
// members — e.g. group "Tables T1 + T2" whose only order (WI00065) was
// freed and whose members were all deactivated, yet the group itself stayed
// 'active'.
//
// An active group with no active members is an inconsistent state: the
// waiter UI's `activeCombinationTableNumbers` (member-based) is already
// empty so the dropdown "Combined" label is gone, but the Active-tab
// Combine Tables headings (group-status-based) still show the phantom
// combination, and `releaseTableFromCombination` early-returns on
// non-active groups so the group can never be cleaned up by the normal
// flow. This migration closes every such orphan so the group state matches
// the member state.

migrate(
  (app) => {
    const groups = app.findAllRecords("table_groups");
    let closed = 0;

    for (const g of groups) {
      if (g.getString("status") !== "active") continue;

      // Count active members belonging to this group.
      let activeCount = 0;
      try {
        const activeMembers = app.findRecordsByFilter(
          "table_group_members",
          "tableGroup = {:gid} && isActive = true",
          { gid: g.id },
        );
        activeCount = activeMembers ? activeMembers.length : 0;
      } catch (e) {
        // No rows / filter error -> treat as zero active members.
        activeCount = 0;
      }

      if (activeCount === 0) {
        g.set("status", "closed");
        app.save(g);
        closed++;
      }
    }

    console.log(
      "[close_orphaned_active_table_groups] closed " +
        closed +
        " orphaned active group(s) with no active members.",
    );
  },
  (app) => {
    // One-way data cleanup; no automatic rollback (re-opening a group that
    // was correctly closed would reintroduce the inconsistent state).
  },
);
