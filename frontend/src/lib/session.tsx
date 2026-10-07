import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";
import { Platform } from "react-native";
import { createApiClient } from "./api";
import type { ApiClient } from "./api";
import { SessionController } from "./session-core";
import { tokenStorage } from "./storage";

export interface SessionContextValue {
  api: ApiClient;
  token: string | null;
  ready: boolean;
  storageWarning: string | null;
  saveToken(token: string): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => new SessionController(tokenStorage));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.hydrate();
  }, [controller]);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl:
          process.env.EXPO_PUBLIC_API_URL ||
          (Platform.OS === "web" && typeof window !== "undefined"
            ? `${window.location.origin}/api/v1`
            : undefined),
        // An API instance belongs to a session revision. A delayed 401 from an older
        // session cannot clear a newer key, even when that key has the same value.
        onUnauthorized: (token) =>
          controller.handleUnauthorized(token, snapshot.revision),
      }),
    [controller, snapshot.revision],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      api,
      token: snapshot.token,
      ready: snapshot.ready,
      storageWarning: snapshot.storageWarning,
      saveToken: controller.saveToken,
      logout: controller.logout,
    }),
    [api, controller, snapshot.token, snapshot.ready, snapshot.storageWarning],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session)
    throw new Error("useSession must be used inside SessionProvider.");
  return session;
}
