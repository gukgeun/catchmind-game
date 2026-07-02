"use client";

import { useEffect, useRef } from "react";
import { ref, push, set, update, onChildAdded, onChildChanged, off } from "firebase/database";
import { db } from "@/lib/firebase";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const MOVE_THROTTLE_MS = 45;

export default function DrawingCanvas({ roomCode, turnIndex, isDrawer, tool, color, brushSize, clearSignal }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const strokesMapRef = useRef(new Map());
  const strokeOrderRef = useRef([]);
  const activeStrokeKeyRef = useRef(null);
  const activePointsRef = useRef([]);
  const drawingRef = useRef(false);
  const lastPushRef = useRef(0);

  // set up canvas + firebase listeners scoped to this turn
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;

    strokesMapRef.current = new Map();
    strokeOrderRef.current = [];
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (!roomCode || turnIndex == null) return;

    const strokesRef = ref(db, `rooms/${roomCode}/strokes/${turnIndex}`);

    function redraw() {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      for (const key of strokeOrderRef.current) {
        const stroke = strokesMapRef.current.get(key);
        if (!stroke) continue;
        drawStroke(ctx, stroke);
      }
    }

    const handleAdded = (snap) => {
      strokesMapRef.current.set(snap.key, snap.val());
      strokeOrderRef.current.push(snap.key);
      redraw();
    };
    const handleChanged = (snap) => {
      strokesMapRef.current.set(snap.key, snap.val());
      redraw();
    };

    onChildAdded(strokesRef, handleAdded);
    onChildChanged(strokesRef, handleChanged);

    return () => {
      off(strokesRef, "child_added", handleAdded);
      off(strokesRef, "child_changed", handleChanged);
    };
  }, [roomCode, turnIndex]);

  function drawStroke(ctx, stroke) {
    if (stroke.t === "clear") {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      return;
    }
    const points = stroke.points || [];
    if (points.length === 0) return;
    ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color || "#111827";
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.lineWidth = stroke.size || 6;

    if (points.length === 1) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(p.x * CANVAS_WIDTH, p.y * CANVAS_HEIGHT, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x * CANVAS_WIDTH, points[0].y * CANVAS_HEIGHT);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * CANVAS_WIDTH, points[i].y * CANVAS_HEIGHT);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function getNormalizedPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function handlePointerDown(e) {
    if (!isDrawer) return;
    e.preventDefault();
    const point = getNormalizedPoint(e);
    drawingRef.current = true;
    activePointsRef.current = [point];

    const strokesRef = ref(db, `rooms/${roomCode}/strokes/${turnIndex}`);
    const newRef = push(strokesRef);
    activeStrokeKeyRef.current = newRef.key;
    set(newRef, {
      t: "stroke",
      tool,
      color,
      size: brushSize,
      points: activePointsRef.current,
    });
  }

  function handlePointerMove(e) {
    if (!isDrawer || !drawingRef.current) return;
    e.preventDefault();
    const point = getNormalizedPoint(e);
    activePointsRef.current = [...activePointsRef.current, point];

    const now = Date.now();
    if (now - lastPushRef.current < MOVE_THROTTLE_MS) return;
    lastPushRef.current = now;
    pushActiveStroke();
  }

  function pushActiveStroke() {
    if (!activeStrokeKeyRef.current) return;
    const strokeRef = ref(db, `rooms/${roomCode}/strokes/${turnIndex}/${activeStrokeKeyRef.current}`);
    update(strokeRef, { points: activePointsRef.current });
  }

  function handlePointerUp(e) {
    if (!isDrawer || !drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    pushActiveStroke();
    activeStrokeKeyRef.current = null;
    activePointsRef.current = [];
  }

  // clear-all trigger from parent toolbar
  const lastClearSignalRef = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal !== lastClearSignalRef.current) {
      lastClearSignalRef.current = clearSignal;
      if (isDrawer && roomCode && turnIndex != null) {
        const strokesRef = ref(db, `rooms/${roomCode}/strokes/${turnIndex}`);
        push(strokesRef, { t: "clear", ts: Date.now() });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  return (
    <div className="flex w-full justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`block max-w-full rounded-2xl border-4 border-slate-200 bg-white shadow-inner ${
          isDrawer ? "cursor-crosshair" : "cursor-not-allowed"
        }`}
        style={{
          aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
          width: "100%",
          maxHeight: "52vh",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
