import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { ShoppingBag, CalendarDays, UtensilsCrossed, Plus, X, Settings, Loader2, FileText, Globe, ArrowRight, LayoutGrid, MessageSquare, Clock, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Link, Navigate } from 'react-router-dom';
import OrderManagementTable from '@/components/OrderManagementTable.jsx';
import AdminTableReservations from '@/components/AdminTableReservations.jsx';
import MenuItemsList from '@/components/MenuItemsList.jsx';
import MenuItemForm from '@/components/MenuItemForm.jsx';
import LogsManagement from '@/components/LogsManagement.jsx';
import TableCapacitySettings from '@/components/TableCapacitySettings.jsx';
import ClosedDatesManagement from '@/components/ClosedDatesManagement.jsx';
import TimeSlotConfiguration from '@/components/TimeSlotConfiguration.jsx';
import AdminTranslationsEditor from '@/components/AdminTranslationsEditor.jsx';
import AdminTableSettings from '@/components/AdminTableSettings.jsx';
import PdfMenuSettings from '@/components/PdfMenuSettings.jsx';
import AdminLogoSettings from '@/components/AdminLogoSettings.jsx';
import AdminMarqueeSettings from '@/components/AdminMarqueeSettings.jsx';
import AdminClosureSettings from '@/components/AdminClosureSettings.jsx';
import AdminRestaurantSectionSettings from '@/components/AdminRestaurantSectionSettings.jsx';
import WhatsAppNotificationSettings from '@/components/WhatsAppNotificationSettings.jsx';
import EmailTemplateSettings from '@/components/EmailTemplateSettings.jsx';
import AdminFeedbackManagement from '@/components/AdminFeedbackManagement.jsx';
import AdminPrintSettings from '@/components/AdminPrintSettings.jsx';
import AdminTimesheetView from '@/components/AdminTimesheetView.jsx';
import AdminKotsView from '@/components/AdminKotsView.jsx';
import { useAuth } from '@/contexts/AdminAuthContext.jsx';
import StaffChat from '@/components/StaffChat.jsx';
import { useLanguage } from '@/contexts/LanguageContext.jsx';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

