import React, { useState } from "react";
import { Alert } from "react-native";
import { external } from "../api/runtime";
import {
  Button,
  Card,
  confirm,
  ErrorNotice,
  Field,
  id,
  money,
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
  const r = useResource(external, "/customer/vendor-quotes");
  const a = useAction();
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState("");
  const offers: Data[] = (r.data.quotes || []).filter(
    (q: Data) =>
      !eventId || !q.event || String(q.event?._id || q.event) === eventId,
  );
  return (
    <Page
      {...r}
      title="Your vendor offers"
      subtitle="Review every detail before you decide."
    >
      <ErrorNotice message={a.error} />
      {offers.map((q) => (
        <Card key={id(q)}>
          <Pill>{q.status}</Pill>
          <Txt bold size={22}>
            {q.vendor?.businessName || q.vendorName || "Vendor offer"}
          </Txt>
          <Txt>{q.serviceName}</Txt>
          <Txt bold size={26}>
            {money(q.pricingBreakdown?.totalAmount)}
          </Txt>
          {q.notes && <Txt muted>{q.notes}</Txt>}
          <Button
            title="Accept offer"
            secondary
            busy={a.busy}
            onPress={() =>
              confirm(
                "Accept this offer?",
                "Review the price and service details before accepting.",
                () => {
                  void a.run(async () => {
                    await external.call(
                      `/customer/vendor-quotes/${id(q)}/accept`,
                      "POST",
                      { eventId },
                    );
                    r.refresh();
                  });
                },
              )
            }
          />
          <Button
            title="Review & pay advance"
            onPress={() =>
              navigation.navigate("Checkout", { quote: q, eventId })
            }
          />
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
            disabled={!message.trim()}
            onPress={() => {
              void a.run(async () => {
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
                r.refresh();
              });
            }}
          />
        </Card>
      ))}
    </Page>
  );
}
export function CheckoutScreen({ route, navigation }: any) {
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
