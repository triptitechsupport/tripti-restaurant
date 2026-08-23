import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Clock, Search, Loader2, ArrowDownUp, CalendarRange, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { formatDuration, formatTimestamp } from '@/utils/timesheetService.js';

const COLLECTION = 'waiter_timesheets';

function waiterName(rec) {
  const w = rec?.expand?.waiter;
  if (!w) return 'Unknown waiter';
  return w.displayName || w.username || w.email || 'Unknown waiter';
}

export default function AdminTimesheetView() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const toInputDate = (d) => {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [startDate, setStartDate] = useState(toInputDate(firstOfMonth));
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [appliedRange, setAppliedRange] = useState({
    start: startDate,
    end: endDate,
  });
  const [waiterFilter, setWaiterFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc'); // desc = newest first
  const [records, setRecords] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load waiter list for the filter dropdown.
  useEffect(() => {
    pb.collection('waiter_users')
      .getFullList({ sort: 'username', $autoCancel: false })
      .then(setWaiters)
      .catch((err) => console.error('[AdminTimesheetView] load waiters failed', err));
  }, []);

  const loadTimesheets = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = appliedRange;
      // Build a filter on clockIn within [start 00:00, end 23:59:59].
      const parts = [];
      if (start) {
        const startIso = new Date(`${start}T00:00:00`).toISOString();
        parts.push(`clockIn >= "${startIso}"`);
      }
      if (end) {
        const endIso = new Date(`${end}T23:59:59`).toISOString();
        parts.push(`clockIn <= "${endIso}"`);
      }
      if (waiterFilter && waiterFilter !== 'all') {
        parts.push(`waiter = "${waiterFilter}"`);
      }
      const filter = parts.length ? parts.join(' && ') : '';

      const sort = sortOrder === 'asc' ? 'clockIn' : '-clockIn';

      const res = await pb.collection(COLLECTION).getFullList({
        filter,
        sort,
        expand: 'waiter',
        $autoCancel: false,
      });
      setRecords(res);
    } catch (err) {
      console.error('[AdminTimesheetView] load failed', err);
      toast.error('Failed to load timesheets');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [appliedRange, waiterFilter, sortOrder]);

  useEffect(() => {
    loadTimesheets();
  }, [loadTimesheets]);

  const applyFilter = () => {
    if (startDate && endDate && startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    setAppliedRange({ start: startDate, end: endDate });
  };

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    setWaiterFilter('all');
    setAppliedRange({ start: '', end: '' });
  };

  // Summary stats for the current view.
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let activeCount = 0;
    let completedCount = 0;
    records.forEach((r) => {
      if (r.clockOut == null) {
        activeCount += 1;
        if (r.clockIn) {
          totalMinutes += Math.max(
            0,
            Math.round((Date.now() - new Date(r.clockIn).getTime()) / 60000)
          );
        }
      } else {
        completedCount += 1;
        if (r.shiftDuration != null) totalMinutes += Number(r.shiftDuration) || 0;
      }
    });
    return { totalMinutes, activeCount, completedCount, shiftCount: records.length };
  }, [records]);

  return (
    <>
      <Helmet>
        <title>Waiter Timesheets - Tripti Genusswelt Admin</title>
      </Helmet>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-primary">Waiter Timesheets</h2>
            <p className="text-sm text-muted-foreground">Track waiter shifts, clock-in/out times and durations.</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Shifts</p>
              <p className="text-2xl font-bold text-primary mt-1">{stats.shiftCount}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-primary mt-1">{stats.completedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.activeCount}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-border rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Hours</p>
              <p className="text-2xl font-bold text-primary mt-1 notranslate" translate="no">{formatDuration(stats.totalMinutes)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-2 border-border rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" /> Filters
            </CardTitle>
            <CardDescription className="text-sm">Filter timesheets by date range and waiter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ts-start" className="text-xs font-bold text-muted-foreground">Start Date</Label>
                <Input
                  id="ts-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ts-end" className="text-xs font-bold text-muted-foreground">End Date</Label>
                <Input
                  id="ts-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Waiter</Label>
                <Select value={waiterFilter} onValueChange={setWaiterFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All waiters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All waiters</SelectItem>
                    {waiters.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.displayName || w.username || w.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Sort (clock-in)</Label>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest first</SelectItem>
                    <SelectItem value="asc">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={applyFilter} className="h-10">
                <Search className="h-4 w-4 mr-2" /> Apply Filter
              </Button>
              <Button onClick={clearFilter} variant="outline" className="h-10">
                Clear
              </Button>
              <Button
                onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
                variant="ghost"
                className="h-10"
                title="Toggle sort order"
              >
                <ArrowDownUp className="h-4 w-4 mr-2" />
                {sortOrder === 'desc' ? 'Newest → Oldest' : 'Oldest → Newest'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-2 border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">Shift Records</CardTitle>
            <CardDescription className="text-sm">
              {loading ? 'Loading…' : `${records.length} record${records.length === 1 ? '' : 's'} matching filters.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No timesheet records found for the selected filters.</p>
              </div>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">Waiter</th>
                        <th className="px-4 py-3 font-semibold">Clock In</th>
                        <th className="px-4 py-3 font-semibold">Clock Out</th>
                        <th className="px-4 py-3 font-semibold">Duration</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {records.map((r) => {
                        const active = r.clockOut == null;
                        return (
                          <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="truncate">{waiterName(r)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground notranslate" translate="no">{formatTimestamp(r.clockIn)}</td>
                            <td className="px-4 py-3 text-muted-foreground notranslate" translate="no">{formatTimestamp(r.clockOut)}</td>
                            <td className="px-4 py-3 font-semibold text-primary notranslate" translate="no">
                              {active
                                ? formatDuration(
                                    Math.max(
                                      0,
                                      Math.round((Date.now() - new Date(r.clockIn).getTime()) / 60000)
                                    )
                                  ) + ' (live)'
                                : formatDuration(r.shiftDuration)}
                            </td>
                            <td className="px-4 py-3">
                              {active ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 px-2.5 py-0.5 text-xs font-bold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> In Progress
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-0.5 text-xs font-bold">
                                  Completed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-border">
                  {records.map((r) => {
                    const active = r.clockOut == null;
                    return (
                      <div key={r.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-foreground truncate">{waiterName(r)}</span>
                          </div>
                          {active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold shrink-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[10px] font-bold shrink-0">
                              Done
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground font-semibold uppercase tracking-wide">Clock In</p>
                            <p className="text-foreground notranslate" translate="no">{formatTimestamp(r.clockIn)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground font-semibold uppercase tracking-wide">Clock Out</p>
                            <p className="text-foreground notranslate" translate="no">{formatTimestamp(r.clockOut)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Duration</span>
                          <span className="text-sm font-bold text-primary notranslate" translate="no">
                            {active
                              ? formatDuration(
                                  Math.max(
                                    0,
                                    Math.round((Date.now() - new Date(r.clockIn).getTime()) / 60000)
                                  )
                                ) + ' (live)'
                              : formatDuration(r.shiftDuration)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
