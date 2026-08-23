import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, X, Trash2, CalendarX, RefreshCw, AlertCircle, ArrowUpDown, AlertTriangle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import apiServerClient from '@/lib/apiServerClient.js';
import { useTableReservationConfirmation } from '@/hooks/useTableReservationConfirmation.js';
import MobileTableCard from '@/components/MobileTableCard.jsx';
import TableStatusOverview from '@/components/TableStatusOverview.jsx';
import { useIsMobile } from '@/hooks/use-mobile.jsx';
import { cn } from '@/lib/utils';
import { openGmailCompose } from '@/utils/gmailComposer.js';

const STATUS_ORDER = { Pending: 0, Approved: 1, Declined: 2 };

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest Submitted First' },
  { value: 'oldest', label: 'Oldest Submitted First' },
  { value: 'date_desc', label: 'Reservation Date (Newest)' },
  { value: 'date_asc', label: 'Reservation Date (Oldest)' },
  { value: 'guests_desc', label: 'Guest Count (High to Low)' },
  { value: 'guests_asc', label: 'Guest Count (Low to High)' },
  { value: 'status', label: 'Status (Pending First)' },
  { value: 'name_asc', label: 'Guest Name (A-Z)' },
  { value: 'time_asc', label: 'Time (Earliest First)' },
];

