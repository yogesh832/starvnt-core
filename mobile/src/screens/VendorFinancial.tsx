import React, { useEffect, useRef, useState } from "react";
import type { Data } from "../api/client";
import { external } from "../api/runtime";
import {
  Button,
  Card,
  Choice,
  confirm,
  date,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";

export function VendorFinancial() {
  const r = useResource(external, "/vendor/financial");
  const history = useResource(external, "/vendor/financial/bank/verifications");
  const a = useAction();
  const hydrated = useRef(false);
  const [pan, setPan] = useState("");
  const [gstRegistered, setGstRegistered] = useState("no");
  const [gstin, setGstin] = useState("");
  const [discovery, setDiscovery] = useState<Data | null>(null);
  const [feedback, setFeedback] = useState("");
  const [bank, setBank] = useState<Data>({
    accountHolderName: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
    accountType: "SAVINGS",
  });
  const profile = r.data.profile || {};
  useEffect(() => {
    if (!r.data.profile || hydrated.current) return;
    hydrated.current = true;
    setPan(profile.pan?.panNumber || "");
    setGstRegistered(profile.gst?.isRegistered ? "yes" : "no");
    setGstin(profile.gst?.isRegistered ? profile.gst.gstin || "" : "");
    const saved = profile.bankAccount || {};
    setBank({
      accountHolderName: saved.accountHolderName || "",
      accountNumber: saved.accountNumber || "",
      ifsc: saved.ifsc || "",
      bankName: saved.bankName || "",
      accountType: saved.accountType || "SAVINGS",
    });
  }, [r.data]);
  const validatePan = () => {
    const value = pan.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value))
      throw new Error("Enter a valid 10-character PAN.");
    return value;
  };
  const bankBody = () => {
    if (
      !bank.accountHolderName.trim() ||
      !bank.bankName.trim() ||
      !/^\d{6,20}$/.test(bank.accountNumber.trim()) ||
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc.trim().toUpperCase())
    )
      throw new Error(
        "Enter the account holder, bank name, account number and valid IFSC.",
      );
    return Object.fromEntries(
      Object.entries(bank).map(([key, value]) => [key, String(value).trim()]),
    ) as Data;
  };
  const act = async (path: string, body: Data) => {
    setFeedback("");
    try {
      const result = await external.call(
        `/vendor/financial/${path}`,
        "POST",
        body,
      );
      setFeedback(
        result.failureReason ||
          result.message ||
          `Status: ${human(result.status || result.pan?.verificationStatus || result.gst?.verificationStatus || "Saved")}`,
      );
    } finally {
      await Promise.allSettled([r.refresh(), history.refresh()]);
    }
  };
  return (
    <Page
      {...r}
      title="Financial onboarding"
      subtitle="PAN, GST registration and settlement account."
    >
      <ErrorNotice message={a.error || history.error} />
      {!!feedback && (
        <Card>
          <Txt>{feedback}</Txt>
        </Card>
      )}
      <Card>
        <Txt bold>Settlement readiness</Txt>
        <Pill>
          {r.data.isSettlementEligible ? "ELIGIBLE" : "SETUP INCOMPLETE"}
        </Pill>
        <Txt muted>
          Verification and settlement eligibility are determined by Core.
        </Txt>
      </Card>
      <Card>
        <Txt bold size={21}>
          PAN verification
        </Txt>
        <Pill>{human(profile.pan?.verificationStatus || "NOT_VERIFIED")}</Pill>
        {!!profile.pan?.legalName && <Txt>{profile.pan.legalName}</Txt>}
        <Field
          label="PAN number"
          autoCapitalize="characters"
          value={pan}
          onChangeText={(v) => setPan(v.toUpperCase())}
          maxLength={10}
        />
        <Button
          title="Save & verify PAN"
          busy={a.busy}
          onPress={() =>
            a.run(async () => act("pan", { panNumber: validatePan() }))
          }
        />
      </Card>
      <Card>
        <Txt bold size={21}>
          GST registration
        </Txt>
        <Pill>
          {human(profile.gst?.verificationStatus || "NOT_APPLICABLE")}
        </Pill>
        <Choice
          label="Are you GST registered?"
          values={["yes", "no"]}
          value={gstRegistered}
          onChange={setGstRegistered}
        />
        {gstRegistered === "yes" && (
          <>
            <Field
              label="GSTIN"
              autoCapitalize="characters"
              value={gstin}
              onChangeText={(v) => setGstin(v.toUpperCase())}
              maxLength={15}
            />
            <Button
              title="Find registrations using PAN"
              secondary
              busy={a.busy}
              onPress={() =>
                a.run(async () => {
                  const result = await external.call(
                    "/vendor/financial/discover-gstin",
                    "POST",
                    { pan: validatePan() },
                  );
                  setDiscovery(result);
                })
              }
            />
            {discovery && (
              <Txt>{discovery.message || "Registration search completed."}</Txt>
            )}
            {(discovery?.gstins || []).map((item: Data | string) => {
              const value = typeof item === "string" ? item : item.gstin;
              return (
                <Button
                  key={value}
                  title={value}
                  secondary
                  onPress={() => setGstin(value)}
                />
              );
            })}
          </>
        )}
        <Button
          title={
            gstRegistered === "yes"
              ? "Save & verify GSTIN"
              : "Save GST registration status"
          }
          busy={a.busy}
          onPress={() =>
            a.run(async () => {
              const value = gstin.trim().toUpperCase();
              if (
                gstRegistered === "yes" &&
                !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)
              )
                throw new Error("Enter a valid 15-character GSTIN.");
              await act("gst", {
                isRegistered: gstRegistered === "yes",
                ...(gstRegistered === "yes" ? { gstin: value } : {}),
              });
            })
          }
        />
      </Card>
      <Card>
        <Txt bold size={21}>
          Settlement bank account
        </Txt>
        <Pill>
          {human(profile.bankAccount?.verificationStatus || "NOT_VERIFIED")}
        </Pill>
        {!!profile.bankAccount?.failureReason && (
          <ErrorNotice message={profile.bankAccount.failureReason} />
        )}
        {[
          ["accountHolderName", "Account holder name"],
          ["accountNumber", "Account number"],
          ["ifsc", "IFSC"],
          ["bankName", "Bank name"],
        ].map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={bank[key]}
            autoCapitalize={key === "ifsc" ? "characters" : "words"}
            keyboardType={key === "accountNumber" ? "number-pad" : "default"}
            onChangeText={(v) =>
              setBank((b) => ({
                ...b,
                [key]: key === "ifsc" ? v.toUpperCase() : v,
              }))
            }
          />
        ))}
        <Choice
          label="Account type"
          values={["SAVINGS", "CURRENT", "CC_OD", "OTHER"]}
          value={bank.accountType}
          onChange={(v) => setBank((b) => ({ ...b, accountType: v }))}
        />
        <Button
          title="Save bank details"
          busy={a.busy}
          onPress={() => a.run(async () => act("bank", bankBody()))}
        />
        <Button
          title="Verify this bank account"
          secondary
          busy={a.busy}
          onPress={() =>
            confirm(
              "Verify bank account?",
              "Core will submit the displayed bank details to the configured verification provider.",
              () => a.run(async () => act("bank/verify", bankBody())),
            )
          }
        />
      </Card>
      <Txt bold size={21}>
        Verification history
      </Txt>
      {(history.data.verifications || []).map((entry: Data) => (
        <Card key={id(entry)}>
          <Pill>{human(entry.status || entry.verificationStatus)}</Pill>
          <Txt muted>{date(entry.createdAt)}</Txt>
          {!!entry.failureReason && <Txt>{entry.failureReason}</Txt>}
          {!!entry.nameMatchStatus && (
            <Txt>Name match: {human(entry.nameMatchStatus)}</Txt>
          )}
        </Card>
      ))}
      {!history.loading && !history.data.verifications?.length && (
        <Empty
          title="No bank verification attempts"
          description="Attempts and their provider statuses will appear here."
        />
      )}
    </Page>
  );
}
