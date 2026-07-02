"use client";

const COLORS = [
  "#111827",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
];

const SIZES = [3, 6, 12, 20];

export default function Toolbar({ tool, setTool, color, setColor, brushSize, setBrushSize, onClearAll, disabled }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              setTool("pen");
            }}
            className={`h-7 w-7 rounded-full border-2 transition ${
              color === c && tool === "pen" ? "scale-110 border-violet-500" : "border-slate-200"
            }`}
            style={{ backgroundColor: c }}
            aria-label={`색상 ${c}`}
          />
        ))}
      </div>

      <div className="h-6 w-px bg-slate-200" />

      <div className="flex items-center gap-1.5">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setBrushSize(s)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
              brushSize === s ? "border-violet-500 bg-violet-50" : "border-slate-200"
            }`}
            aria-label={`굵기 ${s}`}
          >
            <span
              className="rounded-full bg-slate-700"
              style={{ width: Math.min(s, 16), height: Math.min(s, 16) }}
            />
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-slate-200" />

      <button
        type="button"
        onClick={() => setTool("eraser")}
        className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
          tool === "eraser" ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        지우개
      </button>

      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full bg-rose-100 px-3 py-1.5 text-sm font-bold text-rose-600 transition hover:bg-rose-200"
      >
        전체 지우기
      </button>
    </div>
  );
}
