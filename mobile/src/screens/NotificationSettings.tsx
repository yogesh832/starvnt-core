import { NotificationPreferences } from '../NotificationPreferences';
import { useSession } from '../auth/Session';
import React from "react";
import { Linking } from "react-native";
import { usePush } from "../Push";
import { Button, Card, ErrorNotice, Page, Txt } from "../ui";
export function NotificationSettings() {
  const push = usePush();
  const session = useSession();
  return (
    <Page
      title="Notifications"
      subtitle="Stay up to date, even when STARVNT is closed."
    >
      <ErrorNotice message={push.error} />
      {session.activeDomain !== "admin" && <NotificationPreferences surface={session.user?.accountType === "VENDOR" ? "vendor" : "customer"} />}
      <Card>
        <Txt bold>{push.status}</Txt>
        <Txt muted>
          Messages, quotes, bookings, payments and workspace updates use the
          same backend as your inbox.
        </Txt>
      </Card>
      <Button
        title="Enable / retry push notifications"
        busy={push.busy}
        onPress={() => {
          void push.enable();
        }}
      />
      <Button
        title="Pause notifications on this device"
        secondary
        busy={push.busy}
        onPress={() => {
          void push.disable();
        }}
      />
      <Button
        title="Open device notification settings"
        secondary
        onPress={() => {
          void Linking.openSettings().catch(() => {});
        }}
      />
      <Txt muted>
        Delivery requires internet and device notification permission. Android
        force-stop and some battery settings can prevent delivery until the app
        is reopened.
      </Txt>
    </Page>
  );
}
