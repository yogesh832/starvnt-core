import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from '@react-navigation/native';
import { AppState, Image, Linking, View } from "react-native";
import { createAuraLive, sameAuraValue } from '../auraLive';
import { attachedMessage, messageLinks } from "../messageMedia";
import { pickUpload } from "../api/upload";
import { vendorDestination } from "../vendorDestination";
import { EventDateField } from "../EventFields";
import { AuraPlan } from "../AuraPlan";
import { AuraChatView, AuraPanel, AuraRow } from '../AuraUI';
import { AuraQuestion } from '../AuraQuestion';
import { AuraVendors } from '../AuraVendors';
import type { AuraVoiceSubmit } from '../AuraVoice';
import { AuraButton as AuthButton, AuraText as AuthText } from '../AuraTheme';
import { auraChoice, conversationContext } from "../auraChoices";
import { isQuoteMessage } from "../../../web/src/pages/customer/quoteMessageActions";
import { usePlanningIntent } from "../PlanningIntent";
import {
  newAuraSessionId,
  readAuraSession,
  rememberAuraSession,
  validAuraSessionId,
} from "../auraSessions";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { useSession } from "../auth/Session";
import { usePush } from "../Push";
import { pushDestination } from "../pushDestination";
import {
  Button,
  Card,
  confirm,
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
  const { revision } = usePush();
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
  useEffect(() => {
    if (revision) {
      void r.refresh();
      void threads.refresh();
    }
  }, [revision]);
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
          {(n.actionUrl ||
            n.link ||
            n.payload?.threadId ||
            n.metadata?.threadId) && (
            <Button
              title="Open update"
              secondary
              onPress={() => {
                const target = pushDestination(
                  {
                    version: 1,
                    domain: "external",
                    ownerId: id(user || {}),
                    surface: user?.accountType,
                    actionUrl: n.actionUrl || n.link,
                    eventId: n.eventId || n.event,
                    threadId: n.payload?.threadId || n.metadata?.threadId,
                  },
                  user || {},
                  "external",
                  () => false,
                );
                if (target) navigation.navigate(target.screen, target.params);
              }}
            />
          )}
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
export function ChatScreen(props: any) {
  const kind = props.route.params?.kind || "aura";
  return kind === "aura" ? (
    <AuraSessionBoundary {...props} />
  ) : (
    <ConversationScreen
      key={`${kind}-${props.route.params?.threadId || props.route.params?.eventId}-${props.route.params?.bookingId || props.route.params?.requirementId || ""}`}
      {...props}
    />
  );
}
function AuraSessionBoundary({ route, navigation }: any) {
  const { user } = useSession();
  const { prompt } = usePlanningIntent();
  const [freshIntent] = useState(() => !!prompt);
  const owner = id(user || {});
  const vendor = user?.accountType === "VENDOR";
  const { eventId, sessionId: requested, newChatKey } = route.params || {};
  const requestKey = `${owner}-${vendor}-${eventId || "new"}-${requested || newChatKey || "current"}`;
  const [resolved, setResolved] = useState<{
    key: string;
    sessionId: string;
    error: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (requested && !validAuraSessionId(requested)) {
        if (live)
          setResolved({
            key: requestKey,
            sessionId: "",
            error: "This conversation link is invalid.",
          });
        return;
      }
      let sessionId =
        requested || (newChatKey || freshIntent ? newAuraSessionId() : null);
      if (!sessionId) {
        try {
          sessionId = await readAuraSession(owner, vendor, eventId);
        } catch {
          /* Server history remains available when local preferences cannot be read. */
        }
      }
      sessionId ||= newAuraSessionId();
      try {
        await rememberAuraSession(owner, vendor, eventId, sessionId);
      } catch {
        /* A local preference failure must not block a server conversation. */
      }
      if (live) setResolved({ key: requestKey, sessionId, error: "" });
    })();
    return () => {
      live = false;
    };
  }, [requestKey]);
  if (!resolved || resolved.key !== requestKey)
    return <Page title="Aura+" loading />;
  if (resolved.error)
    return (
      <Page title="Aura+">
        <ErrorNotice message={resolved.error} />
        <Button
          title="Browse conversations"
          onPress={() => navigation.navigate("AuraHistory")}
        />
      </Page>
    );
  return (
    <ConversationScreen
      key={resolved.sessionId}
      route={{
        ...route,
        params: { ...route.params, sessionId: resolved.sessionId },
      }}
      navigation={navigation}
    />
  );
}
function ConversationScreen({ route, navigation }: any) {
  const {
    eventId,
    kind = "aura",
    threadId,
    bookingId,
    requirementId,
  } = route.params || {};
  const { user } = useSession();
  const vendor = user?.accountType === "VENDOR";
  const c = usePalette();
  const a = useAction();
  const { prompt, setPrompt } = usePlanningIntent();
  const [text, setText] = useState(() =>
    kind === "aura" && !vendor ? route.params?.initialPrompt || prompt : "",
  );
  useEffect(() => {
    if (kind === "aura" && !vendor && prompt) setPrompt("");
  }, []);
  const [local, setLocal] = useState<Data[]>([]);
  const [outgoing, setOutgoing] = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const live = useRef<ReturnType<typeof createAuraLive<Data>> | null>(null);
  const [liveLoading, setLiveLoading] = useState(kind === 'aura'), [liveError, setLiveError] = useState('');
  const voiceController = useRef<AuraVoiceSubmit | null>(null);
  const sending = useRef(false);
  const [activeEvent, setActiveEvent] = useState(eventId);
  const [planEvent, setPlanEvent] = useState<Data | null>(null);
  const [understanding, setUnderstanding] = useState<Data | null>(null);
  const [pending, setPending] = useState<Data | null>(null);
  const [attachment, setAttachment] = useState<Data | null>(null);
  const [draftInstructions, setDraftInstructions] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [nextQuestion, setNextQuestion] = useState<Data | null>(null);
  const [switchChoices, setSwitchChoices] = useState<Data[]>([]);
  const [vendorSuggestions, setVendorSuggestions] = useState<Data[]>([]), [vendorSearch, setVendorSearch] = useState<Data | null>(null);
  const [answerDate, setAnswerDate] = useState("");
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
        ? `/customer/events/${encodeURIComponent(eventId)}/messages?${new URLSearchParams(conversationContext(bookingId, requirementId))}`
        : vendor
          ? `/vendor/aura/sessions/${encodeURIComponent(sessionId)}`
          : `/aura/sessions/${encodeURIComponent(sessionId)}${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`;
  const r = useResource(external, readPath, kind === "aura" ? 0 : 20000, kind !== 'aura');
  const stored: Data[] =
    kind === "aura"
      ? r.data.messages || r.data.session?.messages || []
      : r.data.messages || r.data.thread?.messages || [];
  function applyAuraSnapshot(data: Data, includeMessages = true) {
    const retain = <T,>(previous: T, next: T) => sameAuraValue(previous, next) ? previous : next;
    if (includeMessages) setLocal(previous => retain(previous, data.messages || data.session?.messages || []));
    setPending(previous => retain(previous, data.pending || null));
    setNextQuestion(previous => retain(previous, data.nextQuestion || null));
    setSwitchChoices(previous => retain(previous, data.eventChoices || []));
    setVendorSuggestions(previous => retain(previous, data.vendorSuggestions || []));
    setVendorSearch(previous => retain(previous, data.vendorSearch || null));
    setPlanEvent(previous => retain(previous, data.activeEvent || null));
    setUnderstanding(previous => retain(previous, data.understanding || null));
    setActiveEvent(data.activeEvent?.id);
  }
  const applySnapshot = useRef(applyAuraSnapshot); applySnapshot.current = applyAuraSnapshot;
  useFocusEffect(useCallback(() => {
    if (kind !== 'aura') return;
    const sync = createAuraLive<Data>({ read: () => external.call(readPath), apply: data => applySnapshot.current(data), onSuccess: () => { setLiveLoading(false); setLiveError(''); }, onError: error => { setLiveLoading(false); setLiveError((error as Error).message || 'Live cards could not refresh. Please try again.'); } });
    live.current = sync;
    if (AppState.currentState !== 'background') sync.start();
    const app = AppState.addEventListener('change', state => { if (state === 'active') sync.start(); else sync.stop(); });
    return () => { sync.stop(); app.remove(); if (live.current === sync) live.current = null; };
  }, [kind, readPath]));
  const messages = kind === "aura" ? local : stored;
  async function send(override?: string, confirmation?: boolean, choiceBody: Data = {}) {
    if (sending.current) throw new Error('Aura is still replying. Please wait a moment.');
    sending.current = true;
    const sync = live.current;
    if (kind === 'aura') sync?.beginWrite();
    try { return await performSend(override, confirmation, choiceBody, sync); }
    finally { sending.current = false; if (kind === 'aura') sync?.endWrite(); }
  }
  async function performSend(
    override?: string,
    confirmation?: boolean,
    choiceBody: Data = {},
    expectedLive: typeof live.current = live.current,
  ) {
    const message =
      kind === "aura"
        ? override || (attachment ? attachedMessage(text, attachment.url) : text.trim())
        : attachedMessage(override || text, attachment?.url);
    if (!message) return;
    let spokenAnswer = '';
    if (kind === "aura") {
      setOutgoing(message);
      let data: Data;
      try { data = await external.call(
        vendor ? "/vendor/aura/chat" : "/aura/chat",
        "POST",
        {
          sessionId,
          message,
          eventId: activeEvent,
          stream: false,
          ...(!vendor ? choiceBody : {}),
          ...(typeof confirmation === "boolean"
            ? { confirm: confirmation }
            : {}),
        },
      ); } finally { setOutgoing(''); }
      spokenAnswer = [data.reply, data.message?.content, data.message, data.text].find(value => typeof value === 'string' && value.trim()) || 'Your plan has been updated.';
      if (live.current !== expectedLive) return spokenAnswer;
      applyAuraSnapshot(data, false);
      const nextEvent = data.createdEventId || data.activeEvent?.id;
      if (nextEvent) {
        setActiveEvent(nextEvent);
        void rememberAuraSession(
          id(user || {}),
          vendor,
          nextEvent,
          sessionId,
        ).catch(() => {});
      }
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
          actions: data.actions || [],
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
          : { body: message, ...conversationContext(bookingId, requirementId) },
      );
      r.refresh();
    }
    setText("");
    setAttachment(null);
    return spokenAnswer;
  }
  function sendFromUi(message?: string, body: Data = {}) {
    if (voiceController.current) { void voiceController.current(message || (attachment ? attachedMessage(text, attachment.url) : text), body); }
    else void a.run(() => send(message, undefined, body));
  }
  if (kind === 'aura') return <AuraChatView
    navigation={navigation} user={user} vendor={vendor}
    eventTitle={!vendor ? planEvent?.title : undefined} hasQuestion={!!nextQuestion && !!messages.length}
    activeEventId={activeEvent}
    onSwitchEvent={event => sendFromUi(`Switch to ${event.title}`, { switchEventId: id(event) })}
    onOpenEvent={() => { if (activeEvent) navigation.navigate('Event', { eventId: activeEvent }); }}
    attachment={attachment} onRemoveAttachment={() => setAttachment(null)}
    onAttach={() => { void a.run(async () => { const media = await pickUpload(false, ['image/*', 'video/*']); if (media) setAttachment(media); }); }}
    messages={[...messages, ...(outgoing ? [{ role: 'user', content: outgoing }] : [])].map(m => ({ ...m, actions: (m.actions || []).map((action: Data) => ({ ...action, target: typeof action.to === 'string' ? vendorDestination(action.to) : null })) }))}
    text={text} onChangeText={setText} busy={a.busy || voiceBusy} loading={liveLoading}
    error={a.error || liveError} onRetry={() => { void live.current?.refresh(); }}
    onSend={sendFromUi}
    onHistory={() => navigation.navigate('AuraHistory')}
    onVoiceController={submit => { voiceController.current = submit; }}
    onVoiceMessage={async (message, body) => {
      setVoiceBusy(true);
      try { return await send(message, undefined, body) || ''; } finally { setVoiceBusy(false); }
    }}
    onOpenLink={url => { void a.run(async () => { await Linking.openURL(url); }); }}
    onNew={() => navigation.setParams({ sessionId: undefined, newChatKey: String(Date.now()) })}
  >
    {!vendor && <AuraVendors key={`${activeEvent || 'new'}-${vendorSearch?.query || 'catalog'}`} rows={vendorSuggestions} search={vendorSearch} eventId={activeEvent} navigation={navigation} />}
    {!vendor && switchChoices.length > 0 && <AuraPanel><AuthText bold size={13}>Your events</AuthText>{switchChoices.map(event => <AuraRow key={id(event)} title={[event.title, event.city, event.date || 'Date to be decided'].filter(Boolean).join(' · ')} disabled={a.busy || voiceBusy} onPress={() => sendFromUi(`Switch to ${event.title}`, { switchEventId: id(event) })} />)}</AuraPanel>}
    {!vendor && messages.length > 0 && nextQuestion && <AuraQuestion key={`${sessionId}-${nextQuestion.topic || nextQuestion.question}`} question={nextQuestion} showQuestion={!String([...messages].reverse().find(m => m.role !== 'user')?.content || '').includes(nextQuestion.question || '')} busy={a.busy || voiceBusy} onPrefill={setText} onSend={sendFromUi} />}
    {!vendor && <AuraPlan key={activeEvent || 'new'} event={planEvent} understanding={understanding} navigation={navigation} busy={a.busy || voiceBusy}
      onAsk={sendFromUi}
      onConfirm={() => { void a.run(async () => {
        if (!planEvent || !understanding?.canConfirm) return;
        live.current?.beginWrite();
        try {
          const detail = await external.call(`/customer/events/${encodeURIComponent(id(planEvent))}/confirm`, 'POST');
          setPlanEvent(detail.event || planEvent); setUnderstanding(detail.understanding || null); setNextQuestion(null);
        } finally { live.current?.endWrite(); }
      }); }} />}
    {vendor && pending && <AuraPanel><AuthText bold>Review Aura's proposed change</AuthText><AuthText>{pending.summary || pending.question || 'Apply the change described in the conversation?'}</AuthText>
      <AuthButton title="Confirm change" busy={a.busy || voiceBusy} onPress={() => { void a.run(() => send('Confirm this change', true)); }} />
      <AuraRow title="Keep as is" icon="close-outline" disabled={a.busy || voiceBusy} onPress={() => { void a.run(() => send('Cancel this change', false)); }} />
    </AuraPanel>}
    {!vendor && activeEvent && !understanding && <AuraRow title="Open your event plan" icon="calendar-outline" onPress={() => navigation.navigate('Event', { eventId: activeEvent })} />}
  </AuraChatView>;
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
      {kind === "aura" && (
        <>
          <Button
            title="Past conversations"
            secondary
            disabled={a.busy || voiceBusy}
            onPress={() => navigation.navigate("AuraHistory")}
          />
          <Button
            title="New conversation"
            secondary
            disabled={a.busy || voiceBusy}
            onPress={() => {
              const start = () =>
                navigation.setParams({
                  sessionId: undefined,
                  newChatKey: String(Date.now()),
                });
              if (text.trim())
                confirm(
                  "Start a new conversation?",
                  "Your unsent draft will be cleared. Sent messages remain in your conversation history.",
                  start,
                );
              else start();
            }}
          />
        </>
      )}
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
            {!vendor &&
              kind !== "aura" &&
              isQuoteMessage(m) &&
              (eventId || m.eventId || r.data.thread?.eventId) && (
                <Button
                  title="Review quote"
                  secondary
                  onPress={() =>
                    navigation.navigate("EventSection", {
                      eventId: eventId || m.eventId || r.data.thread?.eventId,
                      section: "quotes",
                      title: "Plans & quotes",
                    })
                  }
                />
              )}
            {messageLinks(String(m.content || m.text || m.body || "")).map(
              (link) => (
                <View key={link.url} style={{ gap: 8 }}>
                  {link.image && (
                    <Image
                      source={{ uri: link.url }}
                      accessibilityLabel="Shared image"
                      style={{
                        width: 240,
                        maxWidth: "100%",
                        height: 180,
                        borderRadius: 12,
                      }}
                      resizeMode="contain"
                    />
                  )}
                  <Button
                    title={link.image ? "Open image" : "Open shared link"}
                    secondary
                    onPress={() =>
                      a.run(async () => {
                        await Linking.openURL(link.url);
                      })
                    }
                  />
                </View>
              ),
            )}
            {kind === "aura" &&
              vendor &&
              !mine &&
              (m.actions || []).map((action: Data) => {
                const target =
                  typeof action.to === "string"
                    ? vendorDestination(action.to)
                    : null;
                return target ? (
                  <Button
                    key={action.to}
                    title={action.label || "Open workspace"}
                    secondary
                    onPress={() =>
                      navigation.navigate(target.screen, target.params)
                    }
                  />
                ) : null;
              })}
          </View>
        );
      })}
      <ErrorNotice message={a.error} />
      {kind === "aura" && !vendor && (
        <AuraPlan
          event={planEvent}
          understanding={understanding}
          navigation={navigation}
          busy={a.busy || voiceBusy}
          onAsk={(message) => {
            void a.run(() => send(message));
          }}
          onConfirm={() =>
            a.run(async () => {
              if (!planEvent || !understanding?.canConfirm) return;
              const detail = await external.call(
                `/customer/events/${encodeURIComponent(id(planEvent))}/confirm`,
                "POST",
              );
              setPlanEvent(detail.event || planEvent);
              setUnderstanding(detail.understanding || null);
              setNextQuestion(null);
            })
          }
        />
      )}
      {kind === "aura" && !vendor && nextQuestion && (
        <Card>
          {!!nextQuestion.question && <Txt bold>{nextQuestion.question}</Txt>}
          {(nextQuestion.options || []).map(
            (option: Data | string, index: number) => {
              const label = typeof option === "string" ? option : option.label;
              const choice = auraChoice(option);
              return (
                <Button
                  key={`${label}-${index}`}
                  title={label}
                  secondary
                  busy={a.busy || voiceBusy}
                  onPress={() => {
                    if (choice.prefill) setText(choice.prefill);
                    else
                      void a.run(() =>
                        send(choice.message, undefined, choice.body),
                      );
                  }}
                />
              );
            },
          )}
          {nextQuestion.topic === "event.date" && (
            <>
              <EventDateField
                value={answerDate}
                onChange={setAnswerDate}
                minimumDate={new Date()}
              />
              <Button
                title="Use this event date"
                disabled={!answerDate}
                busy={a.busy || voiceBusy}
                onPress={() => a.run(() => send(answerDate))}
              />
            </>
          )}
        </Card>
      )}
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
            busy={a.busy || voiceBusy}
            onPress={() => {
              void a.run(() => send("Confirm this change", true));
            }}
          />
          <Button
            title="Keep as is"
            secondary
            busy={a.busy || voiceBusy}
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
        editable={!a.busy}
      />
      {kind !== "aura" && (
        <>
          <Button
            title={
              attachment
                ? `Attached: ${attachment.filename}`
                : "Attach a photo, video or document"
            }
            secondary
            busy={a.busy || voiceBusy}
            onPress={() =>
              a.run(async () => {
                const uploaded = await pickUpload();
                if (uploaded) setAttachment(uploaded);
              })
            }
          />
          {attachment && (
            <Button
              title="Remove attachment"
              secondary
              disabled={a.busy || voiceBusy}
              onPress={() => setAttachment(null)}
            />
          )}
          {vendor && kind === "thread" && (
            <>
              <Button
                title={
                  showDraft ? "Close writing assistant" : "Write with Aura+"
                }
                secondary
                disabled={a.busy || voiceBusy}
                onPress={() => setShowDraft(!showDraft)}
              />
              {showDraft && (
                <Card>
                  <Field
                    label="What should the message include?"
                    multiline
                    value={draftInstructions}
                    onChangeText={setDraftInstructions}
                    maxLength={2000}
                    editable={!a.busy}
                  />
                  <Button
                    title={
                      text.trim()
                        ? "Replace draft with Aura+"
                        : "Generate draft"
                    }
                    busy={a.busy || voiceBusy}
                    disabled={!draftInstructions.trim()}
                    onPress={() =>
                      a.run(async () => {
                        const result = await external.call(
                          "/vendor/messages/draft",
                          "POST",
                          {
                            context: { type: "thread", id: threadId },
                            instructions: draftInstructions.trim(),
                          },
                        );
                        if (
                          typeof result.draft !== "string" ||
                          !result.draft.trim()
                        )
                          throw new Error(
                            "Aura could not write a draft. Please try again.",
                          );
                        setText(result.draft);
                        setShowDraft(false);
                      })
                    }
                  />
                  <Txt muted>Review and edit the draft before sending.</Txt>
                </Card>
              )}
            </>
          )}
        </>
      )}
      <Button
        title={kind === "aura" ? "Send to Aura+  ✦" : "Send message"}
        busy={a.busy || voiceBusy}
        disabled={(!text.trim() && !attachment) || r.loading}
        onPress={() => {
          void a.run(send);
        }}
      />
    </Page>
  );
}
