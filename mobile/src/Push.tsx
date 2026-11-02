import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
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
  busyAction: "enable" | "disable" | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  pending: Data | null;
  consumed: () => void;
  refresh: () => void;
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
  const [busyAction, setBusyAction] = useState<"enable" | "disable" | null>(null);
  const [pending, setPending] = useState<Data | null>(launchResponse);
  useEffect(() => {
    if (!session.logoutRevision) return;
    launchResponse = null;
    setPending(null);
    if (n) void n.clearLastNotificationResponseAsync().catch(() => {});
  }, [session.logoutRevision]);
  const [revision, setRevision] = useState(0);
  const syncFlight = useRef<Promise<void> | null>(null);
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
  const registrationAttempt = useRef(0);
  const ownerKey = `${session.user?.id || session.user?._id || ""}:${session.user?.accountType || ""}:${session.admin?.id || session.admin?._id || ""}`;
  const sync = useCallback(async (requestPermission = false) => {
    if (!pushAvailable || !n) {
      setStatus(
        "Push requires a development or production build on a supported device or emulator.",
      );
      return;
    }
    const active = syncFlight.current;
    if (active) {
      await active.catch(() => {});
      if (!requestPermission) return;
    }
    const operation = pushSerial(async () => {
      if (!mounted.current) return;
      const attempt = ++registrationAttempt.current;
      const isCurrent = () => mounted.current && registrationAttempt.current === attempt;
      let stage = "starting push registration";
      let timeout: ReturnType<typeof setTimeout> | undefined;
      setError("");
      try {
        const registration = (async () => {
          stage = "checking this device's notification permission";
          setStatus("Checking notification permission…");
          if (!(await pushEnabled())) {
            if (isCurrent()) setStatus("Notifications are paused on this device.");
            return;
          }
          if (!isCurrent()) return;
          if (!pushProjectId) {
            if (isCurrent()) setStatus("Expo project setup is required to enable push.");
            return;
          }
          if (!current.current.user && !current.current.admin) {
            if (isCurrent()) setStatus("Sign in to receive notifications.");
            return;
          }
          stage = "preparing Android notification channel";
          setStatus("Preparing Android notification channel…");
          await n.setNotificationChannelAsync("starvnt-updates", {
            name: "STARVNT updates",
            importance: 4,
            vibrationPattern: [0, 250, 250, 250],
            sound: "default",
          });
          if (!isCurrent()) return;
          stage = "checking device permission";
          setStatus("Checking notification permission…");
          let permission = await n.getPermissionsAsync();
          if (!isCurrent()) return;
          if (
            !permission.granted &&
            permission.ios?.status !== 3 &&
            requestPermission &&
            permission.canAskAgain
          ) {
            stage = "requesting device permission";
            setStatus("Waiting for notification permission…");
            permission = await n.requestPermissionsAsync();
            if (!isCurrent()) return;
          }
          if (!permission.granted && permission.ios?.status !== 3) {
            if (isCurrent()) setStatus("Notifications are disabled in your device settings.");
            return;
          }
          stage = "getting a Firebase push token";
          setStatus("Getting a push token from Firebase…");
          const token = (
            await n.getExpoPushTokenAsync({ projectId: pushProjectId })
          ).data;
          if (!isCurrent()) return;
          const accounts = current.current;
          stage = "registering this device with STARVNT";
          setStatus("Registering this device with STARVNT…");
          const results = await Promise.allSettled([
            ...(accounts.user ? [bindPush("external", token)] : []),
            ...(accounts.admin ? [bindPush("admin", token)] : []),
          ]);
          const failure = results.find((result) => result.status === "rejected");
          if (failure?.status === "rejected") throw failure.reason;
          if (isCurrent()) setStatus("Push notifications are enabled.");
        })();
        await Promise.race([
          registration,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              if (isCurrent()) {
                registrationAttempt.current++;
                setStatus("Push registration timed out.");
                setError(`It timed out while ${stage}. Check your connection and retry.`);
              }
              reject(new Error("Push registration timed out."));
            }, 25000);
          }),
        ]);
      } catch (e) {
        const message = (e as Error).message || "Push registration failed.";
        if (!isCurrent()) return;
        const firebaseNotConfigured =
          Platform.OS === "android" &&
          /firebase messaging|firebaseapp|google-services|google services/i.test(message);
        if (firebaseNotConfigured) {
          setStatus("Android push setup is incomplete for this app build.");
          setError(
            "This APK cannot reach Firebase Cloud Messaging. It must be rebuilt with Firebase google-services.json for com.starvnt.mobile. Ask the app administrator to add it to EAS as the GOOGLE_SERVICES_JSON file, then install the new APK.",
          );
        } else {
          setStatus("Push registration needs attention.");
          setError(message);
        }
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });
    syncFlight.current = operation;
    try {
      await operation;
    } finally {
      if (syncFlight.current === operation) syncFlight.current = null;
    }
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
    if (session.ready) void sync();
  }, [ownerKey, session.ready, sync]);
  const refreshBadges = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);
  return (
    <Context.Provider
      value={{
        status,
        error,
        busyAction,
        pending,
        revision,
        consumed() {
          launchResponse = null;
          setPending(null);
          if (n) void n.clearLastNotificationResponseAsync().catch(() => {});
        },
        refresh: refreshBadges,
        async enable() {
          setBusyAction("enable");
          try {
            if (pushAvailable) await setPushEnabled(true);
            await sync(true);
          } catch (e) {
            setStatus("Push registration needs attention.");
            setError((e as Error).message || "Push registration failed.");
          } finally {
            if (mounted.current) setBusyAction(null);
          }
        },
        async disable() {
          if (!pushAvailable) return;
          setBusyAction("disable");
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
            setBusyAction(null);
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePush = () => useContext(Context);
