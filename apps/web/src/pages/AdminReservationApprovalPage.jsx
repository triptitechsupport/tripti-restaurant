import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { 
  Check, X, CalendarDays, Clock, Users, AlertCircle, 
  RefreshCw, Search, Filter, ArrowLeft, Hash, Mail
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import apiServerClient from '@/lib/apiServerClient.js';
import { openGmailCompose } from '@/utils/gmailComposer.js';

export default function AdminReservationApprovalPage() {
  const [reservations, setReservations] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [bookingSettings, setBookingSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState([]);
  const [dateReservations, setDateReservations] = useState([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState('');
  
  // Decline Modal State
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [declineMessage, setDeclineMessage] = useState('');
  const [suggestedDate, setSuggestedDate] = useState('');
  const [suggestedTime, setSuggestedTime] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Settings & Time Slots
      const [settingsRes, slotsRes] = await Promise.all([
        pb.collection('booking_settings').getList(1, 1, { $autoCancel: false }),
        pb.collection('time_slots').getFullList({ sort: 'order', $autoCancel: false })
      ]);
      
      if (settingsRes.items.length > 0) {
        setBookingSettings(settingsRes.items[0]);
      }
      setTimeSlots(slotsRes);

      // Fetch Reservations based on filters
      let filterStr = [];
      if (statusFilter !== 'All') {
        filterStr.push(`status="${statusFilter}"`);
      }
      if (dateFilter) {
        const nextDay = new Date(dateFilter);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = format(nextDay, 'yyyy-MM-dd');
        filterStr.push(`reservationDate >= "${dateFilter}" && reservationDate < "${nextDayStr}"`);
      }
      if (searchQuery) {
        filterStr.push(`(reservationCode ~ "${searchQuery}" || guestName ~ "${searchQuery}")`);
      }

      const resData = await pb.collection('table_reservations').getList(1, 100, {
        filter: filterStr.join(' && '),
        sort: 'reservationDate,reservationTime',
        $autoCancel: false
      });
      
      setReservations(resData.items);
    } catch (error) {
      console.error('Error fetching approval data:', error);
      toast.error('Failed to load reservations data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only refetch if search query isn't actively being typed fast (simple debounce could be added, but for now we fetch on blur/enter or rely on specific triggers)
    // For now we'll fetch when filters change. Search query will have its own submit or button.
    fetchData();
  }, [statusFilter, dateFilter]);

  const fetchTables = async () => {
    try {
      const records = await pb.collection('table_configurations').getFullList({ sort: 'room,name', $autoCancel: false });
      setTables(records);
    } catch (error) {
      console.error('Error fetching table configurations:', error);
    }
  };

  const fetchDateReservations = async () => {
    if (!dateFilter) {
      setDateReservations([]);
      return;
    }
    try {
      const nextDay = new Date(dateFilter);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = format(nextDay, 'yyyy-MM-dd');
      const resData = await pb.collection('table_reservations').getFullList({
        filter: `reservationDate >= "${dateFilter}" && reservationDate < "${nextDayStr}"`,
        $autoCancel: false
      });
      setDateReservations(resData);
    } catch (error) {
      console.error('Error fetching date reservations for capacity:', error);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    fetchDateReservations();
  }, [dateFilter]);

  useEffect(() => {
    pb.collection('table_reservations').subscribe('*', function () {
      fetchDateReservations();
    });
    pb.collection('table_configurations').subscribe('*', function () {
      fetchTables();
    });
    return () => {
      pb.collection('table_reservations').unsubscribe('*');
      pb.collection('table_configurations').unsubscribe('*');
    };
  }, [dateFilter]);

  // A table is considered "consumed" by any active (non-declined) reservation on the
  // selected date, whether or not the admin has explicitly assigned a specific table to it.
  // This keeps Available accurate even before manual table assignment happens.
  const activeDateReservations = dateReservations.filter(
    (r) => r.status !== 'Declined' && r.status !== 'Rejected'
  );
  const totalTablesCount = tables.length;
  const assignedTableIds = new Set(
    activeDateReservations.filter((r) => r.assignedTable).map((r) => r.assignedTable)
  );
  const bookedTablesCount = Math.min(totalTablesCount || activeDateReservations.length, activeDateReservations.length);
  const availableTablesCount = Math.max(0, totalTablesCount - bookedTablesCount);

  const tableById = React.useMemo(() => {
    const map = new Map();
    tables.forEach((t) => map.set(t.id, t));
    return map;
  }, [tables]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData();
  };

  const handleApprove = async (reservation) => {
    try {
      setIsProcessing(true);
      
      // 1. Update PocketBase
      await pb.collection('table_reservations').update(reservation.id, {
        status: 'Approved'
      }, { $autoCancel: false });

      // 2. Call API to send email
      await apiServerClient.fetch('/reservations/send-confirmation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: reservation.reservationCode || reservation.id,
          guestName: reservation.guestName,
          guestEmail: reservation.email,
          reservationDate: format(new Date(reservation.reservationDate), 'MMM d, yyyy'),
          reservationTime: reservation.reservationTime,
          numberOfGuests: reservation.numberOfGuests || reservation.partySize,
          restaurantName: 'Tripti Genusswelt',
          restaurantPhone: '+43 664 1219289',
          restaurantAddress: 'Tripti Genusswelt, Austria'
        })
      });

      toast.success('Reservation approved and confirmation email sent.');
      fetchData();
    } catch (error) {
      console.error('Approval error:', error);
      toast.error('Failed to approve reservation');
    } finally {
      setIsProcessing(false);
    }
  };

  const openDeclineModal = (reservation) => {
    setSelectedReservation(reservation);
    setDeclineMessage('Unfortunately, we are fully booked at your requested time.');
    setSuggestedDate(format(new Date(reservation.reservationDate), 'yyyy-MM-dd'));
    setSuggestedTime('');
    setDeclineModalOpen(true);
  };

  const handleDecline = async () => {
    if (!selectedReservation) return;
    
    try {
      setIsProcessing(true);
      
      await pb.collection('table_reservations').update(selectedReservation.id, {
        status: 'Declined',
        adminNotes: declineMessage
      }, { $autoCancel: false });

      await apiServerClient.fetch('/reservations/send-decline-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestEmail: selectedReservation.email,
          guestName: selectedReservation.guestName,
          declineMessage: declineMessage,
          suggestedDate: suggestedDate ? format(new Date(suggestedDate), 'MMM d, yyyy') : '',
          suggestedTime: suggestedTime
        })
      });

      toast.success('Reservation declined and notification email sent.');
      setDeclineModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Decline error:', error);
      toast.error('Failed to decline reservation');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateCapacity = () => {
    if (!bookingSettings) return [];
    
    return timeSlots.map(slot => {
      const slotReservations = reservations.filter(r => 
        r.reservationTime === slot.startTime && 
        r.status !== 'Declined' && r.status !== 'Rejected'
      );
      
      const bookedGuests = slotReservations.reduce((sum, r) => sum + (r.numberOfGuests || r.partySize || 0), 0);
      const bookedTables = slotReservations.length; 
      
      return {
        ...slot,
        bookedGuests,
        bookedTables,
        availableTables: bookingSettings.totalAvailableTables - bookedTables,
        isFull: bookedTables >= bookingSettings.totalAvailableTables || bookedTables >= bookingSettings.maxBookingsPerSlot
      };
    });
  };

  const capacityData = calculateCapacity();

  return (
    <div className="min-h-screen bg-muted/10 pb-12">
      <Helmet>
        <title>Reservation Approvals - Admin</title>
      </Helmet>

      <div className="bg-card border-b px-6 py-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link to="/admin-dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Reservation Approvals</h1>
              <p className="text-sm text-muted-foreground">Review and manage incoming booking requests</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <form onSubmit={handleSearch} className="flex relative w-full sm:w-auto">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Code or Name" 
                className="pl-9 w-full sm:w-48"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <Input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full sm:w-40"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Declined">Declined</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} className="hidden sm:flex">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Main Table Area */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-4 border-b bg-muted/20">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Booking Requests</CardTitle>
                  <CardDescription>
                    Showing {reservations.length} {statusFilter.toLowerCase()} reservations for {dateFilter ? format(new Date(dateFilter), 'MMM d, yyyy') : 'all dates'}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="sm:hidden">
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : reservations.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                  <CalendarDays className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-lg font-medium">No reservations found</p>
                  <p className="text-sm">Try adjusting your filters or search query</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Guest</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Table / Room</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservations.map((res) => {
                        const assignedTable = res.assignedTable ? tableById.get(res.assignedTable) : null;
                        const kidsCount = res.kidsUnder4 ? (res.numberOfKidsUnder4 || 0) : 0;
                        const rowTint = res.status === 'Approved'
                          ? 'bg-emerald-50/50 hover:bg-emerald-50'
                          : res.status === 'Declined'
                          ? 'bg-red-50/40 hover:bg-red-50/60'
                          : 'bg-amber-50/40 hover:bg-amber-50/60';
                        return (
                        <TableRow key={res.id} className={rowTint}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono bg-muted/50 border-border/50 flex items-center gap-1 w-fit">
                              <Hash className="h-3 w-3" />{res.reservationCode || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{res.guestName}</TableCell>
                          <TableCell>
                            <div className="text-sm">{res.email}</div>
                            <div className="text-sm text-muted-foreground">{res.phone}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">
                              {res.reservationDate ? format(new Date(res.reservationDate), 'MMM d, yyyy') : 'N/A'}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" /> <span className="notranslate" translate="no" data-time={res.reservationTime}>{res.reservationTime}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {assignedTable ? (
                              <div className="flex flex-col gap-1">
                                <Badge className="table-assigned-badge w-fit">{assignedTable.name}</Badge>
                                <span className="text-xs text-muted-foreground">{assignedTable.room}{assignedTable.capacity ? ` \u00b7 ${assignedTable.capacity} seats` : ''}</span>
                              </div>
                            ) : (
                              <Badge className="table-unassigned-badge w-fit">Unassigned</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="mb-1">
                              <Users className="h-3 w-3 mr-1" /> {res.numberOfGuests || res.partySize} guests
                            </Badge>
                            {kidsCount > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {kidsCount} kid{kidsCount > 1 ? 's' : ''} under 4
                              </div>
                            )}
                            {res.numberOfChildrenChairs ? (
                              <div className="text-xs text-muted-foreground mt-1">
                                {res.numberOfChildrenChairs} child chair{res.numberOfChildrenChairs > 1 ? 's' : ''} needed
                              </div>
                            ) : null}
                            {res.chairsAdjustment && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Note: {res.chairsAdjustment}
                              </div>
                            )}
                            {res.adminNotes && (
                              <div className="text-xs text-muted-foreground mt-1 italic">
                                {res.adminNotes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={res.status === 'Approved' ? 'default' : res.status === 'Declined' ? 'destructive' : 'secondary'}
                              className={res.status === 'Approved' ? 'bg-emerald-500 hover:bg-emerald-600' : res.status === 'Declined' ? '' : 'bg-amber-500/90 hover:bg-amber-500 text-white'}
                            >
                              {res.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 flex-wrap">
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="border-blue-200 text-blue-600 hover:bg-blue-50"
                                onClick={() => openGmailCompose(res, res.status.toLowerCase(), tableById.get(res.assignedTable))}
                                title="Send email to guest"
                              >
                                <Mail className="h-4 w-4 mr-1" /> Email
                              </Button>
                              {res.status === 'Pending' && (
                                <>
                                  <Button 
                                    size="sm" 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => handleApprove(res)}
                                    disabled={isProcessing}
                                  >
                                    <Check className="h-4 w-4 mr-1" /> Approve
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => openDeclineModal(res)}
                                    disabled={isProcessing}
                                  >
                                    <X className="h-4 w-4 mr-1" /> Decline
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Capacity View */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm border-border sticky top-24">
            <CardHeader className="pb-4 border-b bg-muted/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Daily Capacity
              </CardTitle>
              <CardDescription>
                {dateFilter ? format(new Date(dateFilter), 'MMM d, yyyy') : 'Select a date'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {totalTablesCount === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No tables configured yet. Add tables in the Tables tab.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">{totalTablesCount}</div>
                      <div className="text-[11px] text-muted-foreground font-medium mt-0.5">Total Tables</div>
                    </div>
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-center">
                      <div className="text-2xl font-bold text-red-700">{bookedTablesCount}</div>
                      <div className="text-[11px] text-red-700/80 font-medium mt-0.5">Booked</div>
                    </div>
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-700">{availableTablesCount}</div>
                      <div className="text-[11px] text-emerald-700/80 font-medium mt-0.5">Available</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${bookedTablesCount >= totalTablesCount ? 'bg-destructive' : 'bg-emerald-500'}`}
                      style={{ width: `${totalTablesCount ? Math.min(100, (bookedTablesCount / totalTablesCount) * 100) : 0}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                    <span>Tables explicitly assigned</span>
                    <Badge variant="outline" className="font-mono">{assignedTableIds.size} / {activeDateReservations.length}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Booked counts every active (Pending or Approved) reservation for this date, whether or not a specific table has been assigned yet.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Decline Modal */}
      <Dialog open={declineModalOpen} onOpenChange={setDeclineModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Decline Reservation</DialogTitle>
            <DialogDescription>
              Send a notification to {selectedReservation?.guestName} explaining why the reservation cannot be accepted.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Message to Guest</label>
              <Textarea 
                value={declineMessage}
                onChange={(e) => setDeclineMessage(e.target.value)}
                placeholder="Explain why the reservation is declined..."
                className="min-h-[100px]"
              />
            </div>
            
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-3">Suggest Alternative Time (Optional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Date</label>
                  <Input 
                    type="date" 
                    value={suggestedDate}
                    onChange={(e) => setSuggestedDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Time</label>
                  <Select value={suggestedTime} onValueChange={setSuggestedTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map(slot => (
                        <SelectItem key={slot.id} value={slot.startTime}>{slot.startTime}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineModalOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDecline} disabled={isProcessing || !declineMessage}>
              {isProcessing ? 'Processing...' : 'Decline & Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}