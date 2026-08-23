import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, CheckCircle2, CreditCard, Banknote } from 'lucide-react';
import { useCart } from '@/hooks/useCart.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

const checkoutSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(5, 'Phone number is required'),
  address: z.string().min(5, 'Delivery address is required'),
  paymentMethod: z.enum(['cash', 'card']),
});

export default function CheckoutPage() {
  const { cartItems, getCartTotal, clearCart } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = getCartTotal();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      paymentMethod: 'cash'
    }
  });

  const paymentMethod = watch('paymentMethod');

  if (cartItems.length === 0) {
    navigate('/cart');
    return null;
  }

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const orderNumber = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
      
      const orderData = {
        customerName: data.fullName,
        customerEmail: data.email,
        customerPhone: data.phone,
        deliveryAddress: data.address,
        items: cartItems.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        totalPrice: total,
        paymentStatus: data.paymentMethod === 'cash' ? 'pending' : 'completed',
        orderNumber: orderNumber,
        estimatedDeliveryTime: '45-60 mins'
      };

      const record = await pb.collection('orders').create(orderData, { $autoCancel: false });
      
      clearCart();
      navigate(`/order-confirmation/${record.id}`, { state: { order: record } });
      toast.success(t('orderConfirmed') || 'Order placed successfully!');
      
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(t('checkoutError') || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('checkoutTitle')} - Tripti Genusswelt</title>
      </Helmet>
      <main className="py-12 md:py-20 bg-background min-h-screen">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-8">{t('checkoutTitle')}</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              <div className="lg:col-span-2">
                <form id="checkout-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                  
                  {/* Delivery Details */}
                  <div className="bg-card border rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">1</span>
                      {t('deliveryDetails')}
                    </h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">{t('fullName')}</Label>
                        <Input id="fullName" {...register('fullName')} className="bg-background" />
                        {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('email')}</Label>
                        <Input id="email" type="email" {...register('email')} className="bg-background" />
                        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                      </div>
                      
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="phone">{t('phone')}</Label>
                        <Input id="phone" type="tel" {...register('phone')} className="bg-background" />
                        {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                      </div>
                      
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="address">{t('deliveryAddress')}</Label>
                        <Input id="address" {...register('address')} className="bg-background" />
                        {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div className="bg-card border rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">2</span>
                      {t('paymentMethod')}
                    </h2>
                    
                    <RadioGroup 
                      defaultValue="cash" 
                      onValueChange={(val) => setValue('paymentMethod', val)}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                      <div className={`border rounded-xl p-4 flex items-start space-x-3 cursor-pointer transition-colors ${paymentMethod === 'cash' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`} onClick={() => setValue('paymentMethod', 'cash')}>
                        <RadioGroupItem value="cash" id="cash" className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor="cash" className="font-semibold text-base cursor-pointer flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-green-600" />
                            {t('cashOnDelivery')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">Pay with cash when your order arrives.</p>
                        </div>
                      </div>
                      
                      <div className={`border rounded-xl p-4 flex items-start space-x-3 cursor-pointer transition-colors ${paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`} onClick={() => setValue('paymentMethod', 'card')}>
                        <RadioGroupItem value="card" id="card" className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor="card" className="font-semibold text-base cursor-pointer flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-blue-600" />
                            {t('payOnline')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">Pay securely with your credit card.</p>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>

                </form>
              </div>

              <div className="lg:col-span-1">
                <div className="bg-card border rounded-2xl p-6 shadow-sm sticky top-24">
                  <h2 className="text-xl font-semibold text-foreground mb-6">{t('orderSummary')}</h2>
                  
                  <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pr-2">
                    {cartItems.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          <span className="font-medium text-foreground">{item.quantity}x</span> {t(item.name)}
                        </span>
                        <span className="font-medium">€{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="space-y-3 text-sm mb-6 border-t pt-4">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('subtotal')}</span>
                      <span>€{total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('deliveryCalculated')}</span>
                      <span>€0.00</span>
                    </div>
                    <div className="border-t pt-4 flex justify-between items-center">
                      <span className="text-base font-bold text-foreground">{t('total')}</span>
                      <span className="text-2xl font-bold text-primary">€{total.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    form="checkout-form"
                    disabled={isSubmitting}
                    className="w-full h-12 text-base rounded-xl shadow-md"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t('processing')}</>
                    ) : (
                      <><CheckCircle2 className="w-5 h-5 mr-2" /> {t('placeOrder')}</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </>
  );
}