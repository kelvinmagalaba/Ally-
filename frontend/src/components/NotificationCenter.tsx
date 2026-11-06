import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import socket from '@/socket';

interface NotificationRow {
  id: number;
  order_id?: number | null;
  title: string;
  message: string;
  created_at: string;
  read_at?: string | null;
}

export default function NotificationCenter({ onOpenOrder }: { onOpenOrder: (orderId: number) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ notifications: NotificationRow[] }>('/workflow/notifications');
      setRows(data.notifications);
    } catch {
      // The persistent centre is optional while the backend is unavailable.
    }
  }, []);

  useEffect(() => {
    load();
    const onNotification = () => load();
    socket.on('notification', onNotification);
    return () => {
      socket.off('notification', onNotification);
    };
  }, [load]);

  const unread = rows.filter((row) => !row.read_at).length;
  const markAllRead = async () => {
    await api.patch('/workflow/notifications/read-all');
    setRows((current) => current.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
  };
  const openRow = async (row: NotificationRow) => {
    if (!row.read_at) {
      await api.patch(`/workflow/notifications/${row.id}/read`);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item));
    }
    if (row.order_id) onOpenOrder(Number(row.order_id));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={`${unread} unread notifications`}
        onClick={() => setOpen(true)}
        className="fixed right-16 top-4 z-40 rounded-full border border-border bg-card/95 p-2.5 text-foreground shadow-md backdrop-blur"
      >
        <Bell size={19} />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setOpen(false)}>
          <aside className="h-full w-full max-w-sm bg-background shadow-2xl p-4 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-bold text-foreground">Notifications</h2>
              <div className="flex gap-1">
                <button type="button" onClick={() => void markAllRead()} className="p-2 rounded-lg hover:bg-muted" aria-label="Mark all read"><CheckCheck size={18} /></button>
                <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-muted" aria-label="Close"><X size={18} /></button>
              </div>
            </div>
            <div className="space-y-2">
              {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No notifications yet.</p>}
              {rows.map((row) => (
                <button key={row.id} type="button" onClick={() => void openRow(row)} className={`w-full text-left rounded-xl border p-3 ${row.read_at ? 'border-border bg-card' : 'border-blue-200 bg-blue-50/70'}`}>
                  <p className="text-sm font-semibold text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{row.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">{new Date(row.created_at).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
