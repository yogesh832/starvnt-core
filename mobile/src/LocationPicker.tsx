import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { external } from "./api/runtime";
import type { Data } from "./api/client";
import { Button, Icon, Txt, usePalette } from "./ui";

export function LocationPicker({
  initialQuery = "",
  onSelect,
  title = "Choose an event location",
  buttonTitle = "Choose location",
  disabled = false,
}: {
  initialQuery?: string;
  onSelect: (place: Data) => void;
  title?: string;
  buttonTitle?: string;
  disabled?: boolean;
}) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Data[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setPlaces([]);
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void external
        .call(`/customer/locations/search?q=${encodeURIComponent(query.trim())}`)
        .then((result) => {
          if (!cancelled) setPlaces(Array.isArray(result.places) ? result.places : []);
        })
        .catch((reason) => {
          if (!cancelled) {
            setPlaces([]);
            setError(reason instanceof Error ? reason.message : "Location search is unavailable. Try again.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  function choose(place: Data) {
    onSelect(place);
    setOpen(false);
    setQuery("");
    setPlaces([]);
  }

  return (
    <>
      <Button
        title={buttonTitle}
        secondary
        disabled={disabled}
        onPress={() => {
          setQuery(initialQuery.trim());
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close location picker"
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={{
              maxHeight: "86%",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 18,
              gap: 12,
              backgroundColor: c.card,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt bold size={18}>{title}</Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="Close locations" onPress={() => setOpen(false)} style={{ padding: 8 }}>
                <Icon name="close" size={23} />
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Search town or area"
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search town, area, or landmark"
              placeholderTextColor={c.muted}
              style={{ minHeight: 50, color: c.ink, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 13, backgroundColor: c.bg }}
            />
            {loading && <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}><ActivityIndicator color={c.accent} /><Txt muted size={12}>Searching verified locations…</Txt></View>}
            {!!error && <Txt size={12} style={{ color: c.danger }}>{error}</Txt>}
            {!loading && !error && query.trim().length >= 2 && places.length === 0 && <Txt muted size={12}>No places found. Try a nearby town or area.</Txt>}
            <FlatList
              style={{ flexGrow: 0 }}
              data={places}
              keyExtractor={(place, index) => String(place.id || `${place.address || place.name}-${index}`)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.name}, ${item.city}, ${item.state}`}
                  onPress={() => choose(item)}
                  style={{ minHeight: 58, padding: 12, borderBottomWidth: 1, borderColor: c.line, justifyContent: "center", gap: 2 }}
                >
                  <Txt bold>{[item.name, [item.city, item.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</Txt>
                  {!!item.address && <Txt muted size={11} numberOfLines={2}>{item.address}</Txt>}
                </Pressable>
              )}
            />
            <Txt muted size={11}>Select a result to save its standardized address and map coordinates.</Txt>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
