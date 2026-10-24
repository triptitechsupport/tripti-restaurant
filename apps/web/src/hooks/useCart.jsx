import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cart') || '[]');
      return Array.isArray(saved) ? saved.filter((i) => i && i.id && i.quantity > 0) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try { localStorage.setItem('cart', JSON.stringify(cartItems)); } catch { /* storage full or blocked */ }
  }, [cartItems]);

  // A saved cart can point at dishes that no longer exist (the menu was
  // re-created, or a dish was removed). Match those again by name, take the
  // current price, and drop what can't be found, so checkout doesn't fail.
  useEffect(() => {
    if (!cartItems.length) return undefined;
    let alive = true;
    (async () => {
      let menu;
      try {
        menu = await pb.collection('menu_items').getFullList({
          fields: 'id,name,nameDE,nameEN,price,availability,pickupBlocked',
          $autoCancel: false,
        });
      } catch {
        return; // offline: keep the cart as it is
      }
      if (!alive || !menu.length) return;
      const byId = new Map(menu.map((m) => [m.id, m]));
      const key = (x) => String(x || '').trim().toLowerCase();
      const byName = new Map();
      menu.forEach((m) => [m.nameDE, m.nameEN, m.name].forEach((n) => { if (key(n) && !byName.has(key(n))) byName.set(key(n), m); }));
      setCartItems((prev) => {
        let dropped = 0;
        let changed = false;
        const out = [];
        prev.forEach((item) => {
          const m = byId.get(item.id)
            || byName.get(key(item.nameDE)) || byName.get(key(item.nameEN)) || byName.get(key(item.name));
          if (!m || m.availability === false) { dropped += 1; changed = true; return; }
          const price = Number(m.price) || 0;
          if (m.id !== item.id || price !== Number(item.price)) changed = true;
          const twin = out.find((o) => o.id === m.id);
          if (twin) { twin.quantity += item.quantity; changed = true; return; }
          out.push({ ...item, id: m.id, price, nameDE: m.nameDE, nameEN: m.nameEN, pickupBlocked: m.pickupBlocked });
        });
        if (dropped) {
          const en = localStorage.getItem('language') === 'en';
          toast.info(en
            ? `${dropped} dish(es) in your cart are no longer on the menu and were removed.`
            : `${dropped} Gericht(e) im Warenkorb gibt es nicht mehr und wurden entfernt.`);
        }
        return changed ? out : prev;
      });
    })();
    return () => { alive = false; };
    // Check once per page load, not on every cart change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToCart = (item) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => 
          i.id === item.id 
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCartItems(prev => prev.filter(i => i.id !== itemId));
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCartItems(prev => 
      prev.map(i => i.id === itemId ? { ...i, quantity } : i)
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const getCartTotal = () => {
    return cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  return (
    <CartContext.Provider value={{ 
      cartItems, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      clearCart, 
      getCartTotal 
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}