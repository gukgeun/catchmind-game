"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousAuth } from "@/lib/firebase";

export function useAuthUser() {
  const [uid, setUid] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ensureAnonymousAuth()
      .then((user) => {
        if (!cancelled) {
          setUid(user?.uid ?? null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { uid, loading, error };
}
