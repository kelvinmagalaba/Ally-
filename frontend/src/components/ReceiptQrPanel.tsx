import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Copy, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  orderId: number;
  onClose: () => void;
}

/** Protected handover code. Only the order customer/seller can request it. */
export default function ReceiptQrPanel({ open, orderId, onClose }: Props) {
  const [code, setCode] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    setCode('');
    setLoading(true);
    api
      .post<{ code: string; expiresInMinutes: number }>(`/workflow/orders/${orderId}/delivery-code`)
      .then(({ data }) => {
        setCode(data.code);
        setExpiresInMinutes(data.expiresInMinutes);
      })
      .catch((error: unknown) => {
        const message =
          error && typeof error === 'object' && 'response' in error
            ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
            : null;
        toast.error(message || 'The secure delivery code is not available yet');
      })
      .finally(() => setLoading(false));
  }, [open, orderId]);

  if (!open) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied');
    } catch {
      toast.error("Couldn't copy the code");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <p className="font-bold text-foreground flex items-center gap-2">
            <KeyRound size={16} /> Secure handover · Order #{orderId}
          </p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4 text-center">
          {loading && <Loader2 size={28} className="animate-spin mx-auto text-blue-600" />}
          {!loading && !code && (
            <p className="text-sm text-muted-foreground">A driver must be assigned before a code can be issued.</p>
          )}
          {code && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex justify-center">
                <QRCodeCanvas value={code} size={190} bgColor="#eff6ff" fgColor="#1d4ed8" level="M" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Single-use delivery code</p>
                <p className="text-3xl font-bold text-blue-700 font-mono tracking-[0.25em] mt-1">{code}</p>
                <button type="button" onClick={copyCode} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Copy size={12} /> Copy
                </button>
              </div>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                Give this code only to your assigned driver at handover. It expires in {expiresInMinutes} minutes and cannot be reused.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
