import React, { useState } from "react";
import { Alert } from "react-native";
import { external } from "../api/runtime";
import {
  Button,
  Card,
  confirm,
  ErrorNotice,
  Empty,
  Field,
  id,
  money,
  date,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";
import type { Data } from "../api/client";
import brand from "../brand.generated.json";

export function VendorOffers({ route, navigation }: any) {
  const eventId = route.params?.eventId;
  const r = useResource(
    external,
    `/customer/vendor-quotes${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`,
  );
  const offers: Data[] = r.data.quotes || [];
  return (
    <Page
      {...r}
      title="Your vendor offers"
      subtitle="Review every detail before you decide."
    >
      {offers.map((quote) => (
        <VendorOffer
          key={id(quote)}
          q={quote}
          eventId={eventId || quote.eventId}
          navigation={navigation}
          refresh={r.refresh}
          paymentsConfigured={r.data.paymentsConfigured}
        />
      ))}
      {!r.loading && !r.error && !offers.length && (
        <Empty
          title="No vendor offers yet"
          description="Request quotes from your selected vendors to receive their proposals here."
        />
      )}
    </Page>
  );
}
function VendorOffer({
  q,
  eventId,
  navigation,
  refresh,
  paymentsConfigured,
}: any) {
  const a = useAction();
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState("");
  const expired = q.validUntil && Date.parse(q.validUntil) <= Date.now();
  const actionable =
    q.status === "SUBMITTED" && !expired && q.advanceStatus !== "VERIFIED";
  return (
    <Card key={id(q)}>
      <ErrorNotice message={a.error} />
      <Pill>{q.status}</Pill>
      <Txt bold size={22}>
        {q.vendor?.businessName || q.vendorName || "Vendor offer"}
      </Txt>
      <Txt>{q.serviceName}</Txt>
      <Txt bold size={26}>
        {money(q.pricingBreakdown?.totalAmount)}
      </Txt>
      {q.notes && <Txt muted>{q.notes}</Txt>}
      <Txt muted>
        {date(q.eventDate)} ·{" "}
        {q.serviceLocation?.address || q.serviceLocation?.city}
      </Txt>
      {q.validUntil && <Txt muted>Valid until {date(q.validUntil)}</Txt>}
      <Pill>Advance: {q.advanceStatus}</Pill>
      {expired && (
        <Txt muted>This offer has expired. Ask the vendor for a revision.</Txt>
      )}
      {(q.history || []).map((entry: Data, index: number) => (
        <Txt key={index} muted>
          {entry.changedBy}: {entry.reason} · {date(entry.timestamp)}
        </Txt>
      ))}
      <Button
        title="Accept offer"
        secondary
        busy={a.busy}
        disabled={!actionable}
        onPress={() =>
          confirm(
            "Accept this offer?",
            "Review the price and service details before accepting.",
            () => {
              void a.run(async () => {
                const result = await external.call(
                  `/customer/vendor-quotes/${id(q)}/accept`,
                  "POST",
                  { eventId },
                );
                refresh();
                if (result.eventId)
                  navigation.navigate("EventSection", {
                    eventId: String(result.eventId),
                    section: "bookings",
                    title: "Bookings & payments",
                  });
              });
            },
          )
        }
      />
      <Button
        title="Review & pay advance"
        disabled={!actionable || paymentsConfigured === false || a.busy}
        onPress={() => navigation.navigate("Checkout", { quote: q, eventId })}
      />
      {paymentsConfigured === false && (
        <Txt muted>
          Online payments are not configured. Your quote remains available here.
        </Txt>
      )}
      {["CREATED", "PROCESSING", "PAID", "FAILED"].includes(
        q.advanceStatus,
      ) && (
        <Button
          title="Refresh payment verification"
          secondary
          busy={a.busy}
          onPress={() =>
            a.run(async () => {
              await external.call(
                `/customer/vendor-quotes/${id(q)}/reconcile-payment`,
                "POST",
              );
              await refresh();
            })
          }
        />
      )}
      <Field
        label="Negotiation message"
        value={message}
        onChangeText={setMessage}
        multiline
      />
      <Field
        label="Counter budget in ₹ (optional)"
        value={budget}
        onChangeText={setBudget}
        keyboardType="number-pad"
      />
      <Button
        title="Send negotiation"
        secondary
        busy={a.busy}
        disabled={!message.trim() || !actionable}
        onPress={() => {
          void a.run(async () => {
            if (
              budget.trim() &&
              (!Number.isFinite(Number(budget)) || Number(budget) <= 0)
            )
              throw new Error("Enter a positive counter budget.");
            await external.call(
              `/customer/vendor-quotes/${id(q)}/negotiate`,
              "POST",
              {
                message: message.trim(),
                counterBudget: budget ? Number(budget) : undefined,
              },
            );
            setMessage("");
            setBudget("");
            refresh();
          });
        }}
      />
    </Card>
  );
}
export function CheckoutScreen({ route, navigation }: any) {
  return (
    <CheckoutBody
      key={id(route.params.quote || route.params.reservation || {})}
      route={route}
      navigation={navigation}
    />
  );
}
function CheckoutBody({ route, navigation }: any) {
  const { eventId, reservation, quote } = route.params;
  const [coupon, setCoupon] = useState("");
  const [notice, setNotice] = useState("");
  const a = useAction();
  async function pay() {
    // Load the native SDK before creating an order; missing native builds do not create orphan orders.
    const RazorpayCheckout = (await import("react-native-razorpay")).default;
    const endpoint = quote
      ? `/customer/vendor-quotes/${id(quote)}`
      : `/customer/events/${encodeURIComponent(eventId)}/reservations/${id(reservation)}`;
    const result = await external.call(
      `${endpoint}/${quote ? "pay-advance" : "pay"}`,
      "POST",
      { couponCode: coupon.trim() },
    );
    const checkout = result.checkout;
    if (!checkout?.orderId || !checkout.key)
      throw new Error("Could not prepare checkout. Please try again.");
    let response: Data;
    try {
      response = await RazorpayCheckout.open({
        ...checkout,
        order_id: checkout.orderId,
        theme: { color: brand.light.accent },
      });
    } catch (e: any) {
      throw new Error(
        e.description ||
          "Checkout was closed. Your payment status remains available in bookings.",
      );
    }
    await external.call(
      quote
        ? `${endpoint}/checkout-complete`
        : `/customer/events/${encodeURIComponent(eventId)}/payments/${id(result.payment)}/checkout-complete`,
      "POST",
      response,
    );
    setNotice(
      "Payment submitted. STARVNT is verifying the payment and availability. Check bookings for the confirmed result.",
    );
    Alert.alert(
      "Payment is processing",
      "Confirmation comes from the payment provider and STARVNT verification.",
      [
        {
          text: "View bookings",
          onPress: () =>
            eventId
              ? navigation.replace("EventSection", {
                  eventId,
                  section: "bookings",
                  title: "Bookings & payments",
                })
              : navigation.goBack(),
        },
      ],
    );
  }
  return (
    <Page
      title="One step closer"
      subtitle="Review your payment before continuing."
    >
      <Card>
        <Pill>SECURE CHECKOUT</Pill>
        <Txt bold size={23}>
          {quote?.serviceName || reservation?.packageName}
        </Txt>
        <Txt muted>
          {quote?.vendorName ||
            quote?.vendor?.businessName ||
            reservation?.vendorName}
        </Txt>
        <Txt>
          Package total{" "}
          {money(
            quote?.pricingBreakdown?.totalAmount ?? reservation?.packageTotal,
          )}
        </Txt>
        <Txt muted>
          The exact payable amount, including any valid coupon, is shown in
          checkout.
        </Txt>
      </Card>
      <Field
        label="Coupon code (optional)"
        value={coupon}
        onChangeText={setCoupon}
        autoCapitalize="characters"
      />
      <Txt muted>
        Only a verified payment and confirmed availability create a booking. A
        checkout callback is recorded as processing.
      </Txt>
      {notice ? (
        <Card>
          <Txt>{notice}</Txt>
        </Card>
      ) : null}
      <ErrorNotice message={a.error} />
      <Button
        title="Continue to secure payment"
        busy={a.busy}
        disabled={!!notice}
        onPress={() => {
          void a.run(pay);
        }}
      />
    </Page>
  );
}
