"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/lib/useAuthUser";
import { createRoom, joinRoom, RoomError } from "@/lib/roomService";
import { MAX_PLAYERS } from "@/lib/gameConfig";

export default function HomePage() {
  const router = useRouter();
  const { uid, loading: authLoading, error: authError } = useAuthUser();
  const [nickname, setNickname] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem("catchmind-nickname") || ""
  );
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError("");

    const trimmedName = nickname.trim();
    if (!trimmedName) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (trimmedName.length > 10) {
      setError("닉네임은 10자 이내로 입력해주세요.");
      return;
    }
    if (!uid) {
      setError("연결 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    window.localStorage.setItem("catchmind-nickname", trimmedName);
    submittingRef.current = true;
    setBusy(true);
    try {
      if (mode === "create") {
        const code = await createRoom(uid, trimmedName);
        router.push(`/room/${code}`);
      } else {
        const trimmedCode = roomCode.trim();
        if (!trimmedCode) {
          setError("방 코드를 입력해주세요.");
          submittingRef.current = false;
          setBusy(false);
          return;
        }
        const code = await joinRoom(trimmedCode, uid, trimmedName);
        router.push(`/room/${code}`);
      }
    } catch (err) {
      if (err instanceof RoomError) {
        setError(err.message);
      } else {
        setError("문제가 발생했습니다. 다시 시도해주세요.");
        console.error(err);
      }
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">🎨</div>
          <h1 className="text-3xl font-black tracking-tight text-slate-800">
            캐치마인드
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            그림으로 맞히는 실시간 단어 게임
          </p>
        </div>

        <div className="mb-6 flex rounded-full bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition ${
              mode === "create"
                ? "bg-violet-500 text-white shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            방 만들기
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition ${
              mode === "join"
                ? "bg-violet-500 text-white shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            방 참가하기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">
              닉네임
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임을 입력하세요"
              maxLength={10}
              className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-medium outline-none transition focus:border-violet-400"
            />
          </div>

          {mode === "join" && (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">
                방 코드
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="예: AB3CD"
                maxLength={8}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base font-bold uppercase tracking-widest outline-none transition focus:border-violet-400"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
              {error}
            </p>
          )}
          {authError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
              Firebase 인증 연결에 실패했습니다. Firebase 콘솔에서 Anonymous
              로그인이 활성화되어 있는지 확인해주세요.
            </p>
          )}

          <button
            type="submit"
            disabled={busy || authLoading}
            className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-base font-black text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {busy
              ? "연결 중..."
              : mode === "create"
              ? "방 만들고 시작하기"
              : "방 참가하기"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          최대 {MAX_PLAYERS}명까지 함께 플레이할 수 있어요
        </p>
      </div>
    </main>
  );
}
