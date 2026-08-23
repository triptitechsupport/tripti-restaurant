import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { FileText, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

export default function LogsManagement() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingDate, setDeletingDate] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);
      const filterDate = threeDaysAgo.toISOString().replace('T', ' ').substring(0, 19);

      const records = await pb.collection('logs').getFullList({
        filter: `logDate >= "${filterDate}"`,
        sort: '-logDate',
        $autoCancel: false
      });
      setLogs(records);
    } catch (err) {
      setError('Failed to load system logs.');
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleDeleteDay = async (dateStr, logsToDelete) => {
    setDeletingDate(dateStr);
    try {
      await Promise.all(logsToDelete.map(log => pb.collection('logs').delete(log.id, { $autoCancel: false })));
      toast.success(`Successfully deleted logs for ${format(new Date(dateStr), 'MMM d, yyyy')}`);
      fetchLogs();
    } catch (err) {
      toast.error('Failed to delete logs for this day');
    } finally {
      setDeletingDate(null);
    }
  };

  const groupedLogs = logs.reduce((acc, log) => {
    const dateStr = format(new Date(log.logDate), 'yyyy-MM-dd');
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(log);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

  if (loading) return <div className="space-y-4 animate-in fade-in"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" /></div>;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-destructive bg-destructive/5 rounded-xl border border-destructive/20">
        <AlertCircle className="h-10 w-10 mb-3 opacity-80" />
        <p className="font-medium mb-4">{error}</p>
        <Button variant="outline" onClick={fetchLogs} className="min-h-touch">Try Again</Button>
      </div>
    );
  }

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
        <FileText className="h-12 w-12 mb-4 opacity-20" />
        <p className="text-lg font-medium text-foreground">No recent activity</p>
        <p className="text-sm mt-1">There are no logs recorded in the last 3 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground">System Logs</h3>
          <p className="text-sm text-muted-foreground">Activity records from the last 3 days.</p>
        </div>
        <Button variant="outline" onClick={fetchLogs} className="min-h-touch w-full sm:w-auto">Refresh</Button>
      </div>

      <Accordion type="multiple" defaultValue={sortedDates} className="w-full space-y-4">
        {sortedDates.map((dateStr) => {
          const dayLogs = groupedLogs[dateStr];
          const isDeleting = deletingDate === dateStr;

          return (
            <AccordionItem key={dateStr} value={dateStr} className="border rounded-xl bg-card overflow-hidden shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-0 border-b border-border/50 bg-muted/10">
                <AccordionTrigger className="hover:no-underline py-3 px-4 sm:py-4 sm:px-5 flex-1 w-full justify-between">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="font-semibold text-base sm:text-lg text-foreground text-left leading-tight">
                      {format(new Date(dateStr), 'EEEE, MMM d, yyyy')}
                    </span>
                    <Badge variant="secondary" className="bg-secondary/50 shrink-0 hidden sm:inline-flex">
                      {dayLogs.length} {dayLogs.length === 1 ? 'entry' : 'entries'}
                    </Badge>
                  </div>
                </AccordionTrigger>
                
                <div className="px-4 pb-3 sm:p-0 sm:pr-4 flex justify-end w-full sm:w-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isDeleting} className="min-h-touch sm:min-h-0 text-destructive border-destructive/20 hover:bg-destructive/10 w-full sm:w-auto">
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Delete Day
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="modal-mobile-safe">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Logs for {format(new Date(dateStr), 'MMM d')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete all {dayLogs.length} log entries for this date? 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-3 sm:gap-0 mt-4">
                        <AlertDialogCancel className="h-12 sm:h-10 mt-0">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteDay(dateStr, dayLogs)} className="h-12 sm:h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              
              <AccordionContent className="p-0">
                <div className="divide-y divide-border/50">
                  {dayLogs.map(log => (
                    <div key={log.id} className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between md:w-32 shrink-0">
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] uppercase tracking-wider font-bold py-1 px-2 ${
                            log.logType === 'order' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                            log.logType === 'reservation' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' :
                            'text-amber-600 border-amber-200 bg-amber-50'
                          }`}
                        >
                          {log.logType}
                        </Badge>
                        <span className="text-xs font-semibold text-muted-foreground md:hidden">{format(new Date(log.logDate), 'HH:mm')}</span>
                      </div>
                      <div className="flex-1">
                        <div className="hidden md:block text-xs font-semibold text-muted-foreground mb-1">{format(new Date(log.logDate), 'HH:mm')}</div>
                        <p className="text-sm text-foreground leading-relaxed font-medium md:font-normal">{log.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}