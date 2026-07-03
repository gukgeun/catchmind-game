"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ref,
  onValue,
  off,
  update,
  runTransaction,
  onChildAdded,
  get,
} from "firebase/database";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/useAuthUser";
import { useServerTimeOffset } from "@/lib/useServerTimeOffset";
import { joinRoom, attachPresence, RoomError } from "@/lib/roomService";
import {
  MAX_PLAYERS,
  TURN_DURATION_MS,
  REVEAL_DELAY_MS,
  HOST_FALLBACK_GRACE_MS,
  DIFFICULTY_LABELS,
  pickDifficulty,
  isCorrectGuess,
  sortPlayersByOrder,
  pickNextDrawerUid,
  computeWinners,
} from "@/lib/gameConfig";
import { getRandomWord } from "@/lib/wordList";
import DrawingCanvas from "@/components/DrawingCanvas";
import Toolbar from "@/components/Toolbar";
import ParticipantList from "@/components/ParticipantList";
import ChatPanel from "@/components/ChatPanel";
import Timer from "@/components/Timer";

export default function RoomClient({ code }) {
  const router = useRouter();
  const { uid, loading: authLoading, error: authError } = useAuthUser();
  const serverOffset = useServerTimeOffset();

  const [meta, setMeta] = useState(undefined); // undefined = loading, null = not found
  const [players, setPlayers] = useState({});
  const [turn, setTurn] = useState(null);
  const [secretWord, setSecretWord] = useState(null);

  const [nickname, setNickname] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem("catchmind-nickname") || ""
  );
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [copied, setCopied] = useState(false);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(6);
  const [clearSignal, setClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);

  const endedRef = useRef(false);
  const serverOffsetRef = useRef(0);
  useEffect(() => {
    serverOffsetRef.current = serverOffset;
  }, [serverOffset]);

  // --- subscribe to room state ---
  useEffect(() => {
    const metaRef = ref(db, `rooms/${code}/meta`);
    const playersRef = ref(db, `rooms/${code}/players`);
    const turnRef = ref(db, `rooms/${code}/turn`);

    const handleMeta = (snap) => setMeta(snap.exists() ? snap.val() : null);
    const handlePlayers = (snap) => setPlayers(snap.val() || {});
    const handleTurn = (snap) => setTurn(snap.exists() ? snap.val() : null);

    onValue(metaRef, handleMeta);
    onValue(playersRef, handlePlayers);
    onValue(turnRef, handleTurn);

    return () => {
      off(metaRef, "value", handleMeta);
      off(playersRef, "value", handlePlayers);
      off(turnRef, "value", handleTurn);
    };
  }, [code]);

  // attach presence once we know we're already a member
  useEffect(() => {
    if (uid && players && players[uid]) {
      attachPresence(code, uid);
    }
  }, [uid, players, code]);

  const playersSorted = useMemo(() => sortPlayersByOrder(players), [players]);
  const isJoined = Boolean(uid && players && players[uid]);
  const isHost = Boolean(uid && meta && uid === meta.hostUid);
  const isDrawer = Boolean(uid && turn && uid === turn.drawerUid);
  const isPlaying = meta?.status === "playing" && turn;
  const isEnded = meta?.status === "ended";

  // --- fetch the secret word: security rules only allow the current drawer to read this path ---
  useEffect(() => {
    if (!isDrawer || !turn) return;
    const wordRef = ref(db, `secretWords/${code}/word`);
    const handleWord = (snap) => setSecretWord(snap.val() ?? null);
    onValue(wordRef, handleWord, () => setSecretWord(null));
    return () => {
      off(wordRef, "value", handleWord);
      setSecretWord(null);
    };
  }, [isDrawer, turn?.turnIndex, code]);

  // --- drawer authority: watch chat for correct guesses + timer expiry ---
  useEffect(() => {
    if (!isDrawer || !turn || turn.ended || !secretWord) {
      endedRef.current = turn?.ended ?? false;
      return;
    }
    endedRef.current = false;

    async function endTurn(reason, extra = {}) {
      if (endedRef.current) return;
      endedRef.current = true;
      await update(ref(db, `rooms/${code}/turn`), {
        ended: true,
        endedReason: reason,
        revealedWord: secretWord,
        winnerUid: extra.winnerUid ?? null,
      });
      if (extra.winnerUid) {
        runTransaction(ref(db, `rooms/${code}/players/${extra.winnerUid}/score`), (s) => (s ?? 0) + 1);
      }
      if (extra.messageKey) {
        update(ref(db, `rooms/${code}/chat/${turn.turnIndex}/${extra.messageKey}`), { correct: true });
      }
    }

    const now = Date.now() + serverOffsetRef.current;
    const remaining = Math.max(0, turn.startedAt + turn.durationMs - now);
    const timeoutId = setTimeout(() => endTurn("timeout"), remaining);

    const chatRef = ref(db, `rooms/${code}/chat/${turn.turnIndex}`);
    const handleGuess = (snap) => {
      const msg = snap.val();
      if (!msg || msg.correct) return;
      if (isCorrectGuess(msg.text, secretWord)) {
        endTurn("correct", { winnerUid: msg.uid, messageKey: snap.key });
      }
    };
    onChildAdded(chatRef, handleGuess);

    return () => {
      clearTimeout(timeoutId);
      off(chatRef, "child_added", handleGuess);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawer, turn?.turnIndex, turn?.ended, turn?.startedAt, secretWord]);

  // --- next-turn advancement after a turn ends: only hands off drawerUid, the new ---
  // --- drawer's own client is responsible for picking & storing their secret word ---
  useEffect(() => {
    if (!turn || !turn.ended || meta?.status !== "playing") return;

    // one full round (every player got a turn) has been completed: end the game
    if (meta.roundLength && turn.turnIndex >= meta.roundLength) {
      if (uid !== meta.hostUid) return;
      const timer = setTimeout(async () => {
        const snap = await get(ref(db, `rooms/${code}/meta`));
        const current = snap.val();
        if (!current || current.status !== "playing") return; // already finalized
        const freshPlayersSnap = await get(ref(db, `rooms/${code}/players`));
        const winners = computeWinners(freshPlayersSnap.val() || {});
        await update(ref(db, `rooms/${code}/meta`), {
          status: "ended",
          winnerNames: winners.map((w) => w.name).join(", "),
          winnerScore: winners[0]?.score ?? 0,
        });
      }, REVEAL_DELAY_MS);
      return () => clearTimeout(timer);
    }

    const nextDrawerUid = pickNextDrawerUid(players, turn.drawerUid);
    if (!nextDrawerUid) return;

    function nextTurnSkeleton(drawerUid) {
      return {
        drawerUid,
        wordLength: null,
        difficulty: null,
        startedAt: Date.now() + serverOffsetRef.current,
        durationMs: TURN_DURATION_MS,
        turnIndex: turn.turnIndex + 1,
        ended: false,
        endedReason: null,
        revealedWord: null,
        winnerUid: null,
      };
    }

    function advanceTurn(drawerUid) {
      return runTransaction(ref(db, `rooms/${code}/turn`), (current) => {
        if (!current || current.turnIndex !== turn.turnIndex || !current.ended) return undefined;
        return nextTurnSkeleton(drawerUid);
      });
    }

    let cancelled = false;
    const timers = [];

    if (uid === nextDrawerUid) {
      timers.push(
        setTimeout(() => {
          if (!cancelled) advanceTurn(uid);
        }, REVEAL_DELAY_MS)
      );
    }

    if (uid === meta.hostUid && uid !== nextDrawerUid) {
      timers.push(
        setTimeout(async () => {
          if (cancelled) return;
          const snap = await get(ref(db, `rooms/${code}/turn`));
          const current = snap.val();
          if (!current || current.turnIndex !== turn.turnIndex) return; // already advanced
          const freshPlayersSnap = await get(ref(db, `rooms/${code}/players`));
          const fallbackDrawer = pickNextDrawerUid(freshPlayersSnap.val() || {}, turn.drawerUid);
          if (!fallbackDrawer) return;
          advanceTurn(fallbackDrawer);
        }, REVEAL_DELAY_MS + HOST_FALLBACK_GRACE_MS)
      );
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.ended, turn?.turnIndex, meta?.status, meta?.roundLength, code]);

  // --- whenever this client becomes the drawer for a turn with no word chosen yet, pick one ---
  useEffect(() => {
    if (!isDrawer || !turn || turn.ended || turn.wordLength != null) return;
    const difficulty = pickDifficulty();
    const word = getRandomWord(difficulty);
    update(ref(db, `secretWords/${code}`), { word }).then(() => {
      update(ref(db, `rooms/${code}/turn`), { wordLength: word.length, difficulty });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawer, turn?.turnIndex, turn?.ended, turn?.wordLength, code]);

  async function handleJoinInline(e) {
    e.preventDefault();
    setJoinError("");
    const trimmed = nickname.trim();
    if (!trimmed) {
      setJoinError("닉네임을 입력해주세요.");
      return;
    }
    if (!uid) return;
    window.localStorage.setItem("catchmind-nickname", trimmed);
    setJoining(true);
    try {
      await joinRoom(code, uid, trimmed);
    } catch (err) {
      setJoinError(err instanceof RoomError ? err.message : "참가에 실패했습니다.");
    } finally {
      setJoining(false);
    }
  }

  async function handleStartGame() {
    if (!isHost || playersSorted.length < 2) return;
    const roundLength = playersSorted.filter((p) => p.online).length || playersSorted.length;
    // the host always draws first turn 1, since a player can only write their own
    // secret word once security rules recognize them as the current drawer
    await update(ref(db, `rooms/${code}/turn`), {
      drawerUid: uid,
      wordLength: null,
      difficulty: null,
      startedAt: Date.now() + serverOffsetRef.current,
      durationMs: TURN_DURATION_MS,
      turnIndex: 1,
      ended: false,
      endedReason: null,
      revealedWord: null,
      winnerUid: null,
    });
    await update(ref(db, `rooms/${code}/meta`), {
      status: "playing",
      roundLength,
      winnerNames: null,
      winnerScore: null,
    });
  }

  async function handleEndGame() {
    if (!isHost) return;
    await update(ref(db, `rooms/${code}/meta`), {
      status: "waiting",
      roundLength: null,
      winnerNames: null,
      winnerScore: null,
    });
  }

  async function handleRestart() {
    if (!isHost) return;
    const scoreResets = {};
    Object.keys(players).forEach((pUid) => {
      scoreResets[`players/${pUid}/score`] = 0;
    });
    await update(ref(db, `rooms/${code}`), {
      ...scoreResets,
      "meta/status": "waiting",
      "meta/roundLength": null,
      "meta/winnerNames": null,
      "meta/winnerScore": null,
    });
  }

  function handleLeave() {
    if (uid) {
      update(ref(db, `rooms/${code}/players/${uid}`), { online: false }).catch(() => {});
    }
    router.push("/");
  }

  function handleCopyCode() {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (meta === null) {
    return (
      <NoticeScreen
        emoji="🔍"
        title="방을 찾을 수 없어요"
        description={`"${code}" 코드에 해당하는 방이 없습니다.`}
      >
        <Link
          href="/"
          className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-bold text-white shadow hover:brightness-110"
        >
          홈으로 돌아가기
        </Link>
      </NoticeScreen>
    );
  }

  if (authLoading || meta === undefined) {
    return (
      <NoticeScreen emoji="⏳" title="불러오는 중..." description="게임 방에 연결하고 있어요." />
    );
  }

  if (authError) {
    return (
      <NoticeScreen
        emoji="⚠️"
        title="연결 오류"
        description="Firebase 인증에 실패했습니다. Firebase 콘솔에서 Anonymous 로그인이 활성화되어 있는지 확인해주세요."
      />
    );
  }

  if (!isJoined) {
    return (
      <NoticeScreen emoji="🎨" title={`"${code}" 방 참가하기`} description="닉네임을 입력하고 게임에 참가하세요.">
        <form onSubmit={handleJoinInline} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={10}
            placeholder="닉네임을 입력하세요"
            className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-center text-base font-medium outline-none focus:border-violet-400"
          />
          {joinError && <p className="text-sm font-semibold text-rose-600">{joinError}</p>}
          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-base font-black text-white shadow-lg hover:brightness-110 disabled:opacity-50"
          >
            {joining ? "참가 중..." : "참가하기"}
          </button>
        </form>
      </NoticeScreen>
    );
  }

  const leftPlayers = playersSorted.slice(0, 8);
  const rightPlayers = playersSorted.slice(8, 16);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-violet-100 via-fuchsia-50 to-orange-50">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎨</span>
          <button
            onClick={handleCopyCode}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-black tracking-widest text-violet-600 shadow hover:brightness-105"
            title="클릭해서 방 코드 복사"
          >
            {code} {copied ? "✓ 복사됨" : "📋"}
          </button>
          <span className="hidden text-xs font-semibold text-slate-400 sm:inline">
            {playersSorted.length}/{MAX_PLAYERS}명
          </span>
        </div>

        <WordBanner turn={turn} isDrawer={isDrawer} isPlaying={isPlaying} isEnded={isEnded} secretWord={secretWord} />

        <div className="flex items-center gap-2">
          {turn && meta.status === "playing" && (
            <Timer
              startedAt={turn.startedAt}
              durationMs={turn.durationMs}
              serverOffset={serverOffset}
              paused={turn.ended}
            />
          )}
          {isHost && meta.status === "waiting" && (
            <button
              onClick={handleStartGame}
              disabled={playersSorted.length < 2}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-white shadow hover:brightness-110 disabled:opacity-40"
            >
              게임 시작
            </button>
          )}
          {isHost && meta.status === "playing" && (
            <button
              onClick={handleEndGame}
              className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-300"
            >
              게임 종료
            </button>
          )}
          <button
            onClick={handleLeave}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow hover:bg-slate-50"
          >
            나가기
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4 md:flex-row">
        <aside className="order-2 shrink-0 md:order-1 md:w-32 lg:w-40">
          <ParticipantList
            players={leftPlayers}
            drawerUid={turn?.drawerUid}
            hostUid={meta.hostUid}
            emptySlots={Math.max(0, 8 - leftPlayers.length)}
          />
        </aside>

        <section className="order-1 flex flex-1 flex-col gap-3 md:order-2">
          {meta.status === "waiting" ? (
            <LobbyPanel isHost={isHost} playerCount={playersSorted.length} />
          ) : meta.status === "ended" ? (
            <EndedPanel
              winnerNames={meta.winnerNames}
              winnerScore={meta.winnerScore}
              players={playersSorted}
              isHost={isHost}
              onRestart={handleRestart}
            />
          ) : (
            <>
              <Toolbar
                tool={tool}
                setTool={setTool}
                color={color}
                setColor={setColor}
                brushSize={brushSize}
                setBrushSize={setBrushSize}
                onClearAll={() => setClearSignal((n) => n + 1)}
                onUndo={() => setUndoSignal((n) => n + 1)}
                disabled={!isDrawer || turn?.ended}
              />
              <div className="shrink-0">
                <DrawingCanvas
                  roomCode={code}
                  turnIndex={turn?.turnIndex}
                  isDrawer={isDrawer && !turn?.ended}
                  tool={tool}
                  color={color}
                  brushSize={brushSize}
                  clearSignal={clearSignal}
                  undoSignal={undoSignal}
                />
              </div>
            </>
          )}
          <div className="h-40 shrink-0 sm:h-44 md:h-36 lg:h-44">
            <ChatPanel
              roomCode={code}
              turnIndex={turn?.turnIndex ?? 0}
              uid={uid}
              name={players[uid]?.name}
              disabled={!isPlaying || isDrawer || turn?.ended}
              disabledReason={
                isDrawer ? "출제자는 채팅으로 정답을 보낼 수 없어요" : !isPlaying ? "게임 대기 중" : ""
              }
            />
          </div>
        </section>

        <aside className="order-3 shrink-0 md:w-32 lg:w-40">
          <ParticipantList
            players={rightPlayers}
            drawerUid={turn?.drawerUid}
            hostUid={meta.hostUid}
            emptySlots={Math.max(0, 8 - rightPlayers.length)}
          />
        </aside>
      </main>
    </div>
  );
}

function WordBanner({ turn, isDrawer, isPlaying, isEnded, secretWord }) {
  if (isEnded) {
    return <div className="text-sm font-bold text-amber-500">🏆 게임 종료</div>;
  }
  if (!isPlaying) {
    return <div className="text-sm font-bold text-slate-400">게임 대기 중</div>;
  }

  if (turn.ended) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-black text-amber-700">
        {turn.endedReason === "correct" ? "🎉 정답:" : "⏰ 시간 종료! 정답:"} {turn.revealedWord}
      </div>
    );
  }

  if (turn.wordLength == null) {
    return (
      <div className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-slate-400 shadow">
        출제자가 단어를 고르는 중...
      </div>
    );
  }

  const diffLabel = DIFFICULTY_LABELS[turn.difficulty] || "";

  if (isDrawer) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-violet-100 px-4 py-1.5 text-sm font-black text-violet-700">
        <span className="rounded-full bg-violet-500 px-2 py-0.5 text-xs text-white">{diffLabel}</span>
        {secretWord ?? "..."}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-black text-slate-600 shadow">
      <span className="rounded-full bg-slate-300 px-2 py-0.5 text-xs text-white">{diffLabel}</span>
      {"█ ".repeat(turn.wordLength).trim()}
      <span className="text-xs font-semibold text-slate-400">({turn.wordLength}자)</span>
    </div>
  );
}