export default function AdminTableReservations({ authToken }) {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { sendConfirmationEmail } = useTableReservationConfirmation();
  const isMobile = useIsMobile();
  const [sortBy, setSortBy] = useState('newest');

  const fetchReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiServerClient.fetch('/reservations', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to load reservations');
      }

      const data = await response.json();
      setReservations(data);
    } catch (err) {
      console.error('Failed to fetch reservations:', err);
      setError(err.message || 'Failed to load reservations');
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const records = await pb.collection('table_configurations').getFullList({ sort: 'room,name', $autoCancel: false });
      setTables(records);
    } catch (err) {
      console.error('Failed to fetch table configurations:', err);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchReservations();
      fetchTables();
    }

    pb.collection('table_reservations').subscribe('*', function () {
      fetchReservations();
    });

    pb.collection('table_configurations').subscribe('*', function () {
      fetchTables();
    });

    return () => {
      pb.collection('table_reservations').unsubscribe('*');
      pb.collection('table_configurations').unsubscribe('*');
    };
  }, [authToken]);

  const updateStatus = async (id, newStatus, reservation) => {
    try {
      await pb.collection('table_reservations').update(id, { status: newStatus }, { $autoCancel: false });

      if (newStatus === 'Approved') {
        toast.info('Sending confirmation details...');
        try {
          await sendConfirmationEmail(reservation);
          toast.success('Reservation approved! Confirmation email will be sent.');
        } catch (err) {
          toast.error('Approved, but failed to trigger confirmation email.');
        }
      } else {
        toast.success(`Reservation marked as ${newStatus}`);
      }

      fetchReservations();
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Failed to update reservation status');
    }
  };

  const handleAssignTable = async (id, tableId) => {
    // Optimistic UI update
    setReservations(prev => prev.map(r => r.id === id ? { ...r, assignedTable: tableId } : r));

    try {
      await pb.collection('table_reservations').update(id, { assignedTable: tableId }, { $autoCancel: false });
      toast.success(tableId ? 'Table assigned successfully' : 'Table assignment cleared');
    } catch (err) {
      console.error('Failed to assign table:', err);
      toast.error('Failed to assign table');
      fetchReservations(); // Revert on failure
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this reservation?')) return;
    try {
      await pb.collection('table_reservations').delete(id, { $autoCancel: false });
      toast.success('Reservation deleted successfully');
      fetchReservations();
    } catch (err) {
      console.error('Failed to delete reservation:', err);
      toast.error('Failed to delete reservation');
    }
  };

  const getConflictTableIds = (reservation) => {
    const set = new Set();
    reservations.forEach((r) => {
      if (r.id === reservation.id) return;
      if (r.status === 'Declined') return;
      if (!r.assignedTable) return;
      if (r.reservationDate === reservation.reservationDate && r.reservationTime === reservation.reservationTime) {
        set.add(r.assignedTable);
      }
    });
    return set;
  };

  const sortedReservations = useMemo(() => {
    const list = [...reservations];
    const guestCount = (r) => r.partySize || r.numberOfGuests || 0;

    switch (sortBy) {
      case 'oldest':
        list.sort((a, b) => new Date(a.created || 0) - new Date(b.created || 0));
        break;
      case 'date_desc':
        list.sort((a, b) => new Date(b.reservationDate || 0) - new Date(a.reservationDate || 0) || (b.reservationTime || '').localeCompare(a.reservationTime || ''));
        break;
      case 'date_asc':
        list.sort((a, b) => new Date(a.reservationDate || 0) - new Date(b.reservationDate || 0) || (a.reservationTime || '').localeCompare(b.reservationTime || ''));
        break;
      case 'guests_desc':
        list.sort((a, b) => guestCount(b) - guestCount(a));
        break;
      case 'guests_asc':
        list.sort((a, b) => guestCount(a) - guestCount(b));
        break;
      case 'status':
        list.sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
        break;
      case 'name_asc':
        list.sort((a, b) => (a.guestName || '').localeCompare(b.guestName || ''));
        break;
      case 'time_asc':
        list.sort((a, b) => (a.reservationTime || '').localeCompare(b.reservationTime || ''));
        break;
      case 'newest':
      default:
        list.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
        break;
    }
    return list;
  }, [reservations, sortBy]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Approved</Badge>;
      case 'Declined':
        return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">Declined</Badge>;
      default:
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pending</Badge>;
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-destructive bg-destructive/5 border border-destructive/20 rounded-xl">
        <AlertCircle className="h-10 w-10 mb-3 opacity-50" />
        <p className="mb-4 font-medium">{error}</p>
        <Button variant="outline" onClick={fetchReservations} className="min-h-touch">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TableStatusOverview tables={tables} reservations={reservations} />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-10 w-full sm:w-64">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={fetchReservations} disabled={loading} className="min-h-touch w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : sortedReservations.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-xl shadow-sm text-muted-foreground">
          <CalendarX className="h-12 w-12 mb-4 opacity-20" />
          <p className="font-medium">No reservations found.</p>
        </div>
      ) : isMobile ? (
        // MOBILE CARDS
        <div className="grid grid-cols-1 gap-4">
          {sortedReservations.map((res) => {
            const conflictTables = getConflictTableIds(res);
            return (
            <MobileTableCard
              key={res.id}
              header={
                <div>
                  <div className="font-semibold text-lg text-foreground">{res.guestName}</div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">#{res.reservationCode}</div>
                </div>
              }
              subHeader={
                <div className="text-sm text-muted-foreground font-medium mt-1">
                  {res.reservationDate ? format(new Date(res.reservationDate), 'MMM d, yyyy') : 'N/A'} at <span className="notranslate" translate="no" data-time={res.reservationTime}>{res.reservationTime}</span>
                </div>
              }
              sideContent={
                <>
                  <Badge variant="secondary" className="mb-1 text-sm bg-secondary/30">{res.partySize || res.numberOfGuests} Guests</Badge>
                  {getStatusBadge(res.status)}
                </>
              }
              expandedContent={
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium text-foreground">{res.email}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Phone:</span>
                    <span className="font-medium text-foreground">{res.phone}</span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-muted-foreground">Assigned Table:</span>
                    <Select 
                      value={res.assignedTable || "unassigned"} 
                      onValueChange={(val) => handleAssignTable(res.id, val === "unassigned" ? "" : val)}
                    >
                      <SelectTrigger className={cn("h-8 w-[160px] text-xs focus:ring-1 focus:ring-primary", res.assignedTable ? (conflictTables.has(res.assignedTable) ? "border-2 border-amber-400 bg-amber-50 text-amber-800 font-bold" : "table-assigned-badge") : "table-unassigned-badge")}>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent className="table-dropdown-content">
                        <SelectItem value="unassigned" className="text-muted-foreground italic">Unassigned</SelectItem>
                        {tables.map(table => (
                          <SelectItem key={table.id} value={table.id} className={cn(conflictTables.has(table.id) && "text-amber-700 font-semibold")}>
                            {table.name} ({table.room}{table.capacity ? `, ${table.capacity} seats` : ''}){conflictTables.has(table.id) ? ' \u26A0 Booked' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {res.assignedTable && conflictTables.has(res.assignedTable) && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-md px-2 py-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> This table is also assigned to another reservation at the same time.
                    </div>
                  )}
                  {res.chairsAdjustment && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Chairs Adjustment:</span>
                      <span className="font-medium text-foreground">{res.chairsAdjustment}</span>
                    </div>
                  )}
                </div>
              }
              actions={
                <div className="grid grid-cols-2 gap-3 w-full">
                  <Button 
                    variant="outline" 
                    className="h-12 border-blue-200 text-blue-600 hover:bg-blue-50" 
                    onClick={() => openGmailCompose(res, res.status.toLowerCase())}
                  >
                    <Mail className="h-4 w-4 mr-2" /> Email
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-12 bg-emerald-50/50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                    onClick={() => updateStatus(res.id, 'Approved', res)}
                    disabled={res.status === 'Approved'}
                  >
                    <Check className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-12 bg-red-50/50 text-red-700 border-red-200 hover:bg-red-100" 
                    onClick={() => updateStatus(res.id, 'Declined', res)}
                    disabled={res.status === 'Declined'}
                  >
                    <X className="h-4 w-4 mr-2" /> Reject
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-12 col-span-2 text-destructive border-destructive/20 hover:bg-destructive/10" 
                    onClick={() => handleDelete(res.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2"/> Delete Reservation
                  </Button>
                </div>
              }
            />
            );
          })}
        </div>
      ) : (
        // DESKTOP TABLE
        <Card className="border-border shadow-sm overflow-hidden hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="admin-table-header">
                <TableRow>
                  <TableHead className="py-4">Code</TableHead>
                  <TableHead>Guest Info</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Party Size</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedReservations.map((res) => {
                  const conflictTables = getConflictTableIds(res);
                  return (
                  <TableRow key={res.id} className="admin-table-row">
                    <TableCell>
                      <Badge variant="outline" className="font-mono bg-muted/50 border-border/50">
                        {res.reservationCode || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium py-3 text-foreground">{res.guestName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span className="text-muted-foreground">{res.email}</span>
                        <span className="text-muted-foreground">{res.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span className="text-foreground font-medium">
                          {res.reservationDate ? format(new Date(res.reservationDate), 'MMM d, yyyy') : 'N/A'}
                        </span>
                        <span className="text-muted-foreground notranslate" translate="no" data-time={res.reservationTime}>{res.reservationTime}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-medium bg-secondary/50">
                        {res.partySize || res.numberOfGuests} Guests
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={res.assignedTable || "unassigned"} 
                        onValueChange={(val) => handleAssignTable(res.id, val === "unassigned" ? "" : val)}
                      >
                        <SelectTrigger className={cn("h-9 w-[150px] text-xs font-semibold border focus:ring-1 focus:ring-primary transition-all", res.assignedTable ? (conflictTables.has(res.assignedTable) ? "border-2 border-amber-400 bg-amber-50 text-amber-800" : "table-assigned-badge") : "table-unassigned-badge")}>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent className="table-dropdown-content animate-in fade-in zoom-in-95">
                          <SelectItem value="unassigned" className="text-muted-foreground italic font-medium">Unassigned</SelectItem>
                          {tables.map(table => (
                            <SelectItem key={table.id} value={table.id} className={cn("font-medium", conflictTables.has(table.id) && "text-amber-700 font-bold")}>
                              {table.name} ({table.room}{table.capacity ? `, ${table.capacity} seats` : ''}){conflictTables.has(table.id) ? ' \u26A0 Booked' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {res.assignedTable && conflictTables.has(res.assignedTable) && (
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 mt-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" /> Double-booked
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(res.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 p-0"
                          onClick={() => openGmailCompose(res, res.status.toLowerCase())}
                          title="Send email"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 p-0"
                          onClick={() => updateStatus(res.id, 'Approved', res)}
                          disabled={res.status === 'Approved'}
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 p-0"
                          onClick={() => updateStatus(res.id, 'Declined', res)}
                          disabled={res.status === 'Declined'}
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(res.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
