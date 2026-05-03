"use client";

import { useMemo } from "react";

interface GameNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  seen: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  notifications: GameNotification[];
  onMarkSeen: (id: string) => void;
  onClose: () => void;
}

export default function NotificationPanel({ notifications, onMarkSeen, onClose }: NotificationPanelProps) {
  const formattedNotifications = useMemo(() => notifications.map((n) => ({
    ...n,
    relativeTime: (() => {
      const diff = Date.now() - new Date(n.created_at).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    })(),
    typeIcon: n.type === "raid_result" ? "⚔️" : n.type === "raid_incoming" ? "🛡️" : "🔔",
    message: String((n.data as Record<string, unknown>).message || n.type),
  })), [notifications]);

  return (
    <div className="notification-enter absolute right-2 top-14 z-50 w-[340px] max-h-[60vh] overflow-auto rounded-xl bg-zinc-900/98 p-3 backdrop-blur-xl shadow-2xl border border-zinc-700/80">
      <div className="sticky top-0 -mx-0 mb-2 flex items-center justify-between rounded-t-lg bg-zinc-900/95 px-1 pb-2 pt-1 shadow-sm">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            <span className="text-[10px]">🔔</span> Notifications
          </h3>
          {notifications.some((n) => !n.seen) && (
            <span className="dt-badge-pulse flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {notifications.filter((n) => !n.seen).length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all"
        >
          ×
        </button>
      </div>

      {formattedNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-zinc-600">
          <span className="text-2xl opacity-30">🔔</span>
          <p className="text-xs">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {formattedNotifications.map((n, idx) => {
            const resultColor = String(n.data?.result) === "attacker_win"
              ? "text-emerald-400"
              : String(n.data?.result) === "defender_win"
              ? "text-red-400"
              : "text-yellow-400";

            return (
              <div
                key={n.id}
                className={`notification-item-enter rounded-lg p-2.5 text-xs cursor-pointer transition-all duration-150 ${
                  n.seen
                    ? "bg-zinc-800/50 hover:bg-zinc-800/80 text-zinc-400"
                    : "bg-amber-500/5 hover:bg-amber-500/10 text-zinc-200 border border-amber-500/15 hover:border-amber-500/30"
                }`}
                style={{ animationDelay: `${idx * 0.03}s` }}
                onClick={() => !n.seen && onMarkSeen(n.id)}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-sm">{n.typeIcon}</span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={n.type === "raid_result" ? resultColor : "text-zinc-300 font-medium"}>
                      {n.message}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-600 text-[10px]">{n.relativeTime}</span>
                      {!n.seen && <span className="text-[9px] text-amber-500/80 font-medium">click to dismiss</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
