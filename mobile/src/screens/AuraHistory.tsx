import React, { useState } from "react";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { useSession } from "../auth/Session";
import { Button, Empty, Field, MenuRow, Page, date, useResource } from "../ui";

export function AuraHistoryScreen({ navigation }: any) {
  const { user } = useSession();
  const vendor = user?.accountType === "VENDOR";
  const r = useResource(
    external,
    vendor ? "/vendor/aura/sessions" : "/customer/updates",
  );
  const [query, setQuery] = useState("");
  const rows: Data[] = vendor
    ? r.data.sessions || []
    : r.data.auraConversations || [];
  const shown = rows.filter((row) =>
    `${row.title || ""} ${row.eventTitle || ""} ${row.preview || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Page
      {...r}
      title="Your Aura+ conversations"
      subtitle="Pick up where you left off."
    >
      <Button
        title="Start a new conversation"
        onPress={() =>
          navigation.navigate("Chat", {
            kind: "aura",
            newChatKey: String(Date.now()),
          })
        }
      />
      <Field
        label="Find a conversation"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by event or conversation"
      />
      {shown.map((row) => (
        <MenuRow
          key={row.sessionId}
          title={row.title || row.eventTitle || "Aura+ conversation"}
          subtitle={[row.preview, date(row.updatedAt)]
            .filter(Boolean)
            .join(" · ")}
          icon="sparkles-outline"
          onPress={() =>
            navigation.navigate("Chat", {
              kind: "aura",
              sessionId: row.sessionId,
              eventId: row.eventId || undefined,
            })
          }
        />
      ))}
      {!shown.length && (
        <Empty
          title={
            query
              ? "No matching conversations"
              : "Your first conversation starts here"
          }
          description="Conversations saved by the existing backend will appear here."
        />
      )}
    </Page>
  );
}
