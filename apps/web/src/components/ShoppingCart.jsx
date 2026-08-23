import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart as ShoppingCartIcon, X, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import pb from '@/lib/pocketbaseClient.js';
import { formatCurrency } from '@/api/EcommerceApi.js';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

const ShoppingCart = ({ isCartOpen, setIsCartOpen }) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { cartItems, removeFromCart, updateQuantity, getCartTotal } = useCart();
  
  const [orderSettings, setOrderSettings] = useState(null);
  const [isOrderAvailable, setIsOrderAvailable] = useState(true);

  useEffect(() => {
    if (!isCartOpen) return;

    const fetchSettings = async () => {
      try {
        const records = await pb.collection('order_settings').getFullList({ $autoCancel: false });
        if (records.length > 0) {
          const settings = records[0];
          setOrderSettings(settings);
          
          if (!settings.ordersEnabled) {
            setIsOrderAvailable(false);
            return;
          }

          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          
          const [startH, startM] = settings.startTime.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          
          const [endH, endM] = settings.endTime.split(':').map(Number);
          const endMinutes = endH * 60 + endM;

          setIsOrderAvailable(currentMinutes >= startMinutes && currentMinutes <= endMinutes);
        }
      } catch (err) {
        console.error('Failed to fetch order settings:', err);
      }
    };
    fetchSettings();
  }, [isCartOpen]);

  const handleCheckout = useCallback(() => {
    if (!isOrderAvailable) {
      toast({
        title: t('ordersUnavailableTitle'),
        description: t('ordersUnavailableDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (cartItems.length === 0) {
      toast({
        title: t('cartEmptyToastTitle'),
        description: t('cartEmptyToastDesc'),
        variant: 'destructive',
      });
      return;
    }

    setIsCartOpen(false);
    navigate('/checkout');
  }, [cartItems, isOrderAvailable, navigate, setIsCartOpen, toast]);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-foreground/60 z-[100]"
          onClick={() => setIsCartOpen(false)}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-card text-card-foreground shadow-2xl flex flex-col rounded-l-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-2xl font-bold text-card-foreground">{t('shoppingCartTitle')}</h2>
              <Button onClick={() => setIsCartOpen(false)} variant="ghost" size="icon" className="text-card-foreground hover:bg-muted">
                <X />
              </Button>
            </div>
            
            {!isOrderAvailable && (
              <div className="mx-6 mt-6 bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-3 text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">{t('ordersCurrentlyUnavailable')}</h3>
                  <p className="text-sm mt-1 opacity-90">
                    {orderSettings && !orderSettings.ordersEnabled
                      ? t('onlineOrderingDisabled')
                      : `${t('ordersAcceptBetweenPrefix')} ${orderSettings?.startTime} ${orderSettings?.endTime}${t('ordersAcceptBetweenSuffix')}`}
                  </p>
                </div>
              </div>
            )}

            <div className="flex-grow p-6 overflow-y-auto space-y-4">
              {cartItems.length === 0 ? (
                <div className="text-center text-muted-foreground h-full flex flex-col items-center justify-center">
                  <ShoppingCartIcon size={48} className="mb-4 opacity-20" />
                  <p>{t('cartEmpty')}</p>
                </div>
              ) : (
                cartItems.map(item => (
                  <div key={item.id} className="flex items-center gap-4 bg-card border border-border p-3 rounded-lg shadow-sm">
                    {item.image ? (
                      <img src={pb.files.getURL(item, item.image, { thumb: '100x100' })} alt={item.name} className="w-20 h-20 object-cover rounded-md bg-muted" />
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded-md flex items-center justify-center">
                        <ShoppingCartIcon className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="flex-grow">
                      <h3 className="font-semibold text-card-foreground text-sm line-clamp-1">{item.name}</h3>
                      <p className="text-sm text-primary font-bold">
                        {formatCurrency(item.price * 100, { currency: 'EUR' })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center border border-border rounded-md">
                        <Button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} size="sm" variant="ghost" className="h-7 w-7 p-0 text-card-foreground hover:bg-muted">-</Button>
                        <span className="w-6 text-center text-sm font-medium text-card-foreground">{item.quantity}</span>
                        <Button onClick={() => updateQuantity(item.id, item.quantity + 1)} size="sm" variant="ghost" className="h-7 w-7 p-0 text-card-foreground hover:bg-muted">+</Button>
                      </div>
                      <Button onClick={() => removeFromCart(item.id)} size="sm" variant="ghost" className="h-auto p-0 text-destructive hover:text-destructive/90 hover:bg-transparent text-xs">{t('remove')}</Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cartItems.length > 0 && (
              <div className="p-6 border-t border-border bg-card">
                <div className="flex justify-between items-center mb-4 text-card-foreground">
                  <span className="text-lg font-medium">{t('total')}</span>
                  <span className="text-2xl font-bold">{formatCurrency(getCartTotal() * 100, { currency: 'EUR' })}</span>
                </div>
                <Button 
                  onClick={handleCheckout} 
                  disabled={!isOrderAvailable}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-md active:scale-[0.98] transition-all"
                >
                  {isOrderAvailable ? t('proceedToCheckout') : t('ordersUnavailableTitle')}
                </Button>
                <div className="mt-3 text-center">
                  <Button variant="link" onClick={() => { setIsCartOpen(false); navigate('/cart'); }} className="text-sm text-muted-foreground hover:text-primary">
                    {t('viewFullCart')}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShoppingCart;