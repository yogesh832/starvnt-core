import { AuraMark } from './AuraMark';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Client, Data } from "./api/client";
import { usePalette } from "./Theme";
import brand from "./brand.generated.json";
import { KeyboardScrollView } from './KeyboardScrollView';
export { usePalette } from "./Theme";
export function Txt({
  children,
  size = 15,
  muted = false,
  bold = false,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: React.PropsWithChildren<{
  size?: number;
  muted?: boolean;
  bold?: boolean;
  style?: any;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}>) {
  const c = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
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
  if (name === "aura") return <AuraMark size={size} />;
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
          maxWidth: '100%',
          flexShrink: 1,
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
            textAlign: 'center',
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
  const compact = useWindowDimensions().width <= 360;
  const style = {
    backgroundColor: c.card,
    borderRadius: 23,
    padding: compact ? 16 : 20,
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
              maxWidth: '100%',
              minHeight: 44,
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
        {values.map((v) => {
          const isSelected = selected.includes(v);
          return (
            <Pressable
              key={v}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              onPress={() =>
                onChange(
                  isSelected
                    ? selected.filter((s) => s !== v)
                    : [...selected, v],
                )
              }
              style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 13,
                backgroundColor: isSelected ? c.soft : c.card,
                borderWidth: 1,
                borderColor: isSelected ? c.accent : c.line,
              }}
            >
              <Icon
                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={isSelected ? c.accent : c.muted}
              />
              <Txt size={13}>
                {labels[v] || v}
              </Txt>
            </Pressable>
          );
        })}
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
  if (!message) return null;
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@starvnt.com";
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.danger,
        backgroundColor: c.card,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Icon name="alert-circle" size={20} color={c.danger} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt bold size={14} style={{ color: c.danger }}>
            Something interrupted this request
          </Txt>
          <Txt size={13} style={{ color: c.ink, lineHeight: 18 }}>
            {message}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {retry && <Button title="Try again" onPress={retry} secondary />}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void Linking.openURL(`mailto:${supportEmail}?subject=Support%20Request%20-%20STARVNT&body=Hi%20STARVNT%20Support,%0A%0AI%20experienced%20an%20issue:%20${encodeURIComponent(message)}%0A`);
          }}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: c.soft,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Txt size={12} bold style={{ color: c.accent }}>
            Contact Support
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
export function SkeletonBox({
  width = "100%",
  height = 20,
  borderRadius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: any;
}) {
  const c = usePalette();
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: c.line,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({
  lines = 3,
  hasAvatar = false,
  style,
}: {
  lines?: number;
  hasAvatar?: boolean;
  style?: any;
}) {
  const c = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 20,
          padding: 16,
          gap: 12,
        },
        style,
      ]}
    >
      {hasAvatar ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <SkeletonBox width={46} height={46} borderRadius={23} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox width="60%" height={16} />
            <SkeletonBox width="40%" height={12} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <SkeletonBox width="50%" height={18} />
          <SkeletonBox width="30%" height={12} />
        </View>
      )}
      <View style={{ gap: 8, marginTop: 4 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBox
            key={i}
            width={i === lines - 1 ? "65%" : "100%"}
            height={13}
          />
        ))}
      </View>
    </View>
  );
}

export function SkeletonRow({ style }: { style?: any }) {
  const c = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 18,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        style,
      ]}
    >
      <SkeletonBox width={38} height={38} borderRadius={12} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="70%" height={15} />
        <SkeletonBox width="45%" height={11} />
      </View>
      <SkeletonBox width={16} height={16} borderRadius={8} />
    </View>
  );
}

export function SkeletonStats() {
  const c = usePalette();
  return (
    <View style={styles.wrap}>
      {[0, 1].map((key) => (
        <View
          key={key}
          style={{
            flexGrow: 1,
            flexBasis: "43%",
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 20,
            padding: 17,
            gap: 10,
          }}
        >
          <SkeletonBox width="50%" height={12} />
          <SkeletonBox width="75%" height={24} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

export function LoadingScroller({
  message = "Getting everything ready…",
}: {
  message?: string;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 16, width: "100%", paddingVertical: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 6,
        }}
      >
        <ActivityIndicator size="small" color={c.accent} />
        <Txt muted size={13} style={{ textAlign: "center" }}>
          {message}
        </Txt>
      </View>
      <SkeletonStats />
      <SkeletonCard lines={3} />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
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
  const compact = useWindowDimensions().width <= 360;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <KeyboardScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: compact ? 16 : 20,
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
              colors={[c.accent, "#7b5cf0", "#9b6dff"]}
              progressBackgroundColor={c.card}
              progressViewOffset={Platform.OS === "android" ? 16 : 0}
            />
          ) : undefined
        }
      >
        {title && (
          <View style={{ gap: 5, marginVertical: 6 }}>
            <Txt size={compact ? 26 : 29} bold>
              {title}
            </Txt>
            {subtitle && <Txt muted>{subtitle}</Txt>}
          </View>
        )}
        <ErrorNotice message={error} retry={refresh} />
        {loading ? (
          <LoadingScroller />
        ) : error ? null : (
          children
        )}
      </KeyboardScrollView>
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
  const c = usePalette();
  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: c.soft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={20} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt bold>{title}</Txt>
          {subtitle && (
            <Txt size={12} muted>
              {subtitle}
            </Txt>
          )}
        </View>
        <Icon name="chevron-forward" size={17} color={c.muted} />
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
          <Txt size={25} bold numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {value}
          </Txt>
        </View>
      ))}
    </View>
  );
}
export function useResource(api: Client, path: string, pollMs = 0, enabled = true) {
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
      if (!enabled) { serial.current++; setLoading(false); return; }
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
    }, [load, pollMs, enabled]),
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
  async function run(action: () => Promise<unknown>) {
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
