"use client";

import { useEffect, useState } from "react";

export default function Timer({ startedAt, durationMs, serverOffset, paused }) {
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    if (!startedAt || paused) return;

    function tick() {
      const now = Date.now() + serverOffset;
      const elapsed = now - startedAt;
      setRemainingMs(Math.max(0, durationMs - elapsed));
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [startedAt, durationMs, serverOffset, paused]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isUrgent = totalSeconds <= 20;
  const ratio = Math.max(0, Math.min(1, remainingMs / durationMs));

  return (
    <div className="flex items-center gap-3">
      <div
        className={`rounded-full px-4 py-1.5 text-lg font-black tabular-nums shadow ${
          isUrgent ? "bg-rose-500 text-white animate-pulse" : "bg-white text-slate-700"
        }`}
      >
        {minutes}:{seconds.toString().padStart(2, "0")}
      </div>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-white/60">
        <div
          className={`h-full rounded-full transition-all ${isUrgent ? "bg-rose-500" : "bg-violet-500"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
