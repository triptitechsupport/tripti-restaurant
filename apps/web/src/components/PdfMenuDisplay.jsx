import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import pb from '@/lib/pocketbaseClient.js';

export default function PdfMenuDisplay({ pdfSettings, language, t }) {
  const [previewImage, setPreviewImage] = useState(null);

  const deUrl = pdfSettings?.pdfMenuDE ? pb.files.getURL(pdfSettings, pdfSettings.pdfMenuDE) : null;
  const enUrl = pdfSettings?.pdfMenuEN ? pb.files.getURL(pdfSettings, pdfSettings.pdfMenuEN) : null;

  const imageDeUrl = pdfSettings?.menuImageDE ? pb.files.getURL(pdfSettings, pdfSettings.menuImageDE) : null;
  const imageEnUrl = pdfSettings?.menuImageEN ? pb.files.getURL(pdfSettings, pdfSettings.menuImageEN) : null;

  const isGerman = language === 'de';

  // Only show the file matching the currently selected site language.
  // Fall back to the other language if the selected one isn't available.
  const activePdfUrl = (isGerman ? deUrl : enUrl) || (isGerman ? enUrl : deUrl);
  const activePdfLabel = (isGerman ? deUrl : enUrl) ? (isGerman ? 'Deutsch' : 'English') : (isGerman ? 'English' : 'Deutsch');

  const activeImageUrl = (isGerman ? imageDeUrl : imageEnUrl) || (isGerman ? imageEnUrl : imageDeUrl);
  const activeImageLabel = (isGerman ? imageDeUrl : imageEnUrl) ? (isGerman ? 'Deutsch' : 'English') : (isGerman ? 'English' : 'Deutsch');

  const showImages = pdfSettings?.imageMenuEnabled === true && !!activeImageUrl;
  const showPdfs = pdfSettings?.pdfMenuEnabled !== false && !!activePdfUrl;

  if (!showPdfs && !showImages) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-16 sm:py-24 px-4 bg-card rounded-3xl border-2 border-border shadow-inner mt-16"
      >
        <FileText className="h-14 w-14 mx-auto mb-4 text-muted-foreground/40" />
        <p className="text-xl sm:text-2xl text-primary font-serif font-bold">
          {t('menuNotAvailable') || 'The menu is currently unavailable.'}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center mt-16 space-y-16">
      {showPdfs && (
        <motion.div
          key={`pdf-${language}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Button
              asChild
              className="w-full h-auto py-6 sm:py-8 px-6 flex flex-col items-center justify-center gap-3 bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-primary shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              <a href={activePdfUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="h-8 w-8 sm:h-10 sm:w-10" />
                <span className="font-serif font-bold text-lg sm:text-xl">{activePdfLabel}</span>
                <span className="text-xs sm:text-sm font-medium opacity-90">{activePdfLabel === 'Deutsch' ? 'German Menu' : 'English Menu'}</span>
              </a>
            </Button>
          </motion.div>
        </motion.div>
      )}

      {showImages && (
        <motion.div
          key={`img-${language}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl overflow-hidden border-2 border-border shadow-lg"
          >
            <div className="bg-primary text-primary-foreground text-center font-serif font-bold py-2 text-sm sm:text-base">
              {activeImageLabel}
            </div>
            <button
              type="button"
              onClick={() => setPreviewImage({ url: activeImageUrl, label: activeImageLabel })}
              className="group relative block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img src={activeImageUrl} alt={`${activeImageLabel} Menu`} className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center">
                <ZoomIn className="h-10 w-10 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg" />
              </div>
            </button>
          </motion.div>
        </motion.div>
      )}

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl w-[95vw] p-2 sm:p-4 bg-background border-2 border-border">
          {previewImage && (
            <div className="relative">
              <div className="text-center font-serif font-bold text-primary text-lg mb-2">
                {previewImage.label} {t ? (t('menu') || 'Menu') : 'Menu'}
              </div>
              <div className="max-h-[80vh] overflow-auto rounded-lg border border-border">
                <img src={previewImage.url} alt={`${previewImage.label} Menu`} className="w-full h-auto object-contain" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
