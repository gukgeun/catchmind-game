import {
  ref,
  get,
  set,
  runTransaction,
  onDisconnect,
  serverTimestamp,
} from "firebase/database";
import { db } from "@/lib/firebase";
import { generateRoomCode, MAX_PLAYERS } from "@/lib/gameConfig";

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function findUnusedRoomCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const snap = await get(ref(db, `rooms/${code}/meta`));
    if (!snap.exists()) return code;
  }
  throw new RoomError("code-exhausted", "방 코드를 생성하지 못했습니다. 다시 시도해주세요.");
}

export async function createRoom(uid, nickname) {
  const code = await findUnusedRoomCode();

  await set(ref(db, `rooms/${code}/meta`), {
    createdAt: serverTimestamp(),
    hostUid: uid,
    status: "waiting",
    mode: "normal",
    playerCount: 1,
    turnIndex: 0,
  });

  await set(ref(db, `rooms/${code}/players/${uid}`), {
    name: nickname,
    joinedAt: serverTimestamp(),
    order: 0,
    score: 0,
    online: true,
  });

  attachPresence(code, uid);
  return code;
}

export async function joinRoom(code, uid, nickname) {
  const roomCode = code.trim().toUpperCase();
  const metaRef = ref(db, `rooms/${roomCode}/meta`);
  const metaSnap = await get(metaRef);
  if (!metaSnap.exists()) {
    throw new RoomError("not-found", "존재하지 않는 방 코드입니다.");
  }

  const existingPlayerSnap = await get(ref(db, `rooms/${roomCode}/players/${uid}`));
  if (existingPlayerSnap.exists()) {
    await set(ref(db, `rooms/${roomCode}/players/${uid}/online`), true);
    if (nickname) {
      await set(ref(db, `rooms/${roomCode}/players/${uid}/name`), nickname);
    }
    attachPresence(roomCode, uid);
    return roomCode;
  }

  const countResult = await runTransaction(ref(db, `rooms/${roomCode}/meta/playerCount`), (current) => {
    const count = current ?? 0;
    if (count >= MAX_PLAYERS) return undefined; // abort
    return count + 1;
  });

  if (!countResult.committed) {
    throw new RoomError("room-full", `방 인원이 가득 찼습니다. (최대 ${MAX_PLAYERS}명)`);
  }

  const order = countResult.snapshot.val() - 1;

  await set(ref(db, `rooms/${roomCode}/players/${uid}`), {
    name: nickname,
    joinedAt: serverTimestamp(),
    order,
    score: 0,
    online: true,
  });

  attachPresence(roomCode, uid);
  return roomCode;
}

export function attachPresence(code, uid) {
  const onlineRef = ref(db, `rooms/${code}/players/${uid}/online`);
  onDisconnect(onlineRef)
    .set(false)
    .catch(() => {});
}
