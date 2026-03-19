import { Tabs } from "expo-router";
import { useColorScheme, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";

export default function TabLayout() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: C.tabBar,
                    borderTopColor: C.tabBarBorder,
                    borderTopWidth: 1,
                    height: Platform.OS === "ios" ? 88 : 64,
                    paddingBottom: Platform.OS === "ios" ? 28 : 8,
                    paddingTop: 8,
                    elevation: 0,
                    shadowOpacity: 0,
                },
                tabBarActiveTintColor: C.accent,
                tabBarInactiveTintColor: C.textDim,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 0.3,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Plan",
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="silverware-fork-knife" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="results"
                options={{
                    title: "Meals",
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="bowl-mix" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="progress"
                options={{
                    title: "Progress",
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="chart-line" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="chat"
                options={{
                    title: "Chat",
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="chat-processing-outline" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
