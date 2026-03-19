import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import "../global.css";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const scheme = useColorScheme();

    useEffect(() => {
        SplashScreen.hideAsync();
    }, []);

    return (
        <>
            <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
            </Stack>
        </>
    );
}
