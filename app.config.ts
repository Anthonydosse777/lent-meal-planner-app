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
        openaiApiKey: process.env.OPENAI_API_KEY,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        defaultProvider: process.env.DEFAULT_AI_PROVIDER ?? "openai",
        eas: {
            projectId: "your-eas-project-id",
        },
    },
});
