import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useSession } from "./auth/Session";
import {
  bindPush,
  notifications,
  pushAvailable,
  pushEnabled,
  pushProjectId,
  pushSerial,
  setPushEnabled,
  unbindPush,
} from "./pushRuntime";
import type { Data } from "./api/client";
import { external, internal } from "./api/runtime";

type PushState = {
  status: string;
  error: string;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  pending: Data | null;
  consumed: () => void;
  revision: number;
};
const Context = createContext<PushState>(null!);
const n = notifications();
let launchResponse: Data | null = null;
let responseSink: ((data: Data) => void) | null = null;
let showForeground = (_data: Data) => false;
// Installed before React mounts so a terminated-app tap on iOS is not lost.
const responseListener = n?.addNotificationResponseReceivedListener(
  (response) => {
    const data = response.notification.request.content.data || {};
    launchResponse = data;
    responseSink?.(data);
  },
);
void responseListener;
n?.setNotificationHandler({
  handleNotification: async (notification) => {
    const allowed = showForeground(notification.request.content.data || {});
    return {
      shouldShowBanner: allowed,
      shouldShowList: allowed,
      shouldPlaySound: allowed,
      shouldSetBadge: false,
    };
  },
});

export function PushProvider({ children }: React.PropsWithChildren) {
  const session = useSession();
  const [status, setStatus] = useState("Checking notifications…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Data | null>(launchResponse);
  useEffect(() => {
    if (!session.logoutRevision) return;
    launchResponse = null;
    setPending(null);
    if (n) void n.clearLastNotificationResponseAsync().catch(() => {});
  }, [session.logoutRevision]);
  const [revision, setRevision] = useState(0);
  const current = useRef(session);
  current.current = session;
  showForeground = (data) => {
    const owner =
      data.domain === "admin" ? current.current.admin : current.current.user;
    return (
      !!owner &&
      String(data.ownerId) === String(owner.id || owner._id) &&
      (data.domain === "admin" || data.surface === owner.accountType)
    );
  };
  const mounted = useRef(true);
  const ownerKey = `${session.user?.id || session.user?._id || ""}:${session.user?.accountType || ""}:${session.admin?.id || session.admin?._id || ""}`;
  const sync = useCallback(async (requestPermission = false) => {
    if (!pushAvailable || !n) {
      setStatus(
        "Push requires a development or production build on a supported device or emulator.",
      );
      return;
    }
    await pushSerial(async () => {
      if (!mounted.current) return;
      setBusy(true);
      setError("");
      try {
        if (!(await pushEnabled())) {
          setStatus("Notifications are paused on this device.");
          return;
        }
        if (!pushProjectId) {
          setStatus("Expo project setup is required to enable push.");
          return;
        }
        if (!current.current.user && !current.current.admin) {
          setStatus("Sign in to receive notifications.");
          return;
        }
        await n.setNotificationChannelAsync("starvnt-updates", {
          name: "STARVNT updates",
          importance: 4,
          vibrationPattern: [0, 250, 250, 250],
          sound: "default",
        });
        let permission = await n.getPermissionsAsync();
        if (
          !permission.granted &&
          permission.ios?.status !== 3 &&
          requestPermission &&
          permission.canAskAgain
        )
          permission = await n.requestPermissionsAsync();
        if (!permission.granted && permission.ios?.status !== 3) {
          setStatus("Notifications are disabled in your device settings.");
          return;
        }
        const token = (
          await n.getExpoPushTokenAsync({ projectId: pushProjectId })
        ).data;
        const accounts = current.current;
        const results = await Promise.allSettled([
          ...(accounts.user ? [bindPush("external", token)] : []),
          ...(accounts.admin ? [bindPush("admin", token)] : []),
        ]);
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        setStatus("Push notifications are enabled.");
      } catch (e) {
        setStatus("Push registration needs attention.");
        setError((e as Error).message);
      } finally {
        if (mounted.current) setBusy(false);
      }
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    responseSink = setPending;
    if (n)
      void n
        .getLastNotificationResponseAsync()
        .then((response) => {
          if (response && mounted.current)
            setPending(response.notification.request.content.data || {});
        })
        .catch(() => {});
    const received = n?.addNotificationReceivedListener(() =>
      setRevision((value) => value + 1),
    );
    const refreshed = n?.addPushTokenListener(() => {
      void sync();
    });
    const externalSession = external.onSessionChanged(() => {
      void sync();
    });
    const adminSession = internal.onSessionChanged(() => {
      void sync();
    });
    const active = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void sync();
        setRevision((value) => value + 1);
      }
    });
    return () => {
      mounted.current = false;
      responseSink = null;
      showForeground = () => false;
      received?.remove();
      refreshed?.remove();
      active.remove();
      externalSession();
      adminSession();
    };
  }, [sync]);
  useEffect(() => {
    if (session.ready) void sync(true);
  }, [ownerKey, session.ready, sync]);
  return (
    <Context.Provider
      value={{
        status,
        error,
        busy,
        pending,
        revision,
        consumed() {
          launchResponse = null;
          setPending(null);
          if (n) void n.clearLastNotificationResponseAsync().catch(() => {});
        },
        async enable() {
          if (pushAvailable) await setPushEnabled(true);
          await sync(true);
        },
        async disable() {
          if (!pushAvailable) return;
          setBusy(true);
          setError("");
          try {
            await pushSerial(async () => {
              if (current.current.user) await unbindPush("external");
              if (current.current.admin) await unbindPush("admin");
              await setPushEnabled(false);
              await n?.dismissAllNotificationsAsync();
            });
            setStatus("Notifications are paused on this device.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePush = () => useContext(Context);
