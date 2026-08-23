import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation, useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, CalendarDays, Clock, Users, User, Phone, ArrowRight, Mail, Hash } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import pb from '@/lib/pocketbaseClient.js';

export default function ReservationConfirmationPage() {
  const { t } = useLanguage();
  const { code } = useParams();
  const location = useLocation();
  
  const [reservation, setReservation] = useState(location.state?.reservation || null);
  const [loading, setLoading] = useState(!reservation);

  useEffect(() => {
    if (!reservation && code) {
      // Fallback: try to fetch by reservationCode if accessed directly or refreshed
      pb.collection('table_reservations').getFirstListItem(`reservationCode="${code}"`, { $autoCancel: false })
        .then(data => {
          setReservation(data);
        })
        .catch(err => {
          console.error('Could not fetch reservation. Note: Guests may not have read permissions.', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [code, reservation]);

  return (
    <>
      <Helmet>
        <title>Request Received - Triptigenusswelt</title>
      </Helmet>

      <main className="h-full min-h-[calc(100vh-4rem)] py-16 md:py-24 bg-muted/30 flex items-center justify-center">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="bg-card border rounded-3xl p-8 md:p-12 shadow-lg text-center animate-in fade-in zoom-in duration-500">
            <div className="mx-auto w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 ring-8 ring-primary/5">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4 text-foreground tracking-tight text-balance">
              Request Received
            </h1>
            
            <div className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto leading-relaxed">
              <p>
                Thank you, <span className="font-medium text-foreground">{reservation?.guestName || 'Guest'}</span>! Your reservation request has been received.
              </p>
              {reservation?.email && (
                <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-center gap-3">
                  <Mail className="w-5 h-5 text-primary" />
                  <span className="text-foreground text-sm sm:text-base">
                    A confirmation email will be sent to <strong className="font-semibold">{reservation.email}</strong>.
                  </span>
                </div>
              )}
              <p className="mt-4">
                We will send you a confirmation email shortly.
              </p>
            </div>
            
            {loading ? (
              <div className="bg-muted/20 rounded-2xl p-6 text-left space-y-4 mb-8">
                <div className="grid grid-cols-2 gap-6">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            ) : reservation ? (
              <div className="bg-muted/20 rounded-2xl p-6 md:p-8 text-left space-y-6 mb-8 border shadow-sm">
                <h3 className="font-semibold text-lg text-foreground border-b pb-3">Your Request Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="bg-background rounded-xl p-4 border shadow-sm col-span-1 sm:col-span-2 flex items-center gap-4 bg-primary/5 border-primary/20">
                    <div className="bg-background p-2 rounded-lg border">
                      <Hash className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-0.5">Reservation Code</p>
                      <p className="font-mono text-2xl font-bold text-foreground tracking-widest">{reservation.reservationCode}</p>
                    </div>
                  </div>
                  <div className="bg-background rounded-xl p-4 border shadow-sm">
                    <p className="text-sm text-muted-foreground mb-1">Guests</p>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> {reservation.numberOfGuests || reservation.partySize} Guests
                    </p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border shadow-sm">
                    <p className="text-sm text-muted-foreground mb-1">Date</p>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" /> 
                      {reservation.reservationDate ? format(new Date(reservation.reservationDate), 'MMMM d, yyyy') : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border shadow-sm">
                    <p className="text-sm text-muted-foreground mb-1">Time</p>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" /> <span className="notranslate" translate="no" data-time={reservation.reservationTime}>{reservation.reservationTime}</span>
                    </p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border shadow-sm">
                    <p className="text-sm text-muted-foreground mb-1">Name</p>
                    <p className="font-medium text-foreground flex items-center gap-2 truncate">
                      <User className="w-4 h-4 text-primary shrink-0" /> {reservation.guestName}
                    </p>
                  </div>
                  <div className="bg-background rounded-xl p-4 border shadow-sm sm:col-span-2">
                    <p className="text-sm text-muted-foreground mb-1">Contact</p>
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Phone className="w-4 h-4 text-primary shrink-0" /> {reservation.phone}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 rounded-2xl p-8 text-center mb-8 border border-dashed">
                <p className="text-muted-foreground text-base">
                  Request details are hidden for security, but your booking request is successfully received!
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <Button asChild className="h-12 px-8 text-base bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all hover:-translate-y-0.5">
                <Link to="/">
                  Back to Home
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-8 text-base transition-all hover:-translate-y-0.5 bg-background">
                <Link to="/menu">
                  View Menu <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
            
          </div>
        </div>
      </main>
    </>
  );
}