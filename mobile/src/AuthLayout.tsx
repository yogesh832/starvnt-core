import React from "react";
import { ImageBackground, View, useWindowDimensions } from "react-native";
import { LogoWord } from "./BrandLogo";
import { PublicGradient, PublicLayout } from "./PublicLayout";
import { Txt, usePalette } from "./ui";

export function AuthLayout({
  children,
  navigation,
  vendor,
  register,
  admin,
}: React.PropsWithChildren<{
  navigation: any;
  vendor: boolean;
  register: boolean;
  admin: boolean;
}>) {
  const c = usePalette();
  const wide = useWindowDimensions().width >= 850;
  return (
    <PublicLayout navigation={navigation} auth>
      <View
        style={{
          width: "100%",
          maxWidth: 1040,
          alignSelf: "center",
          padding: 20,
          paddingVertical: wide ? 48 : 24,
        }}
      >
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            backgroundColor: c.card,
            borderRadius: 32,
            borderWidth: 1,
            borderColor: c.line,
            overflow: "hidden",
            boxShadow: "0px 16px 50px rgba(14,19,48,0.10)",
          }}
        >
          <ImageBackground
            source={{
              uri: vendor
                ? "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1600&q=85"
                : "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1600&q=85",
            }}
            style={{
              backgroundColor: "#0e1330",
              width: wide ? "42%" : "100%",
              minHeight: wide ? 640 : 295,
            }}
          >
            <PublicGradient photo />
            <View
              style={{
                padding: wide ? 30 : 24,
                flex: 1,
                gap: 20,
                justifyContent: "space-between",
              }}
            >
              <LogoWord
                light
                sub={
                  vendor
                    ? "VENDOR OS"
                    : admin
                      ? "STARVNT CORE"
                      : "EVENTS. SIMPLIFIED."
                }
              />
              <View style={{ gap: 12 }}>
                <Txt
                  size={10}
                  bold
                  style={{ color: "#ddd6fe", letterSpacing: 1.5 }}
                >
                  {admin
                    ? "INTERNAL ACCESS"
                    : vendor
                      ? "EVENT STUDIO OPERATING SYSTEM"
                      : "EVENT COORDINATION PLATFORM"}
                </Txt>
                <Txt
                  bold
                  size={wide ? 35 : 29}
                  style={{ color: "#ffffff", lineHeight: wide ? 42 : 35 }}
                >
                  {admin
                    ? "Welcome to STARVNT Core."
                    : register
                      ? vendor
                        ? "Scale your Event Studio."
                        : "Join STARVNT."
                      : vendor
                        ? "Welcome back to Vendor OS."
                        : "Welcome back."}
                </Txt>
                <Txt size={13} style={{ color: "#e2e8f0", lineHeight: 21 }}>
                  {admin
                    ? "Manage your team and operations in one place."
                    : vendor
                      ? "Manage incoming verified client leads, send instant calendar quotes, and secure milestone payouts."
                      : "Sign in to access your AI event planner Aura+, verified vendor quotes, and event bookings."}
                </Txt>
              </View>
              {wide && (
                <Txt
                  size={14}
                  style={{ color: "#ffffff", fontStyle: "italic" }}
                >
                  “Beautiful events create happier people.”{"\n"}— STARVNT
                </Txt>
              )}
            </View>
          </ImageBackground>
          <View style={{ flex: 1, padding: wide ? 36 : 23, gap: 20 }}>
            {children}
          </View>
        </View>
      </View>
    </PublicLayout>
  );
}
