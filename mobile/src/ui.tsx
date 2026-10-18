import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Client, Data } from "./api/client";
import { usePalette } from "./Theme";
import brand from "./brand.generated.json";
export { usePalette } from "./Theme";
export function Txt({
  children,
  size = 15,
  muted = false,
  bold = false,
  style,
  numberOfLines,
}: React.PropsWithChildren<{
  size?: number;
  muted?: boolean;
  bold?: boolean;
  style?: any;
  numberOfLines?: number;
}>) {
  const c = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: size,
          lineHeight: size * 1.45,
          color: muted ? c.muted : c.ink,
          fontWeight: bold ? "700" : "400",
          fontFamily: bold ? "Inter_700Bold" : "Inter_400Regular",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Icon({
  name,
  color,
  size = 22,
}: {
  name: any;
  color?: string;
  size?: number;
}) {
  const c = usePalette();
  return <Ionicons name={name} size={size} color={color || c.accent} />;
}
export function Button({
  title,
  onPress,
  busy,
  secondary,
  danger,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  variant?: "primary" | "navy";
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 50,
          paddingHorizontal: 18,
          paddingVertical: 13,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: secondary
            ? c.soft
            : danger
              ? c.danger
              : variant === "navy"
                ? brand.light.navy
                : c.accent,
          opacity: disabled || busy ? 0.55 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={
            secondary ? c.accent : variant === "navy" ? "#ffffff" : c.onAccent
          }
        />
      ) : (
        <Txt
          bold
          style={{
            color: secondary
              ? c.accent
              : variant === "navy"
                ? "#ffffff"
                : c.onAccent,
          }}
        >
          {title}
        </Txt>
      )}
    </Pressable>
  );
}
export function Card({
  children,
  onPress,
}: React.PropsWithChildren<{ onPress?: () => void }>) {
  const c = usePalette();
  const style = {
    backgroundColor: c.card,
    borderRadius: 23,
    padding: 20,
    borderWidth: 1,
    borderColor: c.line,
    gap: 12,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: 7 }}>
      <Txt bold size={13}>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        autoCapitalize="sentences"
        {...props}
        style={[
          {
            backgroundColor: c.card,
            color: c.ink,
            borderColor: c.line,
            borderWidth: 1,
            borderRadius: 15,
            padding: 15,
            fontSize: 16,
            fontFamily: "Inter_400Regular",
            minHeight: props.multiline ? 100 : 52,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Pill({ children }: React.PropsWithChildren) {
  const c = usePalette();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: c.soft,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Txt size={11} bold style={{ color: c.accent }}>
        {children}
      </Txt>
    </View>
  );
}
export function Choice({
  label,
  value,
  values,
  onChange,
  labels = {},
  variant = "primary",
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  labels?: Record<string, string>;
  variant?: "primary" | "navy" | "tabs";
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 9 }}>
      <Txt size={13} bold>
        {label}
      </Txt>
      <View style={styles.wrap}>
        {values.map((v) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: value === v }}
            key={v}
            onPress={() => onChange(v)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderRadius: 13,
              backgroundColor:
                value === v
                  ? variant === "navy"
                    ? brand.light.navy
                    : variant === "tabs"
                      ? c.card
                      : c.accent
                  : variant === "tabs"
                    ? c.soft
                    : c.card,
              borderWidth: 1,
              borderColor:
                value === v && variant === "tabs" ? c.accent : c.line,
            }}
          >
            <Txt
              size={13}
              style={{
                color:
                  value === v
                    ? variant === "navy"
                      ? "#ffffff"
                      : variant === "tabs"
                        ? c.navy
                        : c.onAccent
                    : c.muted,
              }}
            >
              {labels[v] || human(v)}
            </Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function MultiChoice({
  label,
  values,
  selected,
  onChange,
  labels = {},
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  labels?: Record<string, string>;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 9 }}>
      <Txt bold size={13}>
        {label}
      </Txt>
      <View style={styles.wrap}>
        {values.map((v) => (
          <Pressable
            key={v}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(v) }}
            onPress={() =>
              onChange(
                selected.includes(v)
                  ? selected.filter((s) => s !== v)
                  : [...selected, v],
              )
            }
            style={{
              minHeight: 44,
              justifyContent: "center",
              padding: 12,
              borderRadius: 13,
              backgroundColor: selected.includes(v) ? c.soft : c.card,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Txt size={13}>
              {selected.includes(v) ? "✓ " : ""}
              {labels[v] || v}
            </Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "Your updates will appear here as your event moves forward.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <Icon name="sparkles-outline" size={30} />
      <Txt bold size={19}>
        {title}
      </Txt>
      <Txt muted>{description}</Txt>
    </Card>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  const c = usePalette();
  return message ? (
    <View
      accessibilityRole="alert"
      style={{
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.danger,
        gap: 12,
      }}
    >
      <Txt style={{ color: c.danger }}>{message}</Txt>
      {retry && <Button title="Try again" onPress={retry} secondary />}
    </View>
  ) : null;
}
export function Page({
  children,
  title,
  subtitle,
  loading,
  error,
  refresh,
  refreshing = false,
}: React.PropsWithChildren<{
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  refresh?: () => void;
  refreshing?: boolean;
}>) {
  const c = usePalette();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 42,
          gap: 18,
          maxWidth: 820,
          width: "100%",
          alignSelf: "center",
        }}
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={c.accent}
            />
          ) : undefined
        }
      >
        {title && (
          <View style={{ gap: 5, marginVertical: 6 }}>
            <Txt size={29} bold>
              {title}
            </Txt>
            {subtitle && <Txt muted>{subtitle}</Txt>}
          </View>
        )}
        <ErrorNotice message={error} retry={refresh} />
        {loading ? (
          <View style={{ paddingVertical: 60, gap: 15 }}>
            <ActivityIndicator size="large" color={c.accent} />
            <Txt muted style={{ textAlign: "center" }}>
              Getting everything ready…
            </Txt>
          </View>
        ) : error ? null : (
          children
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function MenuRow({
  title,
  subtitle,
  icon = "chevron-forward",
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <Icon name={icon} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt bold>{title}</Txt>
          {subtitle && (
            <Txt size={12} muted>
              {subtitle}
            </Txt>
          )}
        </View>
        <Icon name="chevron-forward" size={17} />
      </View>
    </Card>
  );
}
export function Stats({ items }: { items: [string, string | number][] }) {
  const c = usePalette();
  return (
    <View style={styles.wrap}>
      {items.map(([label, value]) => (
        <View
          key={label}
          style={{
            flexGrow: 1,
            flexBasis: "43%",
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 20,
            padding: 17,
            gap: 5,
          }}
        >
          <Txt muted size={12}>
            {label}
          </Txt>
          <Txt size={25} bold>
            {value}
          </Txt>
        </View>
      ))}
    </View>
  );
}
export function useResource(api: Client, path: string, pollMs = 0) {
  const [snapshot, setSnapshot] = useState({ api, path, data: {} as Data });
  const current = snapshot.api === api && snapshot.path === path;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const serial = useRef(0);
  const load = useCallback(
    async (pull = false) => {
      const request = ++serial.current;
      setSnapshot((previous) =>
        previous.api === api && previous.path === path
          ? previous
          : { api, path, data: {} },
      );
      if (pull) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const value = await api.call(path);
        if (serial.current === request) setSnapshot({ api, path, data: value });
      } catch (e) {
        if (serial.current === request) setError((e as Error).message);
      } finally {
        if (serial.current === request) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [api, path],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = pollMs
        ? setInterval(() => {
            void load(true);
          }, pollMs)
        : undefined;
      return () => {
        serial.current++;
        if (timer) clearInterval(timer);
      };
    }, [load, pollMs]),
  );
  return {
    data: current ? snapshot.data : {},
    loading: loading || !current,
    error,
    refreshing,
    refresh: () => load(true),
    reload: load,
  };
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export const confirm = (title: string, message: string, action: () => void) =>
  Alert.alert(title, message, [
    { text: "Keep as is", style: "cancel" },
    { text: "Confirm", onPress: action },
  ]);
export const human = (v: unknown) =>
  String(v ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const money = (v: unknown) =>
  v == null
    ? "Not quoted"
    : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const id = (v: Data) => String(v.id || v._id || "");
export const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date to be decided";
export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
