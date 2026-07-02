"use client";

import { useEffect, useRef, useState } from "react";
import { ref, push, onChildAdded, onChildChanged, off, serverTimestamp } from "firebase/database";
import { db } from "@/lib/firebase";

export default function ChatPanel({ roomCode, turnIndex, uid, name, disabled, disabledReason }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (!roomCode || turnIndex == null) return;

    const chatRef = ref(db, `rooms/${roomCode}/chat/${turnIndex}`);

    const handleAdded = (snap) => {
      setMessages((prev) => [...prev, { key: snap.key, ...snap.val() }]);
    };
    const handleChanged = (snap) => {
      setMessages((prev) =>
        prev.map((m) => (m.key === snap.key ? { key: snap.key, ...snap.val() } : m))
      );
    };

    onChildAdded(chatRef, handleAdded);
    onChildChanged(chatRef, handleChanged);

    return () => {
      off(chatRef, "child_added", handleAdded);
      off(chatRef, "child_changed", handleChanged);
      setMessages([]);
    };
  }, [roomCode, turnIndex]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    const chatRef = ref(db, `rooms/${roomCode}/chat/${turnIndex}`);
    push(chatRef, {
      uid,
      name,
      text: trimmed,
      ts: serverTimestamp(),
      correct: false,
    });
    setText("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-white/90 shadow">
      <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="pt-6 text-center text-sm text-slate-300">아직 채팅이 없어요</p>
        )}
        {messages.map((m) => (
          <div
            key={m.key}
            className={`flex items-baseline gap-2 rounded-lg px-2 py-1 text-sm ${
              m.correct ? "bg-emerald-50" : ""
            }`}
          >
            <span className={`font-bold ${m.correct ? "text-emerald-600" : "text-violet-500"}`}>
              {m.name}
            </span>
            <span className={m.correct ? "font-bold text-emerald-700" : "text-slate-700"}>
              {m.correct ? `🎉 ${m.text} 정답!` : m.text}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-100 p-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? disabledReason || "채팅을 보낼 수 없어요" : "정답을 입력하세요"}
          className="flex-1 rounded-full border-2 border-slate-200 px-4 py-2 text-sm font-medium outline-none transition focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-full bg-violet-500 px-5 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          전송
        </button>
      </form>
    </div>
  );
}
