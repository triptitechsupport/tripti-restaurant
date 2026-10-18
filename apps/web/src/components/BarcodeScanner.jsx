import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ScanLine, Keyboard, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateNumericBarcode } from '@/lib/barcodeUtils.js';

/**
 * Camera barcode scanner with graceful fallback.
 * Uses the native BarcodeDetector API + getUserMedia where available.
 * Falls back to manual numeric entry when camera/BarcodeDetector is
 * unavailable or permission is denied.
 *
 * Props: onDetected(value), onClose(), label?
 */
export default function BarcodeScanner({ onDetected, onClose, label = 'Scan barcode' }) {
  const [mode, setMode] = useState('camera'); // 'camera' | 'manual'
  const [status, setStatus] = useState('idle'); // idle | starting | scanning | error | unsupported
  const [errorMsg, setErrorMsg] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState(null);
  const [lastDetected, setLastDetected] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const lastScanRef = useRef(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const detectLoop = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0) {
        const val = codes[0].rawValue || codes[0].rawValue === 0 ? String(codes[0].rawValue) : '';
        if (val) {
          const now = Date.now();
          // Debounce identical reads within 1.2s.
          if (val !== lastScanRef.current || now - (lastScanRef.current === val ? 0 : now) > 1200) {
            lastScanRef.current = val;
            const v = validateNumericBarcode(val);
            if (v.ok && v.value) {
              setLastDetected(v.value);
              onDetected?.(v.value);
            }
          }
        }
      }
    } catch (_) { /* transient frame error */ }
    rafRef.current = requestAnimationFrame(detectLoop);
  }, [onDetected]);

  const startCamera = useCallback(async () => {
    setStatus('starting');
    setErrorMsg('');
    if (!('BarcodeDetector' in window)) {
      setStatus('unsupported');
      setErrorMsg('This device/browser does not support camera barcode detection. Use manual entry.');
      setMode('manual');
      return;
    }
    try {
      // Prefer the back camera.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Configure detector for common retail formats.
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'],
        });
      } catch (_) {
        detectorRef.current = new window.BarcodeDetector();
      }
      setStatus('scanning');
      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (err) {
      console.error('Camera start failed', err);
      setStatus('error');
      const name = err && err.name ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setErrorMsg('Camera permission denied. Allow camera access or use manual entry.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setErrorMsg('No camera found on this device. Use manual entry.');
      } else {
        setErrorMsg('Could not start the camera. Use manual entry.');
      }
      setMode('manual');
    }
  }, [detectLoop]);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => { stopCamera(); };
  }, [mode, startCamera, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const submitManual = (e) => {
    e.preventDefault();
    const v = validateNumericBarcode(manualValue);
    if (!v.ok) { setManualError(v.error); return; }
    if (!v.value) { setManualError('Enter a numeric barcode.'); return; }
    setManualError(null);
    setLastDetected(v.value);
    onDetected?.(v.value);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-card border-2 border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2 font-bold">
            <ScanLine className="h-5 w-5" /> {label}
          </div>
          <button onClick={() => { stopCamera(); onClose?.(); }} className="rounded p-1 hover:bg-white/20" aria-label="Close scanner">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-2 bg-muted/40 border-b border-border">
          <button
            onClick={() => setMode('camera')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg transition ${mode === 'camera' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
          >
            <Camera className="h-4 w-4" /> Camera
          </button>
          <button
            onClick={() => { stopCamera(); setMode('manual'); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg transition ${mode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
          >
            <Keyboard className="h-4 w-4" /> Manual
          </button>
        </div>

        <div className="p-4">
          {mode === 'camera' ? (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {status !== 'scanning' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-center px-4">
                    {status === 'starting' && <><Loader2 className="h-6 w-6 animate-spin mb-2" /> Starting camera…</>}
                    {status === 'unsupported' && <><Camera className="h-8 w-8 mb-2 opacity-60" /> <p className="text-sm">{errorMsg}</p></>}
                    {status === 'error' && <><Camera className="h-8 w-8 mb-2 opacity-60" /> <p className="text-sm">{errorMsg}</p></>}
                    {status === 'idle' && <><Camera className="h-8 w-8 mb-2 opacity-60" /> <p className="text-sm">Tap start to scan.</p></>}
                  </div>
                )}
                {status === 'scanning' && (
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-secondary shadow-[0_0_8px_hsl(var(--secondary))] animate-pulse" />
                )}
              </div>
              {status === 'scanning' && (
                <p className="text-xs text-muted-foreground text-center">Point the camera at a numeric barcode. Detected values appear below.</p>
              )}
              {status === 'error' || status === 'unsupported' ? (
                <Button onClick={() => setMode('manual')} className="w-full h-11"><Keyboard className="h-4 w-4 mr-2" /> Switch to manual entry</Button>
              ) : (
                <Button onClick={startCamera} variant="outline" className="w-full h-11" disabled={status === 'starting'}>
                  {status === 'starting' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  {status === 'scanning' ? 'Restart camera' : 'Start camera'}
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={submitManual} className="space-y-3">
              <p className="text-xs text-muted-foreground">Enter the numeric barcode printed on the item / lot.</p>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                value={manualValue}
                onChange={(e) => { setManualValue(e.target.value.replace(/[^\d]/g, '')); setManualError(null); }}
                placeholder="e.g. 4006381333931"
                className="h-12 text-lg font-mono"
                autoFocus
              />
              {manualError && <p className="text-xs text-destructive font-medium">{manualError}</p>}
              <Button type="submit" className="w-full h-11" disabled={!manualValue}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Use this barcode
              </Button>
            </form>
          )}

          {lastDetected && (
            <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Detected: <span className="font-mono font-bold notranslate" translate="no">{lastDetected}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
