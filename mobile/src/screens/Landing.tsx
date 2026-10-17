import React, { useState } from "react";
import {
  ImageBackground,
  Modal,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { LogoWord } from "../BrandLogo";
import { PublicGradient, PublicLayout } from "../PublicLayout";
import { usePlanningIntent } from "../PlanningIntent";
import { useSession } from "../auth/Session";
import { Button, Icon, Txt, usePalette } from "../ui";

const suggestions = [
  "My daughter's wedding",
  "Plan my birthday",
  "Corporate event for 300 people",
  "Arrange a Puja",
  "Plan an anniversary",
];
export function LandingScreen({ navigation }: any) {
  const c = usePalette();
  const wide = useWindowDimensions().width >= 760;
  const [text, setText] = useState("");
  const [planning, setPlanning] = useState(false);
  const { prompt, setPrompt } = usePlanningIntent();
  const { setActiveDomain } = useSession();
  function authenticate(mode = "login", accountType = "CUSTOMER") {
    if (accountType === "VENDOR") setPrompt("");
    setPlanning(false);
    setActiveDomain("external");
    navigation.navigate("Auth", { mode, accountType });
  }
  function begin(value: string) {
    setPrompt(value.trim());
    setPlanning(true);
  }
  return (
    <PublicLayout navigation={navigation}>
      <View
        style={{
          width: "100%",
          maxWidth: 1200,
          alignSelf: "center",
          paddingHorizontal: 24,
          paddingTop: wide ? 76 : 46,
          paddingBottom: 56,
          gap: 40,
          flexDirection: wide ? "row" : "column",
          alignItems: "center",
        }}
      >
        <View
          style={{
            flex: wide ? 1.1 : undefined,
            width: wide ? undefined : "100%",
            gap: 24,
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: c.card,
              borderRadius: 30,
              borderWidth: 1,
              borderColor: c.line,
              paddingHorizontal: 14,
              paddingVertical: 9,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 7,
                backgroundColor: c.accent,
              }}
            />
            <Txt size={12} bold>
              Events made simple with AI
            </Txt>
          </View>
          <View>
            <Txt
              bold
              size={wide ? 52 : 38}
              style={{
                lineHeight: wide ? 59 : 45,
                letterSpacing: -1.5,
                fontFamily: "Inter_800ExtraBold",
              }}
            >
              Tell us what you're planning.
            </Txt>
            <Txt
              bold
              size={wide ? 52 : 38}
              style={{
                lineHeight: wide ? 59 : 45,
                letterSpacing: -1.5,
                color: c.accent,
                fontFamily: "Inter_800ExtraBold",
              }}
            >
              We'll handle the rest.
            </Txt>
          </View>
          <Txt muted size={16} style={{ lineHeight: 26 }}>
            From weddings and birthdays to corporate events and everything in
            between, STARVNT helps you plan, find, book and manage everything in
            one place.
          </Txt>
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: c.line,
              padding: 9,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              boxShadow: "0px 8px 30px rgba(90,75,209,0.09)",
            }}
          >
            <TextInput
              accessibilityLabel="What are you planning?"
              placeholder="Tell us what you want to arrange..."
              placeholderTextColor={c.muted}
              value={text}
              onChangeText={setText}
              returnKeyType="go"
              onSubmitEditing={() => begin(text)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: 10,
                minHeight: 52,
                fontFamily: "Inter_400Regular",
                color: c.ink,
                fontSize: 14,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start planning"
              onPress={() => begin(text)}
              style={{
                backgroundColor: c.accent,
                width: 48,
                height: 48,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="arrow-forward" color={c.onAccent} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {suggestions.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item}
                onPress={() => {
                  setText(item);
                  begin(item);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: c.line,
                  backgroundColor: c.card,
                  borderRadius: 24,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                }}
              >
                <Txt size={12}>{item}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        {wide && (
          <ImageBackground
            accessibilityLabel="Beautiful wedding setup"
            source={{
              uri: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
            }}
            style={{
              flex: 0.9,
              aspectRatio: 1,
              borderRadius: 32,
              overflow: "hidden",
              justifyContent: "flex-end",
            }}
          >
            <PublicGradient photo />
            <Txt size={24} bold style={{ color: "#ffffff", padding: 28 }}>
              “Beautiful events create happier people.”
            </Txt>
          </ImageBackground>
        )}
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: c.line,
          backgroundColor: c.card,
          padding: 26,
          gap: 22,
          marginTop: "auto",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 1152,
            alignSelf: "center",
            gap: 20,
          }}
        >
          <LogoWord />
          <Txt muted size={13} style={{ maxWidth: 460 }}>
            The AI-native ecosystem for modern events. Plan, book, and celebrate
            with verified vendors and transparent pricing.
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Button title="Plan an Event" onPress={() => begin(text)} />
            <Button
              title="For Vendors"
              secondary
              onPress={() => authenticate("login", "VENDOR")}
            />
            <Button
              title="Register as Vendor"
              secondary
              onPress={() => authenticate("register", "VENDOR")}
            />
          </View>
          <Txt muted size={12}>
            STARVNT · Events. Simplified.
          </Txt>
        </View>
      </View>
      <Modal
        visible={planning}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPlanning(false);
          setPrompt("");
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(14,19,48,.65)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: c.card,
              borderRadius: 28,
              padding: 26,
              gap: 18,
            }}
          >
            <Icon name="sparkles-outline" size={30} />
            <Txt bold size={25}>
              Log in to start planning
            </Txt>
            <Txt muted>
              {prompt
                ? `Aura+ is ready to help you plan “${prompt}”. `
                : "Your next event starts here. "}
              Log in or create a free account to continue.
            </Txt>
            <Button title="Log in" onPress={() => authenticate()} />
            <Button
              title="Create a free account"
              secondary
              onPress={() => authenticate("register")}
            />
            <Button
              title="Maybe later"
              secondary
              onPress={() => {
                setPlanning(false);
                setPrompt("");
              }}
            />
          </View>
        </View>
      </Modal>
    </PublicLayout>
  );
}
