import React, { useRef, useState } from "react";
import { ScrollView, View, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../auth/Session";
import { Card, Icon, Pill, Txt, usePalette, ErrorNotice } from "../ui";
import { LogoWord } from "../BrandLogo";
import { TEST_AUTH_ENABLED } from "../testAuth";
import { quickAuthenticate } from '../auth/quickAuth';

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
    name: "Ananya Sharma",
    email: "customer@starvnt.com",
    subtitle: "Grand Pahadi Wedding (1000 Pax) · Kapkote",
    icon: "sparkles-outline",
    badge: "Customer",
  },
  {
    id: "c2",
    domain: "external",
    accountType: "CUSTOMER",
    name: "Rahul Verma",
    email: "customer2@starvnt.com",
    subtitle: "1st Birthday Celebration & Reel Shoot · Kapkote",
    icon: "heart-outline",
    badge: "Customer",
  },
  {
    id: "c3",
    domain: "external",
    accountType: "CUSTOMER",
    name: "Priya Patel",
    email: "customer3@starvnt.com",
    subtitle: "Corporate Annual Gala & Awards · Bageshwar",
    icon: "briefcase-outline",
    badge: "Customer",
  },
  {
    id: "c4",
    domain: "external",
    accountType: "CUSTOMER",
    name: "Devansh Bisht",
    email: "customer4@starvnt.com",
    subtitle: "Traditional Kumaoni Haldi & Sangeet · Kapkote",
    icon: "happy-outline",
    badge: "Customer",
  },
];

const TEST_VENDORS: TestAccount[] = [
  {
    id: "v1",
    domain: "external",
    accountType: "VENDOR",
    name: "Himalayan Moments & Wedding Studio",
    email: "vendor@starvnt.com",
    subtitle: "Photography & cinematic wedding films (₹48,000/event) · Kapkote",
    icon: "camera-outline",
    badge: "Photography",
  },
  {
    id: "v2",
    domain: "external",
    accountType: "VENDOR",
    name: "Kumaon Candid & Birthday Reel Stories",
    email: "photo2@starvnt.com",
    subtitle: "Event photography & social reels (₹18,000/event) · Kapkote",
    icon: "camera-outline",
    badge: "Photography",
  },
  {
    id: "v3",
    domain: "external",
    accountType: "VENDOR",
    name: "Valley Peak Photography & Drone Films",
    email: "photo3@starvnt.com",
    subtitle: "Drone videography & landscape films (₹14,000/event) · Bageshwar",
    icon: "camera-outline",
    badge: "Photography",
  },
  {
    id: "v4",
    domain: "external",
    accountType: "VENDOR",
    name: "Royal Kumaoni Feast & Catering",
    email: "catering@starvnt.com",
    subtitle: "Traditional Kumaoni wedding feast (₹650/plate) · Kapkote",
    icon: "restaurant-outline",
    badge: "Catering",
  },
  {
    id: "v5",
    domain: "external",
    accountType: "VENDOR",
    name: "Mountain Bites & Party Catering",
    email: "catering2@starvnt.com",
    subtitle: "Snacks, buffet & birthday catering (₹350/plate) · Kapkote",
    icon: "restaurant-outline",
    badge: "Catering",
  },
  {
    id: "v6",
    domain: "external",
    accountType: "VENDOR",
    name: "Grand Bageshwar Feast & Gourmet",
    email: "catering3@starvnt.com",
    subtitle: "Multi-cuisine wedding gourmet catering (₹850/plate) · Bageshwar",
    icon: "restaurant-outline",
    badge: "Catering",
  },
  {
    id: "v7",
    domain: "external",
    accountType: "VENDOR",
    name: "Pahadi Varmala & Grandeur Event Decor",
    email: "decor@starvnt.com",
    subtitle: "Grand stage styling, florals & varmala sets (₹85,000/setup)",
    icon: "color-palette-outline",
    badge: "Decor & Styling",
  },
  {
    id: "v8",
    domain: "external",
    accountType: "VENDOR",
    name: "Kumaon Floral Arches & Theme Party Decor",
    email: "decor2@starvnt.com",
    subtitle: "Floral arches, balloon styling & theme stages (₹25,000/setup)",
    icon: "color-palette-outline",
    badge: "Decor & Styling",
  },
  {
    id: "v9",
    domain: "external",
    accountType: "VENDOR",
    name: "Himalayan Fairy Lights & Birthday Decor",
    email: "decor3@starvnt.com",
    subtitle: "Fairy light canopies & cozy party decor (₹15,000/setup)",
    icon: "color-palette-outline",
    badge: "Decor & Styling",
  },
  {
    id: "v10",
    domain: "external",
    accountType: "VENDOR",
    name: "Himalayan Heritage Pine Lawns & Resort",
    email: "venue@starvnt.com",
    subtitle: "Lawn & scenic resort wedding destination (₹1,50,000/day)",
    icon: "business-outline",
    badge: "Venue",
  },
  {
    id: "v11",
    domain: "external",
    accountType: "VENDOR",
    name: "Kapkote Party Lawn & Banquet",
    email: "venue2@starvnt.com",
    subtitle: "Celebration hall & banquet lawn (₹45,000/day) · Kapkote",
    icon: "business-outline",
    badge: "Venue",
  },
  {
    id: "v12",
    domain: "external",
    accountType: "VENDOR",
    name: "Valley View Garden & Birthday Pavilion",
    email: "venue3@starvnt.com",
    subtitle: "Garden venue for birthdays & gatherings (₹35,000/day) · Bageshwar",
    icon: "business-outline",
    badge: "Venue",
  },
  {
    id: "v13",
    domain: "external",
    accountType: "VENDOR",
    name: "Kumaon Beats & Sound FX (DJ & Audio)",
    email: "dj@starvnt.com",
    subtitle: "Line array sound system, DJ console & lights (₹22,000/night)",
    icon: "musical-notes-outline",
    badge: "DJ & Music",
  },
  {
    id: "v14",
    domain: "external",
    accountType: "VENDOR",
    name: "Pahadi Bridal Glow & Artistry Studio",
    email: "makeup@starvnt.com",
    subtitle: "Bridal HD & airbrush makeup artistry (₹15,000/bride) · Kapkote",
    icon: "sparkles-outline",
    badge: "Makeup & Styling",
  },
  {
    id: "v15",
    domain: "external",
    accountType: "VENDOR",
    name: "Delhi & Kumaon Emcee Desk (Anchor & Host)",
    email: "anchor1@starvnt.com",
    subtitle: "Bilingual celebrity host & wedding anchor (₹25,000/event)",
    icon: "mic-outline",
    badge: "Anchor / Host",
  },
];

export function TestAuthScreen({ navigation }: any) {
  const { signIn } = useSession();
  const c = usePalette();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const pending = useRef(false);

  async function handleQuickLogin(acc: TestAccount) {
    if (!TEST_AUTH_ENABLED || pending.current) return;
    pending.current = true;
    setBusyId(acc.id);
    setError("");
    try {
      await quickAuthenticate(acc, signIn, navigation);
    } catch (err: any) {
      setError(err?.message || "Failed to authenticate test profile.");
    } finally {
      pending.current = false;
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
                  <View style={{ flexDirection: "row", flexWrap: 'wrap', alignItems: "center", gap: 8 }}>
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
            1-tap login with development and QA personas. Test sessions end when you reload or sign out.
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
          "Lead management, calendar, quotes, and execution (15 categories)",
          TEST_VENDORS
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
