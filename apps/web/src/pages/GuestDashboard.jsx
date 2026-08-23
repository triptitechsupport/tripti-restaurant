import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { LogOut, Calendar, ShoppingBag, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';

export default function GuestDashboard() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!currentUser || currentUser.collectionName !== 'guests') {
      navigate('/guest-login');
      return;
    }

    const fetchGuestData = async () => {
      try {
        const guestRecord = await pb.collection('guests').getOne(currentUser.id, { $autoCancel: false });
        setGuest(guestRecord);

        const resRecords = await pb.collection('table_reservations').getList(1, 50, {
          filter: `email="${guestRecord.email}" || phone="${guestRecord.phone || 'N/A'}"`,
          sort: '-reservationDate',
          $autoCancel: false
        });
        setReservations(resRecords.items);

        const orderRecords = await pb.collection('orders').getList(1, 50, {
          filter: `customerEmail="${guestRecord.email}" || customerPhone="${guestRecord.phone || 'N/A'}"`,
          sort: '-created',
          $autoCancel: false
        });
        setOrders(orderRecords.items);

      } catch (error) {
        toast.error('Could not load your dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchGuestData();
  }, [currentUser, navigate]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'approved':
      case 'completed':
        return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'rejected':
      case 'failed':
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  return (
    <>
      <Helmet>
        <title>My Dashboard - Tripti Genusswelt</title>
      </Helmet>

      <main className="h-full bg-muted/10 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 bg-card p-8 rounded-3xl border border-border/50 shadow-sm">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2">My Dashboard</h1>
              <p className="text-muted-foreground flex items-center gap-2">
                Guest ID: <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{guest?.guestId || '...'}</span>
              </p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>

          {loading ? (
            <div className="space-y-8">
              <Skeleton className="h-64 w-full rounded-3xl" />
              <Skeleton className="h-64 w-full rounded-3xl" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              <section className="bg-card rounded-3xl border border-border/50 p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2.5 bg-secondary/10 rounded-xl text-secondary">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold text-foreground">My Reservations</h2>
                </div>

                {reservations.length === 0 ? (
                  <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed border-border">
                    <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No reservations found.</p>
                    <Button variant="link" onClick={() => navigate('/reservations')} className="mt-4 text-primary">
                      Reserve a Table
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reservations.map(res => (
                      <div key={res.id} className="p-5 rounded-2xl border border-border/50 bg-background hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-semibold text-foreground text-lg">
                              {format(new Date(res.reservationDate), 'MMMM d, yyyy')}
                            </p>
                            <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
                              <Clock className="w-4 h-4" /> <span className="notranslate" translate="no" data-time={res.reservationTime}>{res.reservationTime}</span>
                            </p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(res.status)}`}>
                            {res.status || 'Pending'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-border/50">
                          <p className="text-sm font-medium text-foreground">
                            Party of {res.numberOfGuests}
                          </p>
                          {res.status === 'Pending' && (
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 h-8">
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-card rounded-3xl border border-border/50 p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold text-foreground">My Orders</h2>
                </div>

                {orders.length === 0 ? (
                  <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed border-border">
                    <ShoppingBag className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No orders found.</p>
                    <Button variant="link" onClick={() => navigate('/menu')} className="mt-4 text-primary">
                      Browse Menu
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div key={order.id} className="p-5 rounded-2xl border border-border/50 bg-background hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-semibold text-foreground text-lg">
                              Order #{order.orderNumber}
                            </p>
                            <p className="text-muted-foreground text-sm mt-1">
                              {format(new Date(order.created), 'MMM d, yyyy • h:mm a')}
                            </p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(order.paymentStatus)}`}>
                            {order.paymentStatus || 'Pending'}
                          </span>
                        </div>
                        <div className="pt-4 border-t border-border/50">
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">
                              {order.items?.length || 0} items
                            </p>
                            <p className="font-bold text-primary text-lg">
                              €{order.totalPrice?.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          )}
        </div>
      </main>
    </>
  );
}