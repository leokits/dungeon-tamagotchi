"use client";

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
  return (
    <div className="absolute right-2 top-14 z-50 w-80 max-h-[60vh] overflow-auto rounded-lg bg-zinc-900/95 p-3 backdrop-blur-sm shadow-xl border border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Notifications</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">&times;</button>
      </div>
      {notifications.length === 0 ? (
        <p className="text-xs text-zinc-500">No notifications yet.</p>
      ) : (
        <div className="space-y-1.5">
          {notifications.map((n) => {
            const typeIcon = n.type === "raid_result" ? "⚔️" : n.type === "raid_incoming" ? "🛡️" : "🔔";
            const resultType = String((n.data as Record<string, unknown>).result);
            const resultColor = resultType === "attacker_win"
              ? "text-green-400"
              : resultType === "defender_win"
              ? "text-red-400"
              : "text-yellow-400";

            return (
              <div
                key={n.id}
                className={`rounded p-2 text-xs cursor-pointer transition-colors ${
                  n.seen
                    ? "bg-zinc-800 text-zinc-400"
                    : "bg-zinc-700 text-zinc-200 border border-zinc-600"
                }`}
                onClick={() => !n.seen && onMarkSeen(n.id)}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span>{typeIcon}</span>
                  <span className={n.type === "raid_result" ? resultColor : "text-zinc-300"}>
                    {String((n.data as Record<string, unknown>).message || n.type)}
                  </span>
                </div>
                <div className="text-zinc-500 text-[10px]">{new Date(n.created_at).toLocaleString()}</div>
                {!n.seen && <div className="mt-0.5 text-[10px] text-amber-400">Click to mark read</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
