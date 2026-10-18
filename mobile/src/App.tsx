import React, { useEffect, useState } from "react";
import { PushProvider, usePush } from "./Push";
import { pushDestination } from "./pushDestination";
import { acknowledgePush } from "./pushRuntime";
import { NotificationSettings } from "./screens/NotificationSettings";
import { CircleScreen } from "./screens/CustomerWorkspace";
import { VendorQuote } from "./screens/VendorQuote";
import { CustomerBookingScreen } from "./screens/CustomerBooking";
import { StatusBar, Pressable, Text, View } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { LogoWord } from "./BrandLogo";
import { ThemeProvider, useTheme } from "./Theme";
import { useWebBrandHead } from "./useWebBrandHead";
import brand from "./brand.generated.json";
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "./auth/Session";
import { LandingScreen } from "./screens/Landing";
import { PlanningIntentProvider, usePlanningIntent } from "./PlanningIntent";
import { AuthScreen } from "./screens/Auth";
import {
  CustomerHome,
  EventsScreen,
  NewEvent,
  EventScreen,
  EventSection,
  RequirementScreen,
  ServiceScreen,
  CompareScreen,
} from "./screens/Customer";
import { EditEvent } from "./screens/EditEvent";
import { AuraHistoryScreen } from "./screens/AuraHistory";
import { ChatScreen, UpdatesScreen } from "./screens/Conversations";
import { VendorOffers, CheckoutScreen } from "./screens/Checkout";
import {
  VendorHome,
  VendorWork,
  VendorModule,
  VendorForm,
  VendorBooking,
} from "./screens/Vendor";
import { VendorCalendar } from "./screens/VendorCalendar";
import { VendorFinancial } from "./screens/VendorFinancial";
import { VendorSetup } from "./screens/VendorSetup";
import {
  AdminHome,
  AdminModule,
  AdminRecord,
  AdminForm,
  AdminKyc,
  AdminNotifications,
} from "./screens/Admin";
import { AdminEntity } from "./screens/AdminEntity";
import { AdminAccess, AdminFinance } from "./screens/AdminActions";
import { AccountScreen, ProfileScreen, LibraryScreen } from "./screens/Account";
import { TestAuthScreen } from "./screens/TestAuth";
import { Button, ErrorNotice, Icon, Page, Txt, usePalette } from "./ui";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
void SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      onPress={toggle}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon
        name={mode === "dark" ? "sunny-outline" : "moon-outline"}
        color={c.muted}
        size={20}
      />
    </Pressable>
  );
}
function MainTabs() {
  const { user, activeDomain } = useSession();
  const { prompt } = usePlanningIntent();
  const c = usePalette();
  const admin = activeDomain === "admin",
    vendor = user?.accountType === "VENDOR";
  const tabs: [string, string, any, string][] = admin
    ? [
        ["Overview", "Overview", AdminHome, "grid-outline"],
        ["CoreUpdates", "Updates", AdminNotifications, "notifications-outline"],
        ["Me", "Account", AccountScreen, "person-outline"],
      ]
    : vendor
      ? [
          ["Overview", "Overview", VendorHome, "grid-outline"],
          ["Work", "Workspace", VendorWork, "briefcase-outline"],
          ["AuraTab", "Aura+", ChatScreen, "sparkles-outline"],
          ["Updates", "Updates", UpdatesScreen, "chatbubbles-outline"],
          ["Me", "Account", AccountScreen, "person-outline"],
        ]
      : [
          ["Overview", "Home", CustomerHome, "grid-outline"],
          ["Events", "Events", EventsScreen, "calendar-outline"],
          ["AuraTab", "Aura+", ChatScreen, "sparkles-outline"],
          ["Updates", "Updates", UpdatesScreen, "chatbubbles-outline"],
          ["Me", "Me", AccountScreen, "person-outline"],
        ];
  return (
    <Tabs.Navigator
      initialRouteName={prompt && !admin && !vendor ? "AuraTab" : "Overview"}
      screenOptions={{
        headerTitle: () => <LogoWord compact />,
        headerRight: () => <ThemeToggle />,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.ink,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          fontFamily: "Inter_600SemiBold",
        },
      }}
    >
      {tabs.map(([name, title, component, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          component={component}
          options={{
            title,
            tabBarIcon: ({ color, size }) => (
              <Icon name={icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs.Navigator>
  );
}
const pushNavigation = createNavigationContainerRef<any>();
function Navigation() {
  const s = useSession();
  const c = usePalette();
  const push = usePush();
  const [navigationReady, setNavigationReady] = useState(false);
  useEffect(() => {
    const data = push.pending;
    if (!data || !s.ready || s.error || !navigationReady) return;
    const domain = data.domain;
    if (domain !== "admin" && domain !== "external") {
      push.consumed();
      return;
    }
    const owner = domain === "admin" ? s.admin : s.user;
    if (!owner) {
      // Keep the tap and send the user through the correct domain's real sign-in.
      if (s.activeDomain !== domain) {
        s.setActiveDomain(domain);
        return;
      }
      const timer = setTimeout(() => {
        if (pushNavigation.isReady())
          pushNavigation.navigate("Auth", {
            mode: "login",
            accountType: data.surface === "VENDOR" ? "VENDOR" : "CUSTOMER",
          });
      }, 0);
      return () => clearTimeout(timer);
    }
    const target = pushDestination(data, owner, domain, s.can);
    if (!target) {
      push.consumed();
      return;
    }
    if (s.activeDomain !== domain) {
      s.setActiveDomain(domain);
      return;
    }
    const timer = setTimeout(() => {
      if (pushNavigation.isReady()) {
        pushNavigation.navigate(target.screen, target.params);
        void acknowledgePush(data).catch(() => {});
        push.consumed();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    push.pending,
    s.ready,
    s.error,
    s.activeDomain,
    s.user,
    s.admin,
    navigationReady,
  ]);
  if (!s.ready)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <Page title="STARVNT" loading />
      </SafeAreaView>
    );
  if (s.error)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <Page title="Let’s reconnect" error={s.error} refresh={s.restore} />
      </SafeAreaView>
    );
  const identity = s.activeDomain === "admin" ? s.admin : s.user;
  const theme = {
    ...(c.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(c.dark ? DarkTheme.colors : DefaultTheme.colors),
      background: c.bg,
      card: c.card,
      text: c.ink,
      primary: c.accent,
      border: c.line,
    },
    fonts: {
      regular: { fontFamily: "Inter_400Regular", fontWeight: "400" as const },
      medium: { fontFamily: "Inter_600SemiBold", fontWeight: "600" as const },
      bold: { fontFamily: "Inter_700Bold", fontWeight: "700" as const },
      heavy: { fontFamily: "Inter_800ExtraBold", fontWeight: "800" as const },
    },
  };
  return (
    <NavigationContainer
      ref={pushNavigation}
      onReady={() => setNavigationReady(true)}
      theme={theme}
      documentTitle={{ formatter: () => brand.title }}
    >
      <StatusBar barStyle={c.dark ? "light-content" : "dark-content"} />
      <Stack.Navigator
        key={
          identity
            ? `${s.activeDomain}-${identity.id || identity._id}-${s.user?.accountType || ""}`
            : "guest"
        }
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.ink,
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: { fontFamily: "Inter_700Bold" },
          headerRight: () => <ThemeToggle />,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        {!identity ? (
          <>
            <Stack.Screen
              name="Landing"
              component={LandingScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ headerShown: false }}
            />
            {__DEV__ && (
              <Stack.Screen
                name="TestAuth"
                component={TestAuthScreen}
                options={{ headerShown: false }}
              />
            )}
          </>
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="NewEvent"
              component={NewEvent}
              options={{ title: "New event" }}
            />
            <Stack.Screen
              name="Event"
              component={EventScreen}
              options={{ title: "Event workspace" }}
            />
            <Stack.Screen
              name="EditEvent"
              component={EditEvent}
              options={{ title: "Event details" }}
            />
            <Stack.Screen
              name="EventSection"
              component={EventSection}
              options={({ route }: any) => ({
                title: route.params.title || "Your event",
              })}
            />
            <Stack.Screen
              name="Requirement"
              component={RequirementScreen}
              options={{ title: "Service details" }}
            />
            <Stack.Screen
              name="Service"
              component={ServiceScreen}
              options={{ title: "Meet your vendor" }}
            />
            <Stack.Screen
              name="Compare"
              component={CompareScreen}
              options={{ title: "Compare" }}
            />
            <Stack.Screen
              name="AuraHistory"
              component={AuraHistoryScreen}
              options={{ title: "Aura+ conversations" }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: "Conversation" }}
            />
            <Stack.Screen
              name="Circle"
              component={CircleScreen}
              options={{ title: "Event Circle" }}
            />
            <Stack.Screen
              name="CustomerBooking"
              component={CustomerBookingScreen}
              options={{ title: "Completion evidence" }}
            />
            <Stack.Screen
              name="VendorOffers"
              component={VendorOffers}
              options={{ title: "Vendor offers" }}
            />
            <Stack.Screen
              name="Checkout"
              component={CheckoutScreen}
              options={{ title: "Payment" }}
            />
            <Stack.Screen
              name="VendorModule"
              component={VendorModule}
              options={{ title: "Vendor OS" }}
            />
            <Stack.Screen
              name="VendorForm"
              component={VendorForm}
              options={{ title: "Your business" }}
            />
            <Stack.Screen
              name="VendorQuote"
              component={VendorQuote}
              options={{ title: "Quote details" }}
            />
            <Stack.Screen
              name="VendorBooking"
              component={VendorBooking}
              options={{ title: "Booking workspace" }}
            />
            <Stack.Screen
              name="VendorCalendar"
              component={VendorCalendar}
              options={{ title: "Calendar & availability" }}
            />
            <Stack.Screen
              name="VendorFinancial"
              component={VendorFinancial}
              options={{ title: "Financial onboarding" }}
            />
            <Stack.Screen
              name="VendorSetup"
              component={VendorSetup}
              options={{ title: "Business setup" }}
            />
            <Stack.Screen
              name="AdminModule"
              component={AdminModule}
              options={{ title: "STARVNT Core" }}
            />
            <Stack.Screen
              name="AdminRecord"
              component={AdminRecord}
              options={{ title: "Record details" }}
            />
            <Stack.Screen
              name="AdminForm"
              component={AdminForm}
              options={{ title: "Edit record" }}
            />
            <Stack.Screen
              name="AdminEntity"
              component={AdminEntity}
              options={{ title: "Manage account" }}
            />
            <Stack.Screen
              name="AdminAccess"
              component={AdminAccess}
              options={{ title: "Staff access" }}
            />
            <Stack.Screen
              name="AdminFinance"
              component={AdminFinance}
              options={{ title: "Core action" }}
            />
            <Stack.Screen
              name="AdminKyc"
              component={AdminKyc}
              options={{ title: "Verification" }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: "Profile" }}
            />
            <Stack.Screen
              name="NotificationSettings"
              component={NotificationSettings}
              options={{ title: "Notifications" }}
            />
            <Stack.Screen
              name="Library"
              component={LibraryScreen}
              options={{ title: "Your library" }}
            />
            {__DEV__ && (
              <Stack.Screen
                name="TestAuth"
                component={TestAuthScreen}
                options={{ headerShown: false }}
              />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <SafeAreaView style={{ flex: 1 }}>
        <Page title="Something interrupted your visit">
          <Txt>Your account data is saved on STARVNT.</Txt>
          <Button
            title="Try again"
            onPress={() => this.setState({ error: false })}
          />
        </Page>
      </SafeAreaView>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  useWebBrandHead();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  if (fontError)
    return (
      <SafeAreaProvider>
        <SafeAreaView>
          <Text>The app could not load its fonts. Please restart STARVNT.</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <SessionProvider>
            <PushProvider>
              <PlanningIntentProvider>
                <Navigation />
              </PlanningIntentProvider>
            </PushProvider>
          </SessionProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
