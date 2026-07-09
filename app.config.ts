import "dotenv/config";
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: "Lent Meal Planner",
    slug: "lent-meal-planner-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#111218",
    },
    ios: {
        supportsTablet: true,
        bundleIdentifier: "com.lentmealplanner.app",
    },
    android: {
        adaptiveIcon: {
            foregroundImage: "./assets/adaptive-icon.png",
            backgroundColor: "#111218",
        },
        package: "com.lentmealplanner.app",
    },
    web: {
        bundler: "metro",
        output: process.env.GITHUB_ACTIONS ? "static" : "single",
        favicon: "./assets/favicon.png",
    },
    experiments: {
        baseUrl: "/lent-meal-planner-app",
    },
    plugins: ["expo-router", "expo-font"],
    scheme: "lentmealplanner",
    extra: {
        // Only publishable values belong here — everything in `extra` is
        // embedded in the client bundle. AI/Nutritionix keys live as Supabase
        // Edge Function secrets (see supabase/functions/ai-proxy).
        usdaApiKey: process.env.EXPO_PUBLIC_USDA_API_KEY,
        eas: {
            projectId: "your-eas-project-id",
        },
    },
});
