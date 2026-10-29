import { useEffect, useRef } from 'react';

// While a full-screen panel is open, the phone's Back button (and the
// browser's back) closes the panel instead of leaving the page.
export default function useBackToClose(open, close) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return undefined;
    const marker = { panel: Date.now() };
    window.history.pushState(marker, '');
    let poppedByUs = false;
    const onPop = () => { poppedByUs = true; closeRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed with the on-screen button: remove the history entry we added.
      if (!poppedByUs && window.history.state && window.history.state.panel === marker.panel) window.history.back();
    };
  }, [open]);
}
