'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, ScanLine } from 'lucide-react';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  // Called once with the decoded text; the modal closes itself afterwards.
  onResult: (text: string) => void;
}

/**
 * Full-screen camera QR reader for inventory: point the phone at an Extra
 * Part / Fixture label and the record opens. Uses the back camera and jsQR
 * (works on iPhone Safari, where the native BarcodeDetector doesn't exist).
 * The camera only works over HTTPS (or localhost).
 */
export function QrScannerModal({ open, onClose, onResult }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest callbacks without restarting the camera when the parent re-renders.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setError(null);
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;

    const stop = () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const tick = () => {
      if (done) return;
      const video = videoRef.current;
      if (video && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
        const canvas = (canvasRef.current ??= document.createElement('canvas'));
        // Scan a downscaled frame: plenty for a label QR and much faster.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            stop();
            navigator.vibrate?.(80);
            onResultRef.current(code.data);
            onCloseRef.current();
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('unsupported');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (done) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        raf = requestAnimationFrame(tick);
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Permiso de cámara negado. Actívalo en la configuración del navegador y vuelve a intentar.'
            : name === 'NotFoundError'
            ? 'No se encontró una cámara en este dispositivo.'
            : 'No se pudo abrir la cámara en este navegador.'
        );
      }
    })();

    return stop;
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-bold">
          <ScanLine size={20} className="text-primary" />
          Scan QR
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Close scanner"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {/* playsInline + muted are required for the live preview on iPhone. */}
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {!error && (
          <div className="relative w-64 h-64 max-w-[75vw] max-h-[75vw] rounded-2xl border-4 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        )}
        {error && (
          <p className="relative mx-6 p-4 rounded-xl bg-card text-card-foreground text-sm text-center">{error}</p>
        )}
      </div>

      <p className="px-6 py-4 text-center text-sm text-white/80">
        Apunta la cámara al QR de la etiqueta (Extra Part o Fixture).
      </p>
    </div>
  );
}
