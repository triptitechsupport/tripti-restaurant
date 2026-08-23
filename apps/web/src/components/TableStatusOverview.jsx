import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { LayoutGrid, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import pb from '@/lib/pocketbaseClient.js';
import { cn } from '@/lib/utils';

export default function TableStatusOverview({ tables, reservations }) {
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeSlots, setTimeSlots] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all');

  useEffect(() => {
    let active = true;
    pb.collection('time_slots').getFullList({ sort: 'order', $autoCancel: false })
      .then((recs) => { if (active) setTimeSlots(recs); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const dayReservations = useMemo(() => {
    return (reservations || []).filter((r) => {
      if (r.status === 'Rejected' || r.status === 'Declined') return false;
      if (!r.reservationDate) return false;
      let rDate;
      try {
        rDate = format(new Date(r.reservationDate), 'yyyy-MM-dd');
      } catch {
        return false;
      }
      if (rDate !== dateFilter) return false;
      if (timeFilter !== 'all' && r.reservationTime !== timeFilter) return false;
      return true;
    });
  }, [reservations, dateFilter, timeFilter]);

  const tableStatusMap = useMemo(() => {
    const map = new Map();
    dayReservations.forEach((r) => {
      if (r.assignedTable) {
        if (!map.has(r.assignedTable)) map.set(r.assignedTable, []);
        map.get(r.assignedTable).push(r);
      }
    });
    return map;
  }, [dayReservations]);

  const unassignedCount = dayReservations.filter((r) => !r.assignedTable).length;
  const bookedTablesCount = tableStatusMap.size;
  const availableTablesCount = Math.max(0, (tables?.length || 0) - bookedTablesCount);

  return (
    <Card className="border-2 border-border shadow-md overflow-hidden">
      <CardHeader className="pb-4 border-b-2 border-border bg-primary/5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-primary font-serif">
              <LayoutGrid className="h-5 w-5" /> Table Status Overview
            </CardTitle>
            <CardDescription className="mt-1">See which tables are booked or available at a glance.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full sm:w-40 h-10"
            />
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-full sm:w-44 h-10">
                <SelectValue placeholder="All Time Slots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time Slots</SelectItem>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot.id} value={slot.startTime}>{slot.name} ({slot.startTime})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border-2 border-border bg-card p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{tables?.length || 0}</div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">Total Tables</div>
          </div>
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{availableTablesCount}</div>
            <div className="text-xs text-emerald-700/80 font-medium mt-0.5">Available</div>
          </div>
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{bookedTablesCount}</div>
            <div className="text-xs text-red-700/80 font-medium mt-0.5">Booked</div>
          </div>
        </div>

        {unassignedCount > 0 && (
          <div className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            {unassignedCount} reservation{unassignedCount > 1 ? 's' : ''} for this date/slot {unassignedCount > 1 ? 'are' : 'is'} not yet assigned to a table.
          </div>
        )}

        {!tables || tables.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            No tables configured yet. Add tables in the Tables tab.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {tables.map((table) => {
              const bookings = tableStatusMap.get(table.id) || [];
              const isBooked = bookings.length > 0;
              return (
                <div
                  key={table.id}
                  className={cn(
                    'rounded-xl border-2 p-3 flex flex-col gap-1.5 transition-colors',
                    isBooked ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-foreground truncate">{table.name}</span>
                    {isBooked ? (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-medium">
                    {table.room}{table.capacity ? ` · seats ${table.capacity}` : ''}
                  </div>
                  {isBooked ? (
                    <div className="mt-1 space-y-1">
                      {bookings.map((b) => (
                        <div key={b.id} className="text-[11px] font-semibold text-red-700 flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            <span className="notranslate" translate="no" data-time={b.reservationTime}>{b.reservationTime}</span> · {b.guestName}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Badge className="mt-1 w-fit text-[10px] bg-emerald-600 hover:bg-emerald-600 text-white border-none">Available</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
