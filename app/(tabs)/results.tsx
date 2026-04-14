import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import { useStore, getDayCalorieGoal } from "../../lib/store";
import { MealCard } from "../../components/MealCard";
import { MealSkeleton } from "../../components/MealSkeleton";
import { GroceryList } from "../../components/GroceryList";
import { buildGroceryList } from "../../lib/meal-logic";
import type { Meal } from "../../lib/meal-data";

const TRACK_LABELS: Record<string, string> = {
    straight_vegan: "Straight Vegan",
    vegan_fish: "Vegan + Fish",
    unrestricted: "Unrestricted",
};

export default function ResultsScreen() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const { meals, loadingSlots, error, config } = useStore();
    const isGenerating = loadingSlots.some(Boolean);
    const totalSlots = meals.length + loadingSlots.filter(Boolean).length;

    const [tab, setTab] = useState<"meals" | "grocery">("meals");

    const groceryItems = meals.length > 0 ? buildGroceryList(meals as Meal[]) : [];

    const totalNutrition = meals.reduce(
        (acc, m) => ({
            calories: acc.calories + m.totalNutrition.calories,
            protein: acc.protein + m.totalNutrition.protein,
        }),
        { calories: 0, protein: 0 }
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{
                paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
                borderBottomWidth: 1, borderBottomColor: C.borderFaint,
            }}>
                <Text style={{ color: C.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 }}>
                    {config.mode === "single" ? "Your Meal" : "Daily Plan"}
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>
                    {TRACK_LABELS[config.strictness]} · {config.protein}g protein target
                </Text>

                {/* Summary pills */}
                {meals.length > 0 && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                        <SummaryPill
                            icon="fire"
                            label={`${totalNutrition.calories} kcal`}
                            target={getDayCalorieGoal(config)}
                            C={C}
                        />
                        <SummaryPill
                            icon="arm-flex"
                            label={`${totalNutrition.protein}g protein`}
                            target={config.protein}
                            C={C}
                        />
                    </View>
                )}

                {/* Tab toggle */}
                {meals.length > 0 && config.mode === "daily" && (
                    <View style={{
                        flexDirection: "row", gap: 4, marginTop: 12,
                        backgroundColor: C.card,
                        borderRadius: 12, padding: 3,
                        borderWidth: 1, borderColor: C.border,
                    }}>
                        {(["meals", "grocery"] as const).map((t) => (
                            <TouchableOpacity
                                key={t}
                                onPress={() => setTab(t)}
                                activeOpacity={0.7}
                                style={{
                                    flex: 1, paddingVertical: 8, borderRadius: 10,
                                    backgroundColor: tab === t ? C.cardElevated : "transparent",
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{
                                    color: tab === t ? C.text : C.textMuted,
                                    fontSize: 13, fontWeight: "700",
                                }}>
                                    {t === "meals" ? "Meals" : "Grocery List"}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {/* Error */}
            {error && (
                <View style={{
                    margin: 16, flexDirection: "row", alignItems: "center", gap: 10,
                    backgroundColor: C.dangerMuted,
                    borderWidth: 1, borderColor: C.danger + "40",
                    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
                }}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color={C.danger} />
                    <Text style={{ color: C.danger, fontSize: 13, flex: 1 }}>{error}</Text>
                </View>
            )}

            {/* Empty state */}
            {totalSlots === 0 && !isGenerating && (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
                    <MaterialCommunityIcons name="bowl-mix-outline" size={56} color={C.textDim} />
                    <Text style={{ color: C.textMuted, fontSize: 16, fontWeight: "700", marginTop: 16 }}>
                        No meals yet
                    </Text>
                    <Text style={{ color: C.textDim, fontSize: 13, textAlign: "center", marginTop: 6 }}>
                        Go to the Plan tab and generate your first meal.
                    </Text>
                </View>
            )}

            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {tab === "meals" || config.mode === "single" ? (
                    <>
                        {meals.map((meal, i) => (
                            <MealCard
                                key={meal.id}
                                meal={meal}
                                index={config.mode === "daily" ? i : undefined}
                            />
                        ))}
                        {loadingSlots.filter(Boolean).map((_, i) => (
                            <MealSkeleton
                                key={`sk-${i}`}
                                index={config.mode === "daily" ? meals.length + i : undefined}
                            />
                        ))}
                    </>
                ) : (
                    <GroceryList items={groceryItems} />
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function SummaryPill({
    icon, label, target, C,
}: {
    icon: string;
    label: string;
    target: number;
    C: (typeof Colors)["dark"];
}) {
    return (
        <View style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: C.accentMuted,
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
        }}>
            <MaterialCommunityIcons name={icon as "fire"} size={13} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        </View>
    );
}

