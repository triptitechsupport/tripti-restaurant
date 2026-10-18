import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Printer, ArrowUp, ArrowDown, Save, RotateCcw, Loader2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

// Admin manager for the KOT (Kitchen Order Ticket) category print sequence.
// The admin reorders categories (e.g. Appetizers first, Main Courses next,
// Bread & Staples after) and saves; the saved `print_order` values are read
// by kotPrint.js so printed KOTs follow this sequence. Categories without an
// explicit order sort last (alphabetically) on the printed ticket.
export default function AdminKotPrintOrder() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const records = await pb.collection('categories').getFullList({
        sort: 'print_order,name',
        $autoCancel: false,
      });
      setCategories(records);
      setDirty(false);
    } catch (err) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const move = (index, direction) => {
    setCategories((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Persist the new sequence as 1..N print_order values. Each update is
      // given a unique requestKey so the parallel writes don't auto-cancel.
      await Promise.all(
        categories.map((cat, i) =>
          pb.collection('categories').update(
            cat.id,
            { print_order: i + 1 },
            { requestKey: `print-order-${cat.id}`, $autoCancel: false },
          ),
        ),
      );
      toast.success('KOT print order saved');
      setDirty(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save print order');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchCategories();
  };

  return (
    <>
      <Helmet>
        <title>KOT Print Order - Admin Portal</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 md:p-6 rounded-2xl border-2 border-border shadow-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl shrink-0">
              <Printer className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold tracking-tight text-primary">
                KOT Print Order
              </h2>
              <p className="text-muted-foreground font-medium text-sm mt-1 max-w-xl">
                Set the sequence in which categories appear on a printed Kitchen
                Order Ticket. Categories without an explicit order print last,
                alphabetically.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={loading || saving || !dirty}
              className="w-full sm:w-auto shadow-sm gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Revert
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || saving || !dirty}
              className="w-full sm:w-auto shadow-md gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Order'}
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="bg-card border-2 border-border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-12 text-center">
              No categories yet. Add categories from the Menu tab first.
            </p>
          ) : (
            <ol className="divide-y divide-border/60">
              {categories.map((cat, index) => {
                const hasExplicitOrder = typeof cat.print_order === 'number' && !Number.isNaN(cat.print_order);
                return (
                  <li
                    key={cat.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <GripVertical className="h-5 w-5 text-muted-foreground/60 shrink-0" />
                    <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary font-bold text-sm shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-foreground truncate">{cat.name}</div>
                      {cat.name_de && (
                        <div className="text-xs text-muted-foreground truncate">{cat.name_de}</div>
                      )}
                    </div>
                    {!hasExplicitOrder && (
                      <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 shrink-0">
                        No order
                      </span>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${cat.name} up`}
                        className="touch-target rounded-md text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors"
                      >
                        <ArrowUp className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === categories.length - 1}
                        aria-label={`Move ${cat.name} down`}
                        className="touch-target rounded-md text-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground transition-colors"
                      >
                        <ArrowDown className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {!loading && categories.length > 0 && (
          <p className="text-xs text-muted-foreground font-medium">
            Tip: use the arrows to reorder. The topmost category prints first on
            every KOT. Click <strong>Save Order</strong> to apply.
          </p>
        )}
      </div>
    </>
  );
}
