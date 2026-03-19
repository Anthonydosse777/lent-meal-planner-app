import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, useColorScheme } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";

interface GroceryItem {
    label: string;
    amount: number;
    unit: string;
}

interface Props {
    items: GroceryItem[];
}

export function GroceryList({ items }: Props) {
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];

    function toggle(i: number) {
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    }

    if (items.length === 0) return null;

    return (
        <View style={{
            backgroundColor: C.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: C.border,
            overflow: "hidden",
        }}>
            <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 18, paddingVertical: 14,
                borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialCommunityIcons name="cart-outline" size={18} color={C.accent} />
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: "800" }}>Grocery List</Text>
                </View>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>{items.length} items</Text>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {items.map((item, i) => {
                    const done = checked.has(i);
                    return (
                        <TouchableOpacity
                            key={i}
                            onPress={() => toggle(i)}
                            activeOpacity={0.6}
                            style={{
                                flexDirection: "row", alignItems: "center",
                                paddingHorizontal: 18, paddingVertical: 12,
                                borderBottomWidth: i < items.length - 1 ? 1 : 0,
                                borderBottomColor: C.borderFaint,
                                opacity: done ? 0.45 : 1,
                            }}
                        >
                            <View style={{
                                width: 22, height: 22, borderRadius: 11,
                                borderWidth: 2,
                                borderColor: done ? C.success : C.border,
                                backgroundColor: done ? C.successMuted : "transparent",
                                alignItems: "center", justifyContent: "center",
                                marginRight: 12,
                            }}>
                                {done && <MaterialCommunityIcons name="check" size={13} color={C.success} />}
                            </View>
                            <Text style={{
                                flex: 1, color: C.text, fontSize: 14,
                                fontWeight: "500",
                                textDecorationLine: done ? "line-through" : "none",
                            }}>
                                {item.label}
                            </Text>
                            <Text style={{ color: C.accent, fontSize: 13, fontWeight: "700" }}>
                                {item.amount} {item.unit}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}
