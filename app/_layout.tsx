import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { supabase } from "../lib/supabase";
import { Session } from "@supabase/supabase-js";
import { hydrateForUser } from "../lib/store";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const scheme = useColorScheme();
    const router = useRouter();
    const segments = useSegments();
    const [session, setSession] = useState<Session | null>(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        // Always require fresh sign-in on app load
        supabase.auth.signOut().then(() => {
            setSession(null);
            setInitialized(true);
            SplashScreen.hideAsync();
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            // Reload per-user planner config whenever auth state changes so
            // saved calorie goals survive log-out/log-in cycles.
            hydrateForUser(session?.user?.id ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!initialized) return;

        const inAuthGroup = segments[0] === "(auth)";

        if (!session && !inAuthGroup) {
            router.replace("/(auth)/login");
        } else if (session && inAuthGroup) {
            router.replace("/(tabs)");
        }
    }, [session, initialized, segments]);

    if (!initialized) return null;

    return (
        <>
            <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
            </Stack>
        </>
    );
}
