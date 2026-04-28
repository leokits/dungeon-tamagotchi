"use client";

import { useEffect } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<Toast["type"], string> = {
  success: "border-green-500/50 bg-green-900/80 text-green-200",
  error: "border-red-500/50 bg-red-900/80 text-red-200",
  info: "border-blue-500/50 bg-blue-900/80 text-blue-200",
  warning: "border-yellow-500/50 bg-yellow-900/80 text-yellow-200",
};

const TYPE_ICONS: Record<Toast["type"], string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast, index) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} index={index} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss, index }: { toast: Toast; onDismiss: (id: string) => void; index: number }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <button
      onClick={() => onDismiss(toast.id)}
      className={`dt-toast-enter pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-2 text-sm shadow-lg backdrop-blur-sm ${TYPE_STYLES[toast.type]}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="text-base">{TYPE_ICONS[toast.type]}</span>
      <span>{toast.message}</span>
    </button>
  );
}
