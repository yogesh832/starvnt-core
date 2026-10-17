import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { usePlanningIntent } from "../PlanningIntent";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { useSession } from "../auth/Session";
import {
  Button,
  Card,
  Empty,
  ErrorNotice,
  Field,
  id,
  MenuRow,
  Page,
  Pill,
  Txt,
  useAction,
  usePalette,
  useResource,
} from "../ui";

export function UpdatesScreen({ navigation }: any) {
  const { user } = useSession();
  const vendor = user?.accountType === "VENDOR";
  const r = useResource(
    external,
    vendor ? "/vendor/notifications" : "/customer/updates",
  );
  const threads = useResource(
    external,
    vendor ? "/vendor/messages/threads" : "/customer/updates",
  );
  const a = useAction();
  return (
    <Page
      {...r}
      title="Stay in the loop"
      subtitle="Your people, plans, and important updates."
    >
      <ErrorNotice message={a.error || threads.error} />
      <Button
        title="Mark all notifications as read"
        secondary
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            await external.call(
              vendor
                ? "/vendor/notifications/read-all"
                : "/customer/notifications/read-all",
              vendor ? "PUT" : "POST",
            );
            r.refresh();
          });
        }}
      />
      <Txt bold size={21}>
        Conversations
      </Txt>
      {(threads.data.threads || []).map((t: Data) => (
        <MenuRow
          key={id(t)}
          title={t.vendorName || t.clientName || t.eventName || "Conversation"}
          subtitle={t.lastMessageText || "Open conversation"}
          icon="chatbubble-ellipses-outline"
          onPress={() =>
            navigation.navigate("Chat", {
              kind: "thread",
              threadId: id(t),
              vendor,
              title: t.vendorName || t.clientName,
            })
          }
        />
      ))}
      {!threads.loading && !threads.data.threads?.length && (
        <Txt muted>No conversations yet.</Txt>
      )}
      <Txt bold size={21}>
        Notifications
      </Txt>
      {(r.data.notifications || []).map((n: Data) => (
        <Card key={id(n)}>
          <Pill>{n.read || n.isRead ? "READ" : "NEW"}</Pill>
          <Txt bold>{n.title}</Txt>
          <Txt muted>{n.body || n.message}</Txt>
          {!(n.read || n.isRead) && (
            <Button
              title="Mark as read"
              secondary
              busy={a.busy}
              onPress={() => {
                void a.run(async () => {
                  await external.call(
                    vendor
                      ? `/vendor/notifications/${id(n)}/read`
                      : `/customer/notifications/${id(n)}/read`,
                    vendor ? "PUT" : "POST",
                  );
                  r.refresh();
                });
              }}
            />
          )}
          {n.eventId && !vendor && (
            <Button
              title="Open event"
              secondary
              onPress={() =>
                navigation.navigate("Event", { eventId: n.eventId })
              }
            />
          )}
        </Card>
      ))}
      {!r.data.notifications?.length && (
        <Empty
          title="You’re all caught up"
          description="Booking, payment, and event updates will appear here."
        />
      )}
    </Page>
  );
}
export function ChatScreen({ route, navigation }: any) {
  const { eventId, kind = "aura", threadId, bookingId } = route.params || {};
  const { user } = useSession();
  const vendor = user?.accountType === "VENDOR";
  const c = usePalette();
  const a = useAction();
  const { prompt, setPrompt } = usePlanningIntent();
  const [text, setText] = useState(() =>
    kind === "aura" && !vendor ? prompt : "",
  );
  useEffect(() => {
    if (kind === "aura" && !vendor && prompt) setPrompt("");
  }, []);
  const [local, setLocal] = useState<Data[]>([]);
  const [activeEvent, setActiveEvent] = useState(eventId);
  const [pending, setPending] = useState<Data | null>(null);
  // Customer Aura sessions are caller-generated and backed by the same server session store.
  const [sessionId, setSessionId] = useState(
    () =>
      route.params?.sessionId ||
      `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const readPath =
    kind === "thread"
      ? vendor
        ? `/vendor/messages/threads/${encodeURIComponent(threadId)}`
        : `/customer/messages/threads/${encodeURIComponent(threadId)}`
      : kind === "circle"
        ? `/customer/events/${encodeURIComponent(eventId)}/messages${bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ""}`
        : vendor
          ? `/vendor/aura/sessions/${encodeURIComponent(sessionId)}`
          : `/aura/sessions/${encodeURIComponent(sessionId)}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`;
  const r = useResource(external, readPath, kind === "aura" ? 0 : 20000);
  const stored: Data[] =
    kind === "aura"
      ? r.data.messages || r.data.session?.messages || []
      : r.data.messages || r.data.thread?.messages || [];
  useEffect(() => {
    if (kind === "aura") {
      setLocal(r.data.messages || []);
      setPending(r.data.pending || null);
    }
  }, [r.data, kind]);
  const messages = kind === "aura" ? local : stored;
  async function send(override?: string, confirmation?: boolean) {
    const message = override || text.trim();
    if (!message) return;
    if (kind === "aura") {
      const data = await external.call(
        vendor ? "/vendor/aura/chat" : "/aura/chat",
        "POST",
        {
          sessionId,
          message,
          eventId: activeEvent,
          stream: false,
          ...(typeof confirmation === "boolean"
            ? { confirm: confirmation }
            : {}),
        },
      );
      setPending(data.pending || null);
      const nextEvent = data.createdEventId || data.activeEvent?.id;
      if (nextEvent) setActiveEvent(nextEvent);
      setLocal((v) => [
        ...v,
        { role: "user", content: message },
        {
          role: "assistant",
          content:
            data.reply ||
            data.message?.content ||
            data.message ||
            data.text ||
            "Your plan has been updated.",
        },
      ]);
    } else {
      const path =
        kind === "thread"
          ? vendor
            ? `/vendor/messages/threads/${encodeURIComponent(threadId)}`
            : `/customer/messages/threads/${encodeURIComponent(threadId)}`
          : `/customer/events/${encodeURIComponent(eventId)}/messages`;
      await external.call(
        path,
        "POST",
        vendor
          ? { text: message }
          : { body: message, ...(bookingId ? { bookingId } : {}) },
      );
      r.refresh();
    }
    setText("");
  }
  return (
    <Page
      title={
        kind === "aura"
          ? "A little help from Aura+"
          : route.params?.title || "Event Circle"
      }
      subtitle={
        kind === "aura"
          ? "Your ideas. A clear way forward."
          : "Stay connected with the people behind your event."
      }
      error={r.error}
      refresh={r.refresh}
      refreshing={r.refreshing}
    >
      {!messages.length && (
        <Card>
          <Pill>
            {kind === "aura"
              ? "YOUR PLANNING COMPANION"
              : "YOUR EVENT, TOGETHER"}
          </Pill>
          <Txt size={23} bold>
            {kind === "aura"
              ? "What are you dreaming of?"
              : "Start the conversation."}
          </Txt>
          <Txt muted>
            {kind === "aura"
              ? "Tell me about your occasion, your city, or the one detail you want to get just right."
              : "Messages here are shared with your event team."}
          </Txt>
        </Card>
      )}
      {messages.map((m, i) => {
        const mine =
          kind === "aura"
            ? m.role === "user"
            : vendor
              ? (m.sender || m.senderType) === "VENDOR"
              : ["CLIENT", "customer"].includes(m.sender || m.senderType);
        return (
          <View
            key={m.id || m._id || i}
            style={{
              alignSelf: mine ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: 17,
              borderRadius: 20,
              backgroundColor: mine ? c.soft : c.card,
              gap: 5,
            }}
          >
            <Txt muted size={11}>
              {m.senderName ||
                (m.role === "user"
                  ? "You"
                  : kind === "aura"
                    ? "Aura+"
                    : "Event team")}
            </Txt>
            <Txt>
              {typeof (m.content || m.text || m.body) === "string"
                ? m.content || m.text || m.body
                : "Conversation updated"}
            </Txt>
          </View>
        );
      })}
      <ErrorNotice message={a.error} />
      {pending && kind === "aura" && vendor && (
        <Card>
          <Txt bold>Review Aura’s proposed change</Txt>
          <Txt>
            {pending.summary ||
              pending.question ||
              "Apply the change described in the conversation?"}
          </Txt>
          <Button
            title="Confirm change"
            busy={a.busy}
            onPress={() => {
              void a.run(() => send("Confirm this change", true));
            }}
          />
          <Button
            title="Keep as is"
            secondary
            busy={a.busy}
            onPress={() => {
              void a.run(() => send("Cancel this change", false));
            }}
          />
        </Card>
      )}
      {activeEvent && kind === "aura" && !vendor && (
        <Button
          title="Open your event plan"
          secondary
          onPress={() => navigation.navigate("Event", { eventId: activeEvent })}
        />
      )}
      <Field
        label={kind === "aura" ? "Ask Aura+" : "Your message"}
        placeholder="Write something…"
        multiline
        value={text}
        onChangeText={setText}
        maxLength={2000}
      />
      <Button
        title={kind === "aura" ? "Send to Aura+  ✦" : "Send message"}
        busy={a.busy}
        disabled={!text.trim()}
        onPress={() => {
          void a.run(send);
        }}
      />
    </Page>
  );
}
