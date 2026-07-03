"use client";

const AVATAR_COLORS = [
  "bg-rose-400",
  "bg-orange-400",
  "bg-amber-400",
  "bg-lime-400",
  "bg-emerald-400",
  "bg-teal-400",
  "bg-sky-400",
  "bg-indigo-400",
  "bg-violet-400",
  "bg-fuchsia-400",
];

function avatarColor(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
}

export default function ParticipantList({ players, drawerUid, hostUid, emptySlots = 0 }) {
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-2xl bg-white/90 p-2 shadow">
      <h3 className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
        참가자 ({players.length})
      </h3>
      <ul className="flex flex-col gap-1">
        {players.map((p) => (
          <li
            key={p.uid}
            className={`flex flex-col gap-0.5 rounded-lg px-1.5 py-1 transition ${
              p.uid === drawerUid ? "bg-violet-100 ring-2 ring-violet-300" : "bg-slate-50"
            } ${p.online === false ? "opacity-40" : ""}`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${avatarColor(
                  p.uid
                )}`}
              >
                {p.name?.[0]?.toUpperCase() ?? "?"}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">
                {p.name}
              </span>
            </div>
            <div className="flex items-center justify-between pl-0.5">
              <span className="text-[10px]">
                {p.uid === hostUid && <span title="방장">👑</span>}
                {p.uid === drawerUid && <span title="출제자">✏️</span>}
              </span>
              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-violet-500 shadow-sm">
                {p.score ?? 0}
              </span>
            </div>
          </li>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="flex h-8 items-center justify-center rounded-lg border-2 border-dashed border-slate-100 px-1 text-[10px] text-slate-300"
          >
            빈 자리
          </li>
        ))}
      </ul>
    </div>
  );
}
