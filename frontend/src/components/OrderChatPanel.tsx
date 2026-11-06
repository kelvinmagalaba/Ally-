import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import socket from '@/socket';
import { X, Send } from 'lucide-react';
import { toast } from 'sonner';

export interface ChatMsgRow {
  id: number;
  order_id: number;
  sender_id: number;
  receiver_id: number;
  message: string;
  is_read?: number;
  created_at: string;
}

interface OrderChatPanelProps {
  open: boolean;
  onClose: () => void;
  orderId: number;
  userId: number;
  peerId: number;
  peerLabel: string;
  readOnly?: boolean;
}

export default function OrderChatPanel({
  open,
  onClose,
  orderId,
  userId,
  peerId,
  peerLabel,
  readOnly = false,
}: OrderChatPanelProps) {
  const [messages, setMessages] = useState<ChatMsgRow[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!orderId || !userId) return;
    setLoading(true);
    try {
      const { data } = await api.get<ChatMsgRow[]>(`/messages/order/${orderId}`, { params: { userId } });
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [orderId, userId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    socket.emit('joinOrder', orderId);
    const onMsg = (p: { orderId: number; message: ChatMsgRow }) => {
      if (p.orderId !== orderId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === p.message.id)) return prev;
        return [...prev, p.message];
      });
    };
    socket.on('orderChatMessage', onMsg);
    return () => {
      socket.off('orderChatMessage', onMsg);
    };
  }, [open, orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const t = text.trim();
    if (!t || readOnly) return;
    try {
      await api.post('/messages/send', {
        order_id: orderId,
        sender_id: userId,
        receiver_id: peerId,
        message: t,
      });
      setText('');
      await load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message)
          : 'Send failed';
      toast.error(msg || 'Send failed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-background w-full sm:max-w-md sm:rounded-2xl border border-border shadow-xl flex flex-col max-h-[85vh] rounded-t-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Order #{orderId}</p>
            <p className="text-xs text-muted-foreground">{peerLabel}</p>
            {readOnly && <p className="text-[10px] text-amber-600 mt-0.5">View only — order completed</p>}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Close chat">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[200px]">
          {loading && messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No messages yet</p>
          ) : (
            messages.map((m) => {
              const mine = Number(m.sender_id) === Number(userId);
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? 'bg-blue-600 text-white' : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.message}
                    <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100' : 'text-muted-foreground'}`}>
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        {!readOnly && (
          <div className="p-3 border-t border-border flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              placeholder="Type a message…"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void send()}
              className="shrink-0 rounded-xl bg-blue-600 text-white p-2"
              aria-label="Send"
            >
              <Send size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
