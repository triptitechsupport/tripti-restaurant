import React from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

// Routes where the WhatsApp button must be hidden (it overlaps the staff chat).
const HIDDEN_PATHS = ['/waiter-dashboard', '/kds-dashboard', '/admin-dashboard', '/admin'];

export default function WhatsAppButton() {
  const location = useLocation();
  if (HIDDEN_PATHS.some((p) => location.pathname.startsWith(p))) {
    return null;
  }

  const phoneNumber = "436641219289";
  const message = "Hi, I would like to make a reservation at Tripti Genusswelt";

  const handleWhatsAppClick = () => {
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button 
      onClick={handleWhatsAppClick}
      className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[9999] flex items-center justify-center bg-[#25D366] hover:bg-[#128C7E] text-white p-3.5 md:p-4 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 active:scale-95 group"
      aria-label="Contact us on WhatsApp"
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7" />
    </button>
  );
}