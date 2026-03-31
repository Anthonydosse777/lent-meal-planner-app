import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { useColorScheme, Platform, View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import { supabase } from "../../lib/supabase";

export default function TabLayout() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUserEmail(user?.email ?? null);
        });
    }, []);

    function handleLogout() {
        if (Platform.OS === "web") {
            if (window.confirm("Are you sure you want to log out?")) {
                supabase.auth.signOut();
            }
        } else {
            const { Alert } = require("react-native");
            Alert.alert("Log Out", "Are you sure you want to log out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Log Out", style: "destructive", onPress: () => supabase.auth.signOut() },
            ]);
        }
    }

    return (
        <Tabs
            screenOptions={{
                headerShown: true,
                headerStyle: {
                    backgroundColor: C.background,
                    elevation: 0,
                    shadowOpacity: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: C.borderFaint,
                },
                headerTitleStyle: {
                    color: C.text,
                    fontWeight: "700",
                    fontSize: 17,
                },
                headerRight: () => (
                    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16, gap: 10 }}>
                        {userEmail && (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    backgroundColor: C.accentMuted,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 20,
                                    gap: 6,
                                }}
                            >
                                <MaterialCommunityIcons name="account-circle-outline" size={14} color={C.accent} />
                                <Text
                                    style={{
                                        color: C.accent,
                                        fontSize: 11,
                                        fontWeight: "600",
                                        maxWidth: 120,
                                    }}
                                    numberOfLines={1}
                                >
                                    {userEmail}
                                </Text>
                            </View>
                        )}
                        <TouchableOpacity onPress={handleLogout} hitSlop={8}>
                            <MaterialCommunityIcons name="logout" size={20} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>
                ),
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
