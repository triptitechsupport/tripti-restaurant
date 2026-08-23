import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';

export default function OrderCard({ order }) {
  const { t } = useLanguage();

  return (
    <div className="rounded-2xl border-2 border-border/50 bg-card p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div>
          <h3 className="text-lg font-serif font-bold text-primary group-hover:text-secondary transition-colors duration-300">{t('orderNumber')}: {order.orderNumber}</h3>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            {new Date(order.created).toLocaleDateString()}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm transition-transform duration-300 group-hover:scale-105 ${
          order.paymentStatus === 'completed' 
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
            : 'bg-muted text-muted-foreground border border-border'
        }`}>
          {order.paymentStatus}
        </span>
      </div>

      <div className="space-y-2 mb-6 relative z-10">
        {order.items.map((item, index) => (
          <div key={index} className="flex justify-between text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
            <span className="font-medium">{item.name} <span className="text-muted-foreground text-xs ml-1">x {item.quantity}</span></span>
            <span className="font-bold text-foreground">€{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t-2 border-border/50 flex justify-between items-center relative z-10">
        <span className="font-bold uppercase tracking-wider text-sm">{t('total')}</span>
        <span className="text-2xl font-bold text-primary tabular-nums">€{order.totalPrice.toFixed(2)}</span>
      </div>

      {order.estimatedDeliveryTime && (
        <div className="mt-4 pt-3 border-t border-border/30 relative z-10">
          <p className="text-sm font-semibold text-secondary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            {t('estimatedDelivery')}: {order.estimatedDeliveryTime}
          </p>
        </div>
      )}
    </div>
  );
}