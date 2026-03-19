import { useEffect, useRef } from "react";
import { View, Text, Animated, useColorScheme } from "react-native";
import { Colors } from "../constants/Colors";

export function MealSkeleton({ index }: { index?: number }) {
    const opacity = useRef(new Animated.Value(0.4)).current;
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];

    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [opacity]);

    return (
        <Animated.View style={{
            opacity,
            backgroundColor: C.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: C.border,
            padding: 18,
            marginBottom: 16,
        }}>
            {index !== undefined && (
                <View style={{ width: 50, height: 10, backgroundColor: C.cardElevated, borderRadius: 6, marginBottom: 8 }} />
            )}
            <View style={{ width: "65%", height: 18, backgroundColor: C.cardElevated, borderRadius: 6, marginBottom: 8 }} />
            <View style={{ width: "90%", height: 12, backgroundColor: C.cardElevated, borderRadius: 6, marginBottom: 16 }} />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={{ flex: 1, height: 60, backgroundColor: C.cardElevated, borderRadius: 12 }} />
                ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 16, height: 16, backgroundColor: C.cardElevated, borderRadius: 8 }} />
                <Text style={{ color: C.violet, fontSize: 12, fontWeight: "600" }}>AI is crafting your meal…</Text>
            </View>
        </Animated.View>
    );
}
