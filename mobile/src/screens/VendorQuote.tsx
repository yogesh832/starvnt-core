import React from "react";
import { external } from "../api/runtime";
import {
  Button,
  Card,
  confirm,
  date,
  Empty,
  ErrorNotice,
  human,
  id,
  money,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";
import type { Data } from "../api/client";

export function VendorQuote({ route, navigation }: any) {
  return (
    <VendorQuoteBody
      key={route.params.quoteId}
      route={route}
      navigation={navigation}
    />
  );
}
function VendorQuoteBody({ route, navigation }: any) {
  const { quoteId } = route.params;
  const r = useResource(external, `/quotes/${encodeURIComponent(quoteId)}`);
  const a = useAction();
  const quote = r.data.quote;
  return (
    <Page
      {...r}
      title={quote?.serviceName || "Quote details"}
      subtitle={quote?.quoteReference}
    >
      <ErrorNotice message={a.error} />
      {quote && (
        <>
          <Card>
            <Pill>{human(quote.status)}</Pill>
            <Txt bold size={24}>
              {money(quote.pricingBreakdown?.totalAmount)}
            </Txt>
            <Txt>{quote.customer?.fullName || quote.clientName}</Txt>
            <Txt>{date(quote.eventDate)}</Txt>
            <Txt muted>
              {quote.serviceLocation?.address || quote.serviceLocation?.city}
            </Txt>
            {Object.entries(quote.pricingBreakdown || {})
              .filter(([key]) => key !== "totalAmount")
              .map(([key, value]) => (
                <Txt key={key}>
                  {human(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}:{" "}
                  {money(value)}
                </Txt>
              ))}
            {!!quote.notes && <Txt>{quote.notes}</Txt>}
            {quote.validUntil && (
              <Txt muted>Valid until {date(quote.validUntil)}</Txt>
            )}
          </Card>
          {quote.status === "DRAFT" && (
            <Button
              title="Send draft quote to customer"
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Send this proposal?",
                  "Review the pricing and notes before submitting your offer.",
                  () =>
                    a.run(async () => {
                      await external.call(
                        `/quotes/${encodeURIComponent(quoteId)}/transition`,
                        "POST",
                        {
                          targetStatus: "SUBMITTED",
                          reason:
                            "Vendor finalized proposal in mobile workspace",
                        },
                      );
                      await r.refresh();
                    }),
                )
              }
            />
          )}
          {["DRAFT", "SUBMITTED"].includes(quote.status) && (
            <Button
              title="Revise proposal"
              secondary
              disabled={a.busy}
              onPress={() =>
                navigation.navigate("VendorForm", {
                  kind: "quote",
                  item: quote,
                  revise: true,
                })
              }
            />
          )}
          <Button
            title="Open quote conversation"
            secondary
            busy={a.busy}
            onPress={() =>
              a.run(async () => {
                const result = await external.call(
                  `/vendor/messages/context/quote/${encodeURIComponent(quoteId)}`,
                  "POST",
                );
                if (!id(result.thread || {}))
                  throw new Error("Could not open this conversation.");
                navigation.navigate("Chat", {
                  kind: "thread",
                  threadId: id(result.thread),
                  vendor: true,
                });
              })
            }
          />
          <Txt bold size={22}>
            Proposal & negotiation history
          </Txt>
          {[...(quote.history || [])]
            .reverse()
            .map((entry: Data, index: number) => (
              <Card key={index}>
                <Pill>{human(entry.toStatus)}</Pill>
                <Txt>{entry.reason || "Quote updated"}</Txt>
                <Txt muted>
                  {entry.changedBy} · {date(entry.timestamp)}
                </Txt>
              </Card>
            ))}
          {!quote.history?.length && <Txt muted>No revisions recorded.</Txt>}
        </>
      )}
      {!r.loading && !r.error && !quote && <Empty title="Quote unavailable" />}
    </Page>
  );
}
