import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Search, ShoppingBag, RefreshCw, AlertCircle, MapPin, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import MobileTableCard from '@/components/MobileTableCard.jsx';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

export default function OrderManagementTable() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const isMobile = useIsMobile();

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await pb.collection('orders').getList(1, 500, {
        sort: '-created',
        $autoCancel: false
      });
      setOrders(records.items);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.message || 'Failed to load orders');
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    pb.collection('orders').subscribe('*', function (e) {
      if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
        fetchOrders();
      }
    });

    return () => {
      pb.collection('orders').unsubscribe('*');
    };
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      await pb.collection('orders').update(orderId, { paymentStatus: newStatus }, { $autoCancel: false });
      toast.success(`Order status updated to ${newStatus}`);
      setOrders(orders.map(order => order.id === orderId ? { ...order, paymentStatus: newStatus } : order));
    } catch (err) {
      console.error('Failed to update order status:', err);
      toast.error('Failed to update order status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    setDeletingId(orderId);
    try {
      await pb.collection('orders').delete(orderId, { $autoCancel: false });
      toast.success('Order deleted successfully');
      setOrders(orders.filter(order => order.id !== orderId));
    } catch (err) {
      console.error('Failed to delete order:', err);
      toast.error('Failed to delete order');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredOrders = orders.filter(order => 
    order.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customerEmail?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColorClass = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20';
      case 'failed':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20';
      case 'pending':
      default:
        return 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20';
    }
  };

  const renderItems = (items) => {
    if (!items || !Array.isArray(items)) return <span className="text-muted-foreground italic">No items</span>;
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start text-sm">
            <span className="font-medium text-foreground mr-2 shrink-0">{item.quantity}x</span>
            <span className="text-muted-foreground leading-tight">{item.name}</span>
          </div>
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-destructive bg-destructive/5 border border-destructive/20 rounded-xl">
        <AlertCircle className="h-10 w-10 mb-3 opacity-50" />
        <p className="mb-4 font-medium">{error}</p>
        <Button variant="outline" onClick={fetchOrders} className="min-h-touch">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-3 md:gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search orders..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card min-h-touch"
          />
        </div>
        <Button variant="outline" onClick={fetchOrders} disabled={loading} className="shrink-0 min-h-touch">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-xl shadow-sm text-muted-foreground">
          <ShoppingBag className="h-12 w-12 mb-4 opacity-20" />
          <p className="font-medium">No orders found.</p>
        </div>
      ) : isMobile ? (
        // MOBILE CARD LAYOUT
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map(order => (
            <MobileTableCard
              key={order.id}
              header={<div className="font-mono text-sm font-bold text-foreground">{order.orderNumber || order.id.slice(0, 8)}</div>}
              subHeader={<div className="text-base font-medium text-foreground">{order.customerName}</div>}
              sideContent={
                <>
                  <div className="font-bold text-primary text-lg">€{order.totalPrice?.toFixed(2)}</div>
                  <Badge variant="outline" className={getStatusColorClass(order.paymentStatus || 'pending')}>
                    {(order.paymentStatus || 'pending').toUpperCase()}
                  </Badge>
                </>
              }
              expandedContent={
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block mb-1">Date & Time</span>
                      <span className="font-medium">{format(new Date(order.created), 'MMM d, yyyy HH:mm')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Contact</span>
                      <span className="font-medium block truncate" title={order.customerEmail}>{order.customerEmail}</span>
                      <span className="font-medium">{order.customerPhone || 'N/A'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Delivery Address</span>
                    <span className="font-medium text-sm">{order.deliveryAddress || 'N/A'}</span>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground block mb-2">Order Items</span>
                    {renderItems(order.items)}
                  </div>
                </div>
              }
              actions={
                <div className="flex flex-col gap-3 w-full">
                  <Select 
                    value={order.paymentStatus || 'pending'} 
                    onValueChange={(val) => handleStatusChange(order.id, val)}
                    disabled={updatingId === order.id || deletingId === order.id}
                  >
                    <SelectTrigger className="w-full h-12 bg-background">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending" className="text-destructive font-medium">Pending</SelectItem>
                      <SelectItem value="completed" className="text-emerald-600 font-medium">Completed</SelectItem>
                      <SelectItem value="failed" className="text-orange-600 font-medium">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full h-12 text-destructive border-destructive/20 hover:bg-destructive/10" disabled={deletingId === order.id}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete Order
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="modal-mobile-safe">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Order</AlertDialogTitle>
                        <AlertDialogDescription>Are you sure you want to delete this order? This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
                        <AlertDialogCancel className="h-12 sm:h-10 mt-0">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteOrder(order.id)} className="h-12 sm:h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        // DESKTOP TABLE LAYOUT
        <Card className="border-border shadow-sm overflow-hidden hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="py-4 w-[120px]">Order ID</TableHead>
                    <TableHead className="w-[180px]">Customer</TableHead>
                    <TableHead className="w-[200px]">Delivery Address</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="w-[120px]">Total</TableHead>
                    <TableHead className="w-[190px]">Status</TableHead>
                    <TableHead className="text-right w-[160px]">Date & Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium font-mono text-sm">
                        {order.orderNumber || order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-sm">{order.customerName}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={order.customerEmail}>
                            {order.customerEmail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                          <span className="line-clamp-2" title={order.deliveryAddress}>
                            {order.deliveryAddress || 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {renderItems(order.items)}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        €{order.totalPrice?.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select 
                            value={order.paymentStatus || 'pending'} 
                            onValueChange={(val) => handleStatusChange(order.id, val)}
                            disabled={updatingId === order.id || deletingId === order.id}
                          >
                            <SelectTrigger className={`h-9 w-[130px] text-xs font-semibold border ${getStatusColorClass(order.paymentStatus || 'pending')}`}>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending" className="text-destructive font-medium">Pending</SelectItem>
                              <SelectItem value="completed" className="text-emerald-600 font-medium">Completed</SelectItem>
                              <SelectItem value="failed" className="text-orange-600 font-medium">Failed</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 transition-colors"
                                disabled={deletingId === order.id}
                                title="Delete Order"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="modal-mobile-safe">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Order</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this order? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteOrder(order.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-foreground">{format(new Date(order.created), 'MMM d, yyyy')}</span>
                          <span className="text-xs">{format(new Date(order.created), 'HH:mm')}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}