function LobbyPanel({ isHost, playerCount }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 p-10 text-center shadow-inner">
      <div className="text-5xl">🖌️</div>
      <h2 className="text-xl font-black text-slate-700">게임 시작을 기다리는 중...</h2>
      <p className="text-sm text-slate-500">
        현재 {playerCount}명 참가 중 (최소 2명 필요)
      </p>
      {isHost ? (
        <p className="text-sm font-semibold text-violet-500">우측 상단의 &apos;게임 시작&apos; 버튼을 눌러주세요</p>
      ) : (
        <p className="text-sm font-semibold text-slate-400">방장이 게임을 시작할 때까지 기다려주세요</p>
      )}
    </div>
  );
}

function EndedPanel({ winnerNames, winnerScore, players, isHost, onRestart }) {
  const ranked = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl bg-white/80 p-8 text-center shadow-inner">
      <div className="text-6xl">🎉</div>
      <h2 className="text-2xl font-black text-slate-800">
        승자는 {winnerNames || "-"}님입니다! 축하합니다!
      </h2>
      {typeof winnerScore === "number" && (
        <p className="text-sm font-bold text-amber-500">{winnerScore}문제 정답</p>
      )}

      <ul className="mt-2 w-full max-w-xs space-y-1.5">
        {ranked.map((p, i) => (
          <li
            key={p.uid}
            className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm font-bold ${
              i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-600"
            }`}
          >
            <span>
              {i + 1}위 {p.name}
            </span>
            <span>{p.score ?? 0}점</span>
          </li>
        ))}
      </ul>

      {isHost ? (
        <button
          onClick={onRestart}
          className="mt-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-base font-black text-white shadow-lg hover:brightness-110"
        >
          새 게임 시작
        </button>
      ) : (
        <p className="mt-2 text-sm font-semibold text-slate-400">방장이 새 게임을 시작할 때까지 기다려주세요</p>
      )}
    </div>
  );
}

function NoticeScreen({ emoji, title, description, children }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 px-4 text-center">
      <div className="w-full max-w-sm rounded-3xl bg-white/95 p-8 shadow-2xl">
        <div className="mb-3 text-5xl">{emoji}</div>
        <h1 className="text-xl font-black text-slate-800">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        {children && <div className="mt-6 flex flex-col items-center gap-3">{children}</div>}
      </div>
    </main>
  );
}
