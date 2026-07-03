export const MAX_PLAYERS = 16;
export const TURN_DURATION_MS = 3 * 60 * 1000; // 3분
export const REVEAL_DELAY_MS = 4000; // 정답/시간초과 후 다음 턴까지 대기
export const HOST_FALLBACK_GRACE_MS = 3000; // 다음 출제자가 응답 없을 때 호스트가 강제 진행

export const DIFFICULTY_LABELS = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

export const DIFFICULTY_ORDER = ["easy", "normal", "hard"];

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 혼동되는 0,O,1,I 제외

export function generateRoomCode(length = 5) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function pickDifficulty() {
  const roll = Math.random();
  if (roll < 0.4) return "easy";
  if (roll < 0.8) return "normal";
  return "hard";
}

export function normalizeGuess(text) {
  return text.trim().replace(/\s+/g, "").toLowerCase();
}

export function isCorrectGuess(guess, word) {
  if (!word) return false;
  return normalizeGuess(guess) === normalizeGuess(word);
}

export function sortPlayersByOrder(playersObj) {
  if (!playersObj) return [];
  return Object.entries(playersObj)
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function pickNextDrawerUid(playersObj, currentDrawerUid) {
  const players = sortPlayersByOrder(playersObj).filter((p) => p.online);
  if (players.length === 0) return null;
  const currentIndex = players.findIndex((p) => p.uid === currentDrawerUid);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % players.length;
  return players[nextIndex].uid;
}

export function computeWinners(playersObj) {
  const players = sortPlayersByOrder(playersObj);
  if (players.length === 0) return [];
  const maxScore = Math.max(...players.map((p) => p.score ?? 0));
  return players
    .filter((p) => (p.score ?? 0) === maxScore)
    .map((p) => ({ uid: p.uid, name: p.name, score: maxScore }));
}
