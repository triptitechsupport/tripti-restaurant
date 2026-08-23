import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { format } from 'date-fns';
import { CalendarPlus as CalendarIcon, Clock, Users, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

const isTimeSlotValid = (selectedDate, timeString) => {
  if (!selectedDate || !timeString) return true;
  const now = new Date();
  const [hours, minutes] = timeString.split(':').map(Number);
  const slotDate = new Date(selectedDate);
  slotDate.setHours(hours, minutes, 0, 0);

  const diffInMinutes = (slotDate.getTime() - now.getTime()) / (1000 * 60);
  return diffInMinutes >= 15;
};

const TIME_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"
];

export default function TableReservationPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closedWeekday, setClosedWeekday] = useState(3); // default Wednesday
  const [closedDates, setClosedDates] = useState([]);

  useEffect(() => {
    pb.collection('restaurant_hours').getList(1, 1, { $autoCancel: false })
      .then(res => { if (res.items.length > 0) setClosedWeekday(res.items[0].closedWeekday ?? 3); })
      .catch(() => { });
    pb.collection('closed_dates').getFullList({ $autoCancel: false })
      .then(setClosedDates)
      .catch(() => { });
  }, []);

  const reservationSchema = useMemo(() => z.object({
    guestName: z.string().min(2, t('guestNameErr')),
    email: z.string().email(t('emailErr')),
    phone: z.string().refine(
      (val) => val && isValidPhoneNumber(val),
      { message: t('phoneErr') }
    ),

    date: z.date({ required_error: t('dateErr') }),
    time: z.string().min(1, t('timeErr')),
    guests: z.string().min(1, t('guestsErr')),
    kidsUnder3: z.boolean().default(false),
    specialRequests: z.string().max(250, 'Max 250 characters').optional(),
  }).superRefine((data, ctx) => {
    if (data.date && data.time) {
      if (!isTimeSlotValid(data.date, data.time)) {
        ctx.addIssue({
          path: ['time'],
          message: 'Please select a time at least 15 minutes from now',
          code: z.ZodIssueCode.custom,
        });
      }
    }
  }), [t, language]);

  const { register, handleSubmit, control, formState: { errors }, setValue, watch, trigger } = useForm({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      kidsUnder3: false,
      specialRequests: '',
    }
  });

  const selectedDate = watch('date');
  const selectedTime = watch('time');
  const kidsUnder3 = watch('kidsUnder3');
  const specialRequests = watch('specialRequests') || '';

  const handleDateSelect = (date) => {
    setValue('date', date, { shouldValidate: true });
    if (selectedTime) {
      trigger('time');
    }
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const reservationData = {
        guestName: data.guestName,
        email: data.email,
        phone: data.phone,
        reservationDate: format(data.date, 'yyyy-MM-dd') + ' 12:00:00.000Z',
        reservationTime: data.time,
        numberOfGuests: parseInt(data.guests, 10),
        partySize: parseInt(data.guests, 10),
        status: 'Pending',
        paymentStatus: 'unpaid',
        childrenChairsNeeded: false,
        numberOfChildrenChairs: 0,
        kidsUnder3: data.kidsUnder3,
        specialRequests: data.specialRequests || '',
      };

      const record = await pb.collection('table_reservations').create(reservationData, { $autoCancel: false });

      const generatedCode = record.reservationCode || record.id;

      navigate(`/reservation-confirmation/${generatedCode}`, { state: { reservation: record } });
      toast.success(t('reservationSuccess') || 'Reservation request submitted successfully!');

    } catch (error) {
      console.error('Reservation error:', error);
      toast.error(t('reservationError') || 'Failed to submit reservation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('bookTable') || 'Reserve Table'} - Tripti Genusswelt</title>
      </Helmet>

      <main className="py-12 md:py-24 bg-background min-h-screen relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 indian-decorative-border-burgundy"></div>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center mb-12"
          >
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl md:text-6xl font-serif font-bold text-primary mb-6 drop-shadow-sm"
            >
              {t('bookTable') || 'Reserve Table'}
            </motion.h1>
            <div className="w-24 h-1.5 bg-secondary mx-auto rounded-full mb-6 shadow-sm animate-pulse-glow" />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-muted-foreground text-lg md:text-xl font-medium max-w-xl mx-auto"
            >
              {t('reservationSubtitle') || 'Join us for an unforgettable dining experience. Reserve your table below.'}
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="bg-card border-2 border-border rounded-3xl p-6 sm:p-12 shadow-xl hover:shadow-2xl transition-shadow duration-500 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-primary opacity-50" />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3 group">
                  <Label htmlFor="guestName" className="text-primary font-bold group-focus-within:text-secondary transition-colors">{t('fullName')}</Label>
                  <Input id="guestName" {...register('guestName')} className="bg-background h-14 border-2 focus-visible:ring-primary shadow-sm text-base transition-all duration-300 hover:border-primary/50 text-foreground" />
                  {errors.guestName && <p className="text-sm text-destructive font-semibold animate-in slide-in-from-top-1">{t('guestNameErr')}</p>}
                </div>

                <div className="space-y-3 group">
                  <Label htmlFor="email" className="text-primary font-bold group-focus-within:text-secondary transition-colors">{t('email')}</Label>
                  <Input id="email" type="email" {...register('email')} className="bg-background h-14 border-2 focus-visible:ring-primary shadow-sm text-base transition-all duration-300 hover:border-primary/50 text-foreground" />
                  {errors.email && <p className="text-sm text-destructive font-semibold animate-in slide-in-from-top-1">{t('emailErr')}</p>}
                </div>

                <div className="space-y-3 md:col-span-2 group">
                  <Label htmlFor="phone" className="text-primary font-bold group-focus-within:text-secondary transition-colors">{t('phone')}</Label>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <div className={cn(
                        'flex items-center bg-background h-14 border-2 rounded-md px-3 shadow-sm transition-all duration-300 hover:border-primary/50',
                        errors.phone ? 'border-destructive' : 'border-input focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'
                      )}>
                        <PhoneInput
                          id="phone"
                          international
                          defaultCountry="AT"
                          value={field.value}
                          onChange={field.onChange}
                          className="flex-1 text-base text-foreground bg-transparent outline-none"
                        />
                        {field.value && (
                          isValidPhoneNumber(field.value)
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-2 shrink-0" />
                            : <AlertCircle className="w-5 h-5 text-destructive ml-2 shrink-0" />
                        )}
                      </div>
                    )}
                  />
                  {errors.phone && <p className="text-sm text-destructive font-semibold animate-in slide-in-from-top-1">{t('phoneErr')}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t-2 border-border/50">
                <div className="space-y-3 group">
                  <Label className="text-primary font-bold">{t('reservationDate')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full h-14 justify-start text-left font-bold bg-background border-2 border-input shadow-sm text-base hover:bg-background hover:text-foreground hover:border-primary transition-all duration-300 px-4 overflow-hidden notranslate",
                          !selectedDate ? "text-muted-foreground" : "text-foreground",
                          errors.date && "border-primary ring-2 ring-secondary/30"
                        )}
                        translate="no"
                      >
                        <CalendarIcon className="mr-3 h-5 w-5 shrink-0 text-secondary group-hover:scale-110 transition-transform" />
                        <span className="truncate min-w-0 flex-1">
                          {selectedDate ? format(selectedDate, "PPP") : t('selectDate')}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-2 border-primary animate-in zoom-in-95 duration-200" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        disabled={(date) => {
                          const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
                          const isClosedDay = date.getDay() === closedWeekday;
                          const dateStr = date.toISOString().slice(0, 10);
                          const isHoliday = closedDates.some(d => {
                            if (!d.start_date || !d.end_date) return false;
                            return dateStr >= d.start_date.slice(0, 10) && dateStr <= d.end_date.slice(0, 10);
                          });
                          return isPast || isClosedDay || isHoliday;
                        }}
                        initialFocus
                        className="bg-card text-foreground"
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.date && <p className="text-sm text-destructive font-semibold animate-in slide-in-from-top-1">{t('dateErr')}</p>}
                </div>

                <div className="space-y-3 group">
                  <Label className="text-primary font-bold">{t('reservationTime')}</Label>
                  {/*
                    Browser auto-translate (Google/Edge/Safari Translate) can rewrite
                    24h time strings like "19:00" into a localized 12h format like
                    "7:00 PM" by mutating the rendered text node in place. The actual
                    form value is always the raw TIME_SLOTS string passed via Radix's
                    onValueChange (never read from the DOM), so submission is already
                    immune to that rewrite. To stop the browser from touching these
                    nodes at all — which is what caused the blank page when React
                    later tried to reconcile a translate-mutated node — every time
                    value is rendered inside a `notranslate` + `translate="no"`
                    wrapper and tagged with `data-time` holding the untouched value.
                  */}
                  <Select onValueChange={(val) => setValue('time', val, { shouldValidate: true })}>
                    <SelectTrigger className={cn(
                      "h-14 bg-background border-2 shadow-sm font-bold text-base hover:border-primary transition-all duration-300 text-foreground notranslate",
                      errors.time && "border-primary ring-2 ring-secondary/30"
                    )} translate="no">
                      <Clock className="mr-3 h-5 w-5 text-secondary group-hover:scale-110 transition-transform" />
                      <SelectValue placeholder={t('selectTime')}>
                        {selectedTime && (
                          <span className="notranslate" translate="no" data-time={selectedTime}>
                            {selectedTime}
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="border-2 border-primary animate-in zoom-in-95 duration-200">
                      {TIME_SLOTS.map(time => {
                        const isValid = isTimeSlotValid(selectedDate, time);
                        return (
                          <SelectItem
                            key={time}
                            value={time}
                            disabled={!isValid}
                            className={cn(
                              "font-medium transition-colors notranslate",
                              isValid ? "cursor-pointer focus:bg-primary/10" : "time-slot-disabled"
                            )}
                            translate="no"
                          >
                            <span className="notranslate" translate="no" data-time={time}>
                              {time}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {errors.time && (
                    <p className="text-sm text-destructive font-semibold animate-in slide-in-from-top-1">
                      {t('timeErr')}
                    </p>
                  )}
                </div>

                <div className="space-y-3 group">
                  <Label className="text-primary font-bold">{t('numberOfGuests')}</Label>
                  <Select onValueChange={(val) => setValue('guests', val, { shouldValidate: true })}>
                    <SelectTrigger className={cn(
                      "h-14 bg-background border-2 shadow-sm font-bold text-base hover:border-primary transition-all duration-300 text-foreground notranslate",
                      errors.guests && "border-primary ring-2 ring-secondary/30"
                    )} translate="no">
                      <Users className="mr-3 h-5 w-5 text-secondary group-hover:scale-110 transition-transform" />
                      <SelectValue placeholder={t('selectGuests')} />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-primary animate-in zoom-in-95 duration-200">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <SelectItem key={num} value={num.toString()} className="font-medium cursor-pointer transition-colors focus:bg-primary/10">
                          {num} {num === 1 ? 'Guest' : 'Guests'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.guests && <p className="text-sm text-destructive font-semibold animate-in slide-in-from-top-1">{t('guestsErr')}</p>}
                </div>
              </div>

              {/* Additional Requests Section */}
              <div className="space-y-6 pt-10 mt-4 border-t-2 border-border/50 relative">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px bg-secondary/50 flex-1"></div>
                  <h3 className="font-serif text-2xl md:text-3xl font-bold text-primary px-4 text-center">
                    {t('additionalRequests') || 'Additional Details'}
                  </h3>
                  <div className="h-px bg-secondary/50 flex-1"></div>
                </div>

                {/* Kids under 3 Card */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="group relative flex flex-row items-center justify-between gap-6 p-6 md:p-8 rounded-3xl border border-primary/20 bg-gradient-to-br from-card to-primary/5 hover:border-secondary/50 hover:shadow-md hover:shadow-secondary/10 transition-all duration-500 overflow-hidden"
                >
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-secondary/20 rounded-full blur-2xl group-hover:bg-secondary/30 transition-colors duration-500 pointer-events-none" />

                  <div className="relative z-10">
                    <Label className="text-lg md:text-xl font-serif font-bold text-primary cursor-pointer flex items-center gap-2" htmlFor="kidsUnder3">
                      {t('kidsField')}
                    </Label>
                  </div>

                  <div className="flex items-center gap-4 ml-auto relative z-10 bg-background/80 p-2.5 rounded-2xl border border-border/60 shadow-sm backdrop-blur-sm">
                    <Switch
                      id="kidsUnder3"
                      checked={kidsUnder3}
                      onCheckedChange={(val) => {
                        setValue('kidsUnder3', val, { shouldValidate: true });
                      }}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </motion.div>

                {/* Special Requests */}
                <div className="space-y-2">
                  <div className="relative">
                    <textarea
                      id="specialRequests"
                      {...register('specialRequests')}
                      maxLength={250}
                      rows={4}
                      placeholder={t('additionalRequestsPlaceholder')}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-primary/50 transition-all duration-200 resize-none"
                    />
                    <p className="text-sm text-muted-foreground text-right mt-1">{specialRequests.length}/250</p>
                  </div>
                  {errors.specialRequests && (
                    <p className="text-sm text-destructive font-semibold px-1">{errors.specialRequests.message}</p>
                  )}
                </div>
              </div>

              <div className="pt-8 mt-8 border-t-2 border-border/50">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  size="lg"
                  className="w-full text-xl shadow-xl h-16 transition-all duration-300 bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-6 h-6 mr-3 animate-spin" /> {t('processing') || 'Processing...'}</>
                  ) : (
                    <><CheckCircle2 className="w-6 h-6 mr-3" /> {t('submitReservation') || 'Submit Reservation'}</>
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      </main>
    </>
  );
}