export default function AdminBookingDashboard() {
  const { isAdminAuthenticated, initialLoading, currentAdmin } = useAuth();
  const { t, isOrderingEnabled, setIsOrderingEnabled } = useLanguage();
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState('orders');
  
  const [menuItems, setMenuItems] = useState([]);
  const [isMenuLoading, setIsMenuLoading] = useState(true);
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState(null);

  const fetchMenuItems = async () => {
    setIsMenuLoading(true);
    try {
      const records = await pb.collection('menu_items').getFullList({ sort: '-created', $autoCancel: false });
      setMenuItems(records);
    } catch (err) {
      toast.error('Failed to load menu items');
    } finally {
      setIsMenuLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchMenuItems();
    }
  }, [isAdminAuthenticated]);

  if (initialLoading) return <div className="h-full flex items-center justify-center bg-background"><div className="animate-pulse"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></div>;
  
  if (!isAdminAuthenticated) return <Navigate to="/" replace />;

  const authToken = pb.authStore.token;

  const handleEditMenu = (item) => { setEditingMenuItem(item); setShowMenuForm(true); };
  const handleMenuFormSuccess = () => { setShowMenuForm(false); setEditingMenuItem(null); fetchMenuItems(); };
  const handleMenuFormCancel = () => { setShowMenuForm(false); setEditingMenuItem(null); };

  const renderOrdersSection = () => <OrderManagementTable />;
  
  const renderReservationsSection = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-2xl border-2 border-border shadow-md">
        <div>
          <h2 className="text-xl font-serif font-bold tracking-tight text-primary">Reservations Overview</h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">Quick view of recent table bookings.</p>
        </div>
        <Button asChild className="w-full sm:w-auto shadow-md">
          <Link to="/admin/reservations">
            Advanced Approval Dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <AdminTableReservations authToken={authToken} />
    </div>
  );
  
  const renderMenuSection = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-mobile rounded-2xl border-2 border-border shadow-md">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">{t('menuManagement')}</h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">Manage your digital menu offerings.</p>
        </div>
        {!showMenuForm && (
          <Button onClick={() => setShowMenuForm(true)} className="w-full sm:w-auto min-h-touch shadow-md">
            <Plus className="h-4 w-4 mr-2" /> {t('addNewItem')}
          </Button>
        )}
      </div>

      {showMenuForm ? (
        <Card className="border-2 border-primary shadow-xl animate-in fade-in duration-300 rounded-2xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b-2 border-border bg-primary/5 pb-4">
            <div>
              <CardTitle className="font-serif text-primary text-xl">{editingMenuItem ? t('editItem') : t('addNewItem')}</CardTitle>
              <CardDescription className="font-medium text-foreground">Fill in the details for the dish.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleMenuFormCancel} className="touch-target hover:bg-destructive/10 hover:text-destructive">
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-6 px-mobile bg-card">
            <MenuItemForm initialData={editingMenuItem} onSuccess={handleMenuFormSuccess} onCancel={handleMenuFormCancel} />
          </CardContent>
        </Card>
      ) : (
        <MenuItemsList items={menuItems} onEdit={handleEditMenu} onDelete={fetchMenuItems} />
      )}
    </div>
  );

  const renderTablesSection = () => <AdminTableSettings />;

  const renderSettingsSection = () => (
    <div className="space-y-8 lg:space-y-12">
      <div className="bg-card border-2 border-border rounded-2xl p-mobile shadow-md">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-3">
            <div className="h-12 w-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-sm"><Settings className="w-6 h-6" /></div>
            <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">{t('onlineOrderingSettings')}</h2>
          </div>
          <p className="text-muted-foreground font-medium text-sm">Configure when customers can place online food orders.</p>
        </div>

        <div className="max-w-2xl space-y-6 md:space-y-8">
          <div className="flex items-start gap-5 p-mobile border-2 border-border rounded-xl bg-accent/20">
            <Switch 
              checked={isOrderingEnabled} 
              onCheckedChange={(checked) => setIsOrderingEnabled(checked)} 
              className="mt-1 data-[state=checked]:bg-primary" 
            />
            <div>
              <label className="text-lg font-serif font-bold text-primary block mb-1">Enable Online Orders</label>
              <p className="text-sm font-medium text-foreground">Allow customers to place orders through the website.</p>
            </div>
          </div>
        </div>
      </div>

      <AdminLogoSettings />

      <AdminPrintSettings />

      <AdminRestaurantSectionSettings />

      <AdminMarqueeSettings />

      <div className="mt-6">
        <AdminClosureSettings />
      </div>


      <WhatsAppNotificationSettings />

      <EmailTemplateSettings />

      <PdfMenuSettings />

      <TableCapacitySettings />
      <TimeSlotConfiguration />
      <ClosedDatesManagement />
    </div>
  );

  const renderLogsSection = () => <LogsManagement />;
  const renderTranslationsSection = () => <AdminTranslationsEditor />;
  const renderFeedbackSection = () => <AdminFeedbackManagement />;
  const renderTimesheetsSection = () => <AdminTimesheetView />;
  const renderKotsSection = () => <AdminKotsView />;

  return (
    <>
      <Helmet><title>{t('adminDashboard')} - Tripti Genusswelt</title></Helmet>
      
      <main className="h-full py-6 md:py-12 bg-muted/30 md:bg-background">
        <div className="mx-auto max-w-7xl px-mobile">
          
          <div className="mb-8 md:mb-12">
            <h1 className="text-3xl md:text-5xl font-serif font-bold text-primary tracking-tight mb-2">{t('adminDashboard')}</h1>
            <div className="w-16 h-1 bg-secondary rounded-full mb-4"></div>
            <p className="text-foreground font-medium max-w-2xl text-base md:text-lg">
              {t('adminDashboardDesc')}
            </p>
          </div>

          {isMobile ? (
            <Accordion type="single" collapsible defaultValue="orders" className="space-y-4 pb-12">
              <AccordionItem value="orders" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><ShoppingBag className="w-5 h-5 mr-4 text-primary"/> {t('tab_orders')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderOrdersSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="kots" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><ChefHat className="w-5 h-5 mr-4 text-primary"/> {t('tab_kots')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderKotsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="reservations" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><CalendarDays className="w-5 h-5 mr-4 text-primary"/> {t('tab_reservations')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderReservationsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="tables" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><LayoutGrid className="w-5 h-5 mr-4 text-primary"/> {t('tab_tables')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderTablesSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="menu" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><UtensilsCrossed className="w-5 h-5 mr-4 text-primary"/> {t('menuManagement')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderMenuSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="feedback" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><MessageSquare className="w-5 h-5 mr-4 text-primary"/> {t('feedbackManagement')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderFeedbackSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="translations" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Globe className="w-5 h-5 mr-4 text-primary"/> {t('translationsManagement')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderTranslationsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="settings" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Settings className="w-5 h-5 mr-4 text-primary"/> {t('tab_systemSettings')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderSettingsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="logs" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><FileText className="w-5 h-5 mr-4 text-primary"/> {t('tab_activityLogs')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderLogsSection()}</AccordionContent>
              </AccordionItem>

              <AccordionItem value="timesheets" className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-md">
                <AccordionTrigger className="px-5 py-5 hover:no-underline [&[data-state=open]]:bg-primary/5">
                  <div className="flex items-center font-bold text-lg"><Clock className="w-5 h-5 mr-4 text-primary"/> {t('tab_timesheets')}</div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6 pt-4 bg-background border-t-2 border-border/50">{renderTimesheetsSection()}</AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-8 p-2 bg-card border-2 border-border rounded-2xl shadow-sm w-fit">
                <button onClick={() => setActiveTab('orders')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'orders' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <ShoppingBag className="h-4 w-4 mr-2" /> {t('tab_orders')}
                </button>
                <button onClick={() => setActiveTab('kots')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'kots' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <ChefHat className="h-4 w-4 mr-2" /> {t('tab_kots')}
                </button>
                <button onClick={() => setActiveTab('reservations')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'reservations' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <CalendarDays className="h-4 w-4 mr-2" /> {t('tab_reservations')}
                </button>
                <button onClick={() => setActiveTab('tables')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'tables' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <LayoutGrid className="h-4 w-4 mr-2" /> {t('tab_tables')}
                </button>
                <button onClick={() => setActiveTab('menu')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'menu' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <UtensilsCrossed className="h-4 w-4 mr-2" /> {t('menuManagement')}
                </button>
                <button onClick={() => setActiveTab('feedback')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'feedback' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <MessageSquare className="h-4 w-4 mr-2" /> {t('feedbackManagement')}
                </button>
                <button onClick={() => setActiveTab('translations')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'translations' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Globe className="h-4 w-4 mr-2" /> {t('translationsManagement')}
                </button>
                <button onClick={() => setActiveTab('settings')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'settings' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Settings className="h-4 w-4 mr-2" /> {t('tab_settings')}
                </button>
                <button onClick={() => setActiveTab('logs')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'logs' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <FileText className="h-4 w-4 mr-2" /> {t('tab_logs')}
                </button>
                <button onClick={() => setActiveTab('timesheets')} className={`flex items-center px-5 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'timesheets' ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-muted'}`}>
                  <Clock className="h-4 w-4 mr-2" /> {t('tab_timesheets')}
                </button>
              </div>

              <div className="bg-card border-2 border-border rounded-3xl p-2 shadow-xl min-h-[600px] animate-in fade-in duration-300">
                {activeTab === 'orders' && renderOrdersSection()}
                {activeTab === 'kots' && renderKotsSection()}
                {activeTab === 'reservations' && renderReservationsSection()}
                {activeTab === 'tables' && renderTablesSection()}
                {activeTab === 'menu' && renderMenuSection()}
                {activeTab === 'feedback' && renderFeedbackSection()}
                {activeTab === 'translations' && renderTranslationsSection()}
                {activeTab === 'settings' && renderSettingsSection()}
                {activeTab === 'logs' && renderLogsSection()}
                {activeTab === 'timesheets' && renderTimesheetsSection()}
              </div>
            </>
          )}
        </div>
      </main>
      <StaffChat role="admin" pbClient={pb} displayName={currentAdmin?.name || currentAdmin?.email || t('adminDisplayName')} />
    </>
  );
}