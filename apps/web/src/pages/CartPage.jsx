import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '@/hooks/useCart.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button';
import pb from '@/lib/pocketbaseClient.js';

export default function CartPage() {
  const { cartItems, removeFromCart, updateQuantity, getCartTotal } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const total = getCartTotal();

  if (cartItems.length === 0) {
    return (
      <>
        <Helmet>
          <title>{t('cartTitle')} - Tripti Genusswelt</title>
        </Helmet>
        <main className="flex-1 flex flex-col items-center justify-center py-20 px-4 bg-background">
          <div className="bg-muted/30 p-8 rounded-full mb-6">
            <ShoppingBag className="w-16 h-16 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-4">{t('emptyCart')}</h1>
          <p className="text-muted-foreground mb-8 text-center max-w-md">
            {t('emptyCartMessage') || 'Looks like you haven\'t added any delicious dishes to your cart yet.'}
          </p>
          <Link to="/menu?order=1">
            <Button size="lg" className="rounded-full px-8 shadow-md">
              {t('exploreMenu')}
            </Button>
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t('cartTitle')} - Tripti Genusswelt</title>
      </Helmet>
      <main className="py-12 md:py-20 bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-8">{t('cartTitle')}</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              <div className="lg:col-span-2 space-y-4">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-card border rounded-2xl shadow-sm">
                    <div className="w-full sm:w-24 h-24 rounded-xl overflow-hidden bg-muted shrink-0">
                      <img 
                        src={item.image ? pb.files.getURL(item, item.image, { thumb: '100x100' }) : 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=100&h=100&fit=crop'} 
                        alt={t(item.name)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-foreground truncate">{t(item.name)}</h3>
                      <p className="text-primary font-bold mt-1">€{item.price.toFixed(2)}</p>
                    </div>

                    <div className="flex items-center justify-between w-full sm:w-auto gap-4 mt-2 sm:mt-0">
                      <div className="flex items-center bg-muted rounded-lg p-1">
                        <button 
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="p-1.5 hover:bg-background rounded-md transition-colors text-foreground"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-1.5 hover:bg-background rounded-md transition-colors text-foreground"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-1">
                <div className="bg-card border rounded-2xl p-6 shadow-sm sticky top-24">
                  <h2 className="text-xl font-semibold text-foreground mb-6">{t('orderSummary')}</h2>
                  
                  <div className="space-y-4 text-sm mb-6">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('subtotal')}</span>
                      <span>€{total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('taxesIncluded')}</span>
                      <span>€0.00</span>
                    </div>
                    <div className="border-t pt-4 flex justify-between items-center">
                      <span className="text-base font-bold text-foreground">{t('total')}</span>
                      <span className="text-2xl font-bold text-primary">€{total.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full h-12 text-base rounded-xl shadow-md group"
                    onClick={() => navigate('/checkout')}
                  >
                    {t('proceedToCheckout')}
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  
                  <div className="mt-4 text-center">
                    <Link to="/menu?order=1" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      {t('continueShopping')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </>
  );
}