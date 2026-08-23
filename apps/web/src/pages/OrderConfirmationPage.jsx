import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Package, MapPin, Loader2, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { useCart } from '@/hooks/useCart.jsx';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import pb from '@/lib/pocketbaseClient.js';
import { formatCurrency } from '@/api/EcommerceApi.js';

export default function OrderConfirmationPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const { clearCart } = useCart();
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Clear cart on successful order confirmation
    clearCart();

    if (id) {
      // The parameter might be 'stripe' if coming back from successful stripe redirect, 
      // where we would then resolve the order via the session_id query param.
      // But standard Pocketbase fallback uses ID directly. Let's do a basic fetch.
      if (id === 'stripe') {
        // Stripe session return handling would be here via apiServerClient
        // For now just show a generic success since it was already processed.
        setLoading(false);
      } else {
        pb.collection('orders').getOne(id, { $autoCancel: false })
          .then(data => {
            setOrder(data);
          })
          .catch(err => {
            console.error('Could not fetch order details', err);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    } else {
      setLoading(false);
    }
  }, [id, clearCart]);

  return (
    <>
      <Helmet>
        <title>{t('orderConfirmed') || 'Order Confirmed'} - Triptigenusswelt</title>
      </Helmet>

      <main className="h-full py-16 bg-muted/10 flex items-center justify-center">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="bg-card border rounded-3xl p-8 md:p-12 shadow-lg animate-in fade-in zoom-in duration-500 text-center">
            <div className="mx-auto w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4 text-foreground">
              {t('orderConfirmed')}!
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-md mx-auto">
              {t('thankYou')}
            </p>

            {loading ? (
              <div className="bg-muted/30 rounded-2xl p-6 mb-8 text-left space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-10 w-full mt-4" />
              </div>
            ) : order ? (
              <div className="bg-muted/20 border rounded-2xl p-6 md:p-8 text-left mb-8 shadow-sm">
                <div className="flex items-center justify-between border-b pb-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('orderNumber')}</p>
                    <p className="font-mono font-bold text-foreground text-lg">{order.orderNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{t('totalPaid')}</p>
                    <p className="font-bold text-primary text-xl">{formatCurrency(order.totalPrice * 100, { currency: 'EUR' })}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">{t('deliveryAddress')}</p>
                      <p className="text-muted-foreground">{order.deliveryAddress}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <Package className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="w-full">
                      <p className="font-medium text-foreground mb-2">{t('orderItems')}</p>
                      <ul className="space-y-2 w-full">
                        {order.items && Array.isArray(order.items) && order.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between text-sm">
                            <span className="text-muted-foreground"><span className="font-medium text-foreground">{item.quantity}x</span> {item.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 border border-dashed rounded-2xl p-6 mb-8">
                <p className="text-muted-foreground">{t('orderDetailsLoadError')}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild className="h-12 px-8 text-base shadow-md bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link to="/menu">
                  Continue Shopping
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-8 text-base">
                <Link to="/">
                  {t('backToHome')} <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}