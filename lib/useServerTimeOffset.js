"use client";

import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";

export function useServerTimeOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const offsetRef = ref(db, ".info/serverTimeOffset");
    const unsubscribe = onValue(offsetRef, (snap) => {
      setOffset(snap.val() || 0);
    });
    return () => unsubscribe();
  }, []);

  return offset;
}
