import React, { useState } from "react";
import { ScrollView, View, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../auth/Session";
import { Card, Icon, Pill, Txt, usePalette, ErrorNotice } from "../ui";
import { LogoWord } from "../BrandLogo";

type TestAccount = {
  id: string;
  domain: "admin" | "external";
  accountType?: "CUSTOMER" | "VENDOR";
  role?: string;
  name: string;
  email: string;
  subtitle: string;
  icon: string;
  badge: string;
  badgeColor?: string;
};

const TEST_ADMINS: TestAccount[] = [
  {
    id: "a1",
    domain: "admin",
    role: "SUPER_ADMIN",
    name: "Dev Super Admin",
    email: "admin@starvnt.com",
    subtitle: "Full platform administration, audit logs, and configuration",
    icon: "shield-checkmark-outline",
    badge: "Super Admin",
  },
  {
    id: "a2",
    domain: "admin",
    role: "OPERATIONS_ADMIN",
    name: "Ops Operations Lead",
    email: "ops@starvnt.com",
    subtitle: "Lead dispatch, opportunity matching, and vendor assignment",
    icon: "compass-outline",
    badge: "Operations",
  },
  {
    id: "a3",
    domain: "admin",
    role: "FINANCE_ADMIN",
    name: "Finance & Ledger Head",
    email: "finance@starvnt.com",
    subtitle: "Escrow oversight, vendor settlement release & payouts",
    icon: "wallet-outline",
    badge: "Finance",
  },
  {
    id: "a4",
    domain: "admin",
    role: "SUPPORT_ADMIN",
    name: "Support & Verification",
    email: "support@starvnt.com",
    subtitle: "Vendor KYC document review and customer support desk",
    icon: "help-buoy-outline",
    badge: "Support",
  },
];

const TEST_CUSTOMERS: TestAccount[] = [
  {
    id: "c1",
    domain: "external",
    accountType: "CUSTOMER",
    name: "Dev Test Customer",
    email: "customer@starvnt.com",
    subtitle: "Event planner with active planning events and Aura+ chat",
    icon: "sparkles-outline",
    badge: "Customer",
  },
  {
    id: "c2",
    domain: "external",
    accountType: "CUSTOMER",
    name: "Ananya Roy",
    email: "ananya@starvnt.com",
    subtitle: "Wedding planning experience with vendor quotes",
    icon: "heart-outline",
    badge: "Customer",
  },
];

const TEST_VENDORS: TestAccount[] = [
  {
    id: "v1",
    domain: "external",
    accountType: "VENDOR",
    name: "Pahadi Frames Photography",
    email: "vendor@starvnt.com",
    subtitle: "Photography & cinematic wedding reels (Kapkote)",
    icon: "camera-outline",
    badge: "Photography",
  },
  {
    id: "v2",
    domain: "external",
    accountType: "VENDOR",
    name: "Royal Kumaoni Feast",
    email: "catering@starvnt.com",
    subtitle: "Traditional Feast & gourmet catering service",
    icon: "restaurant-outline",
    badge: "Catering",
  },
  {
    id: "v3",
    domain: "external",
    accountType: "VENDOR",
    name: "Pahadi Varmala & Decor",
    email: "decor@starvnt.com",
    subtitle: "Grandeur event decor, florals & stage styling",
    icon: "color-palette-outline",
    badge: "Decor",
  },
  {
    id: "v4",
    domain: "external",
    accountType: "VENDOR",
    name: "Himalayan Beats Sound & DJ",
    email: "dj@starvnt.com",
    subtitle: "Sound system, stage lighting & celebration DJ",
    icon: "musical-notes-outline",
    badge: "DJ / Sound",
  },
];

export function TestAuthScreen({ navigation }: any) {
  const { signIn } = useSession();
  const c = usePalette();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  async function handleQuickLogin(acc: TestAccount) {
    if (!__DEV__) return;
    setBusyId(acc.id);
    setError("");
    try {
      if (acc.domain === "admin") {
        await signIn("admin", "dev-auth", {
          email: acc.email,
          role: acc.role,
        });
      } else {
        await signIn("external", "dev-auth", {
          accountType: acc.accountType,
          email: acc.email,
        });
      }
      // Navigation switches automatically via SessionProvider state!
    } catch (err: any) {
      setError(err?.message || "Failed to authenticate test profile.");
      setBusyId(null);
    }
  }

  function renderSection(title: string, subtitle: string, items: TestAccount[]) {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ paddingHorizontal: 4 }}>
          <Txt bold size={16} style={{ color: c.ink }}>
            {title}
          </Txt>
          <Txt size={12} muted>
            {subtitle}
          </Txt>
        </View>

        {items.map((acc) => {
          const isBusy = busyId === acc.id;
          return (
            <Card key={acc.id} onPress={() => !busyId && handleQuickLogin(acc)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: c.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color={c.accent} />
                  ) : (
                    <Icon name={acc.icon} size={22} color={c.accent} />
                  )}
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Txt bold size={15}>
                      {acc.name}
                    </Txt>
                    <Pill>{acc.badge}</Pill>
                  </View>
                  <Txt size={12} muted>
                    {acc.email}
                  </Txt>
                  <Txt size={11} muted numberOfLines={1}>
                    {acc.subtitle}
                  </Txt>
                </View>

                <Icon name="chevron-forward" size={18} color={c.muted} />
              </View>
            </Card>
          );
        })}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: c.line,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Icon name="arrow-back" size={20} color={c.ink} />
          <Txt bold size={14}>
            Back
          </Txt>
        </Pressable>

        <LogoWord compact />

        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 26, paddingBottom: 60 }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="flash" size={22} color={c.accent} />
            <Txt bold size={24} style={{ fontFamily: "Inter_800ExtraBold" }}>
              Quick Test Auth
            </Txt>
          </View>
          <Txt size={13} muted>
            1-tap login with development and QA personas. Skip OTPs and passwords to explore any surface.
          </Txt>
        </View>

        {error ? <ErrorNotice message={error} /> : null}

        {renderSection(
          "Admin Core (STARVNT Internal)",
          "Super Admin, Operations, Finance, and Support consoles",
          TEST_ADMINS
        )}

        {renderSection(
          "Customer Experience",
          "Event planning, vendor quotes, and Aura+ AI assistant",
          TEST_CUSTOMERS
        )}

        {renderSection(
          "Vendor OS (Business Portal)",
          "Lead management, calendar, quotes, and execution",
          TEST_VENDORS
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
