import React, { useEffect, useRef, useState } from "react";
import { external } from "./api/runtime";
import { Button, Card, ErrorNotice, Field, Txt } from "./ui";

export function VendorMessageField({
  value,
  onChange,
  context,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  context: { type: "quote" | "opportunity" | "review" | "booking"; id: string };
  label: string;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scope = `${context.type}:${context.id}`;
  const request = useRef(0);
  const latest = useRef({ scope, value, onChange, disabled });
  latest.current = { scope, value, onChange, disabled };
  useEffect(() => {
    request.current += 1;
    setExpanded(false);
    setInstructions("");
    setBusy(false);
    setError("");
    return () => {
      request.current += 1;
    };
  }, [scope]);
  async function generate() {
    if (busy || disabled || !context.id || !instructions.trim()) return;
    const token = ++request.current;
    const original = value;
    setBusy(true);
    setError("");
    try {
      const result = await external.call("/vendor/messages/draft", "POST", {
        context,
        instructions: instructions.trim(),
      });
      if (
        token !== request.current ||
        latest.current.scope !== scope ||
        latest.current.disabled
      )
        return;
      if (typeof result.draft !== "string" || !result.draft.trim())
        throw new Error("Aura could not write a draft. Please try again.");
      if (latest.current.value !== original)
        throw new Error(
          "You edited the message while Aura was writing. Your edits were kept; generate again if needed.",
        );
      latest.current.onChange(result.draft);
      setExpanded(false);
    } catch (failure) {
      if (token === request.current)
        setError((failure as Error).message || "Could not write a draft.");
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  return (
    <Card>
      <Field
        label={label}
        multiline
        maxLength={2000}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
      />
      <Button
        title={expanded ? "Close Aura drafting" : "Write with Aura+"}
        secondary
        disabled={disabled || !context.id || busy}
        onPress={() => setExpanded((open) => !open)}
      />
      {expanded && (
        <>
          <Field
            label="What details should Aura include?"
            multiline
            maxLength={2000}
            value={instructions}
            onChangeText={setInstructions}
            editable={!disabled && !busy}
          />
          <Button
            title={
              value.trim() ? "Replace draft with Aura" : "Generate a draft"
            }
            busy={busy}
            disabled={disabled || !instructions.trim()}
            onPress={() => {
              void generate();
            }}
          />
        </>
      )}
      <ErrorNotice message={error} />
      <Txt muted>Review and edit your message before submitting.</Txt>
    </Card>
  );
}
