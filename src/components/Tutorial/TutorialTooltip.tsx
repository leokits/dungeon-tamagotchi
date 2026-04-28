"use client";

import { useEffect, useRef, useState } from "react";

interface TutorialTooltipProps {
  targetEl: HTMLElement;
  position?: "top" | "bottom" | "left" | "right";
  content: string;
  visible: boolean;
  onDismiss?: () => void;
}

const ARROW_STYLES: Record<string, { className: string; containerClass: string }> = {
  top: {
    containerClass: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    className:
      "absolute left-1/2 -translate-x-1/2 top-full -mt-1 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-amber-600/50",
  },
  bottom: {
    containerClass: "top-full left-1/2 -translate-x-1/2 mt-2",
    className:
      "absolute left-1/2 -translate-x-1/2 bottom-full -mb-1 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-amber-600/50",
  },
  left: {
    containerClass: "right-full top-1/2 -translate-y-1/2 mr-2",
    className:
      "absolute top-1/2 -translate-y-1/2 left-full -ml-1 w-0 h-0 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-amber-600/50",
  },
  right: {
    containerClass: "left-full top-1/2 -translate-y-1/2 ml-2",
    className:
      "absolute top-1/2 -translate-y-1/2 right-full -mr-1 w-0 h-0 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-amber-600/50",
  },
};

export default function TutorialTooltip({
  targetEl,
  position = "bottom",
  content,
  visible,
  onDismiss,
}: TutorialTooltipProps) {
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    const updatePosition = () => {
      const rect = targetEl.getBoundingClientRect();
      const overlayRect = overlayRef.current?.getBoundingClientRect();
      if (!overlayRect) return;

      const padding = 12;
      let left = 0;
      let top = 0;

      switch (position) {
        case "top":
          left = rect.left + rect.width / 2 - overlayRect.width / 2;
          top = rect.top - overlayRect.height - padding;
          break;
        case "bottom":
          left = rect.left + rect.width / 2 - overlayRect.width / 2;
          top = rect.bottom + padding;
          break;
        case "left":
          left = rect.left - overlayRect.width - padding;
          top = rect.top + rect.height / 2 - overlayRect.height / 2;
          break;
        case "right":
          left = rect.right + padding;
          top = rect.top + rect.height / 2 - overlayRect.height / 2;
          break;
      }

      left = Math.max(8, Math.min(left, window.innerWidth - overlayRect.width - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - overlayRect.height - 8));

      setTooltipStyle({ left, top, position: "fixed" });
      setHighlightStyle({
        left: rect.left - 4,
        top: rect.top - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [visible, targetEl, position]);

  useEffect(() => {
    if (!visible || !onDismiss) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        !targetEl.contains(e.target as Node) &&
        overlayRef.current &&
        !overlayRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [visible, targetEl, onDismiss]);

  if (!visible) return null;

  const arrowConfig = ARROW_STYLES[position];

  return (
    <>
      <div
        className="pointer-events-none fixed z-[100] rounded-lg ring-2 ring-amber-400/80 animate-pulse"
        style={highlightStyle}
      />

      <div
        ref={overlayRef}
        className="absolute z-[101] rounded-lg bg-zinc-800 border border-amber-600/50 p-3 text-sm text-zinc-200 shadow-lg max-w-xs"
        style={tooltipStyle}
      >
        <div className={arrowConfig.containerClass}>
          <div className={arrowConfig.className} />
        </div>
        <p>{content}</p>
      </div>
    </>
  );
}
