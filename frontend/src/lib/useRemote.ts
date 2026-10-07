import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { errorMessage } from "./api";

/** Clear stale values immediately; ignore requests that finish after blur or a later refresh. */
export function useRemote<T>(
  loader: (() => Promise<T>) | null,
  { refreshOnForeground = true }: { refreshOnForeground?: boolean } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const run = ++generation.current;
    setData(null);
    setError(null);
    if (!loader) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const value = await loader();
      if (run === generation.current) setData(value);
    } catch (e) {
      if (run === generation.current) setError(errorMessage(e));
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [loader]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const subscription = refreshOnForeground
        ? AppState.addEventListener("change", (state) => {
            if (state === "active") void refresh();
            else {
              generation.current++;
              setData(null);
            }
          })
        : null;
      return () => {
        generation.current++;
        setData(null);
        subscription?.remove();
      };
    }, [refresh, refreshOnForeground]),
  );
  return { data, error, loading, refresh };
}
