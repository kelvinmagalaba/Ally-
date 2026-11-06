import { useEffect, useRef, useState } from 'react';
import { X, QrCode, Camera, Loader2, CheckCircle2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/**
 * DeliveryDoorVerifyPanel
 *
 * Used by the delivery driver at the customer's door. The driver either
 *  - scans the QR on the customer's receipt (camera), or
 *  - types the verify code from the receipt manually.
 *
 * On success the backend marks the order completed and rings the bell on
 * the customer, seller, and driver sockets ("deliveryArrived" + "deliveryConfirmed").
 */

interface Props {
  open: boolean;
  orderId: number;
  driverUserId: number;
  onClose: () => void;
  onVerified: () => void;
}

export default function DeliveryDoorVerifyPanel({
  open,
  orderId,
  onClose,
  onVerified,
}: Props) {
  const [mode, setMode] = useState<'scan' | 'code'>('code');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scannerDivId = 'delivery-qr-scanner';

  const verify = async (raw: string) => {
    if (verifying) return;
    setVerifying(true);
    try {
      const { data } = await api.post(`/workflow/orders/${orderId}/verify-delivery`, {
        code: raw,
      });
      if (data.valid) {
        setVerified(true);
        toast.success(data.message || 'Cylinder released');
        onVerified();
      } else {
        toast.error(data.message || 'Code did not match');
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
                'Verification failed'
            )
          : 'Verification failed';
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  // Start / stop the html5-qrcode scanner when entering "scan" mode.
  useEffect(() => {
    if (!open || mode !== 'scan' || verified) return;

    let cancelled = false;
    let html5Qr: { stop: () => Promise<void>; clear: () => void } | null = null;

    (async () => {
      try {
        const mod = await import('html5-qrcode');
        if (cancelled) return;
        const Html5Qrcode = mod.Html5Qrcode;
        const inst = new Html5Qrcode(scannerDivId);
        html5Qr = inst;
        scannerRef.current = inst;
        await inst.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            // Stop on first read.
            void inst.stop().then(() => inst.clear()).catch(() => undefined);
            verify(decodedText);
          },
          () => {
            // ignore per-frame decode errors
          }
        );
      } catch {
        toast.error('Camera unavailable — type the code instead.');
        setMode('code');
      }
    })();

    return () => {
      cancelled = true;
      if (html5Qr) {
        html5Qr
          .stop()
          .then(() => html5Qr?.clear())
          .catch(() => undefined);
      }
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, verified]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <p className="font-bold text-foreground flex items-center gap-2">
            <QrCode size={16} /> Verify delivery — Order #{orderId}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {verified ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex flex-col items-center text-center">
              <CheckCircle2 size={48} className="text-emerald-600 mb-2" />
              <p className="font-bold text-emerald-900">Cylinder released</p>
              <p className="text-sm text-emerald-800 mt-1">
                The customer has been notified. Thanks for the delivery!
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-5 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Ask the customer for their receipt and either scan the QR or type the verify code.
                The cylinder is only released when the code matches.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('code')}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 ${
                    mode === 'code'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-border bg-background text-foreground'
                  }`}
                >
                  <KeyRound size={14} /> Type code
                </button>
                <button
                  type="button"
                  onClick={() => setMode('scan')}
                  className={`px-3 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 ${
                    mode === 'scan'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-border bg-background text-foreground'
                  }`}
                >
                  <Camera size={14} /> Scan QR
                </button>
              </div>

              {mode === 'code' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. A4F2X9"
                    className="w-full text-center font-mono text-xl tracking-[0.25em] py-3 rounded-xl border border-border bg-background outline-none focus:border-blue-400"
                    style={{ letterSpacing: '0.25em' }}
                  />
                  <button
                    type="button"
                    disabled={!code.trim() || verifying}
                    onClick={() => verify(code.trim())}
                    className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {verifying && <Loader2 size={16} className="animate-spin" />}
                    Verify and release cylinder
                  </button>
                </div>
              )}

              {mode === 'scan' && (
                <div>
                  <div
                    id={scannerDivId}
                    className="w-full aspect-square bg-black rounded-2xl overflow-hidden"
                  />
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Point the camera at the QR on the customer's receipt.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
