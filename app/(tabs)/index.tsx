import { useCallback, useEffect, useState } from "react";
import {
    View, Text, ScrollView, TouchableOpacity, TextInput,
    useColorScheme, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import { useStore, setConfig, setState, type PlannerConfig } from "../../lib/store";
import { fetchAiMeal } from "../../lib/api";
import { generateMeal } from "../../lib/meal-logic";
import { getLoggedMeals, todayDate } from "../../lib/storage";
import type { Track } from "../../lib/meal-data";

const TRACK_OPTIONS: { value: Track; label: string; sub: string; icon: string }[] = [
    { value: "straight_vegan", label: "Straight Vegan", sub: "No dairy, no meat, no fish", icon: "leaf" },
    { value: "vegan_fish", label: "Vegan + Fish", sub: "Fish & seafood allowed", icon: "fish" },
    { value: "unrestricted", label: "Unrestricted", sub: "All foods allowed", icon: "silverware-fork-knife" },
];

const PROVIDER_OPTIONS: { value: "openai" | "claude"; label: string }[] = [
    { value: "openai", label: "GPT-4o" },
    { value: "claude", label: "Claude" },
];

export default function PlanScreen() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const { config, loadingSlots } = useStore();
    const router = useRouter();
    const isGenerating = loadingSlots.some(Boolean);

    const [caloriesEaten, setCaloriesEaten] = useState(0);
    const [proteinEaten, setProteinEaten] = useState(0);
    const [mealsToday, setMealsToday] = useState(0);

    useFocusEffect(
        useCallback(() => {
            getLoggedMeals().then((meals) => {
                const today = todayDate();
                const todayMeals = meals.filter((m) => m.date === today);
                const cals = todayMeals.reduce((sum, m) => sum + (m.meal.totalNutrition?.calories ?? 0), 0);
                const prot = todayMeals.reduce((sum, m) => sum + (m.meal.totalNutrition?.protein ?? 0), 0);
                setCaloriesEaten(Math.round(cals));
                setProteinEaten(Math.round(prot));
                setMealsToday(todayMeals.length);
            });
        }, [])
    );

    const caloriesLeft = Math.max(0, config.calories - caloriesEaten);
    const proteinLeft = Math.max(0, config.protein - proteinEaten);
    const calProgress = config.calories > 0 ? Math.min(1, caloriesEaten / config.calories) : 0;

    async function handleGenerate() {
        const { protein, calories, strictness, mealsPerDay, mode, provider } = config;
        const count = mode === "single" ? 1 : mealsPerDay;
        const proteinPerMeal = Math.round(protein / count);
        const calPerMeal = Math.round(calories / count);

        setState({ meals: [], loadingSlots: Array(count).fill(true), error: null });
        router.navigate("/(tabs)/results");

        const generated: ReturnType<typeof generateMeal>[] = [];

        for (let i = 0; i < count; i++) {
            try {
                const aiMeal = await fetchAiMeal({
                    provider,
                    strictness,
                    targetProtein: proteinPerMeal,
                    targetCalories: calPerMeal,
                    existingTitles: generated.map((m) => m.title),
                });
                generated.push(aiMeal as unknown as ReturnType<typeof generateMeal>);
            } catch {
                generated.push(generateMeal(strictness, proteinPerMeal));
            }
            setState({
                meals: [...generated],
                loadingSlots: Array(count).fill(true).map((_, j) => j >= generated.length),
            });
        }
        setState({ loadingSlots: [] });
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ marginBottom: 28 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <MaterialCommunityIcons name="cross" size={18} color={C.accent} />
                        <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" }}>
                            Coptic Fast Planner
                        </Text>
                    </View>
                    <Text style={{ color: C.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 }}>
                        Plan Your Fast
                    </Text>
                    <Text style={{ color: C.textMuted, fontSize: 14, marginTop: 4 }}>
                        Configure your meal plan and let AI generate it.
                    </Text>
                </View>

                {/* Daily Calories Remaining Card */}
                <View style={{
                    backgroundColor: C.card,
                    borderRadius: 20,
                    padding: 20,
                    marginBottom: 28,
                    borderWidth: 1,
                    borderColor: C.border,
                }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <View style={{
                                width: 32, height: 32, borderRadius: 10,
                                backgroundColor: C.accentMuted,
                                alignItems: "center", justifyContent: "center",
                            }}>
                                <MaterialCommunityIcons name="fire" size={18} color={C.accent} />
                            </View>
                            <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                                Today's Progress
                            </Text>
                        </View>
                        <Text style={{ color: C.textDim, fontSize: 11, fontWeight: "600" }}>
                            {mealsToday} meal{mealsToday !== 1 ? "s" : ""} logged
                        </Text>
                    </View>

                    {/* Big calorie number */}
                    <View style={{ alignItems: "center", marginBottom: 16 }}>
                        <Text style={{ color: C.text, fontSize: 44, fontWeight: "900", letterSpacing: -1 }}>
                            {caloriesLeft}
                        </Text>
                        <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "600", marginTop: 2 }}>
                            calories remaining
                        </Text>
                    </View>

                    {/* Progress bar */}
                    <View style={{
                        height: 8, borderRadius: 4,
                        backgroundColor: C.cardElevated,
                        marginBottom: 16,
                        overflow: "hidden",
                    }}>
                        <View style={{
                            height: "100%",
                            borderRadius: 4,
                            width: `${Math.round(calProgress * 100)}%`,
                            backgroundColor: calProgress > 0.9 ? C.danger : C.accent,
                        }} />
                    </View>

                    {/* Stats row */}
                    <View style={{ flexDirection: "row", gap: 12 }}>
                        <View style={{
                            flex: 1, backgroundColor: C.cardElevated,
                            borderRadius: 12, padding: 12, alignItems: "center",
                        }}>
                            <Text style={{ color: C.accent, fontSize: 18, fontWeight: "800" }}>{caloriesEaten}</Text>
                            <Text style={{ color: C.textDim, fontSize: 11, fontWeight: "600", marginTop: 2 }}>eaten</Text>
                        </View>
                        <View style={{
                            flex: 1, backgroundColor: C.cardElevated,
                            borderRadius: 12, padding: 12, alignItems: "center",
                        }}>
                            <Text style={{ color: C.text, fontSize: 18, fontWeight: "800" }}>{config.calories}</Text>
                            <Text style={{ color: C.textDim, fontSize: 11, fontWeight: "600", marginTop: 2 }}>target</Text>
                        </View>
                        <View style={{
                            flex: 1, backgroundColor: C.cardElevated,
                            borderRadius: 12, padding: 12, alignItems: "center",
                        }}>
                            <Text style={{ color: C.success, fontSize: 18, fontWeight: "800" }}>{proteinLeft}g</Text>
                            <Text style={{ color: C.textDim, fontSize: 11, fontWeight: "600", marginTop: 2 }}>protein left</Text>
                        </View>
                    </View>
                </View>

                {/* Fasting Track */}
                <SectionLabel label="Fasting Track" C={C} />
                <View style={{ gap: 10, marginBottom: 24 }}>
                    {TRACK_OPTIONS.map((opt) => {
                        const active = config.strictness === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                onPress={() => setConfig({ strictness: opt.value })}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 14,
                                    padding: 16,
                                    borderRadius: 16,
                                    borderWidth: 1.5,
                                    borderColor: active ? C.accent : C.border,
                                    backgroundColor: active ? C.accentMuted : C.card,
                                }}
                            >
                                <View style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    backgroundColor: active ? C.accent : C.cardElevated,
                                    alignItems: "center", justifyContent: "center",
                                }}>
                                    <MaterialCommunityIcons
                                        name={opt.icon as "leaf"}
                                        size={20}
                                        color={active ? C.background : C.textMuted}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: C.text, fontSize: 15, fontWeight: "700" }}>{opt.label}</Text>
                                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 1 }}>{opt.sub}</Text>
                                </View>
                                {active && (
                                    <MaterialCommunityIcons name="check-circle" size={20} color={C.accent} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Nutrition targets */}
                <SectionLabel label="Nutrition Targets" C={C} />
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
                    <NumberField
                        label="Protein (g)"
                        value={config.protein}
                        onChange={(v) => setConfig({ protein: v })}
                        C={C}
                    />
                    <NumberField
                        label="Calories"
                        value={config.calories}
                        onChange={(v) => setConfig({ calories: v })}
                        C={C}
                    />
                </View>

                {/* Mode */}
                <SectionLabel label="Generator Mode" C={C} />
                <View style={{ flexDirection: "row", gap: 10, marginBottom: config.mode === "daily" ? 16 : 24 }}>
                    {(["single", "daily"] as const).map((m) => {
                        const active = config.mode === m;
                        return (
                            <TouchableOpacity
                                key={m}
                                onPress={() => setConfig({ mode: m })}
                                activeOpacity={0.7}
                                style={{
                                    flex: 1, paddingVertical: 14, borderRadius: 14,
                                    borderWidth: 1.5,
                                    borderColor: active ? C.accent : C.border,
                                    backgroundColor: active ? C.accent : C.card,
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{
                                    color: active ? C.background : C.textMuted,
                                    fontWeight: "800", fontSize: 14,
                                }}>
                                    {m === "single" ? "Single Meal" : "Daily Plan"}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {config.mode === "daily" && (
                    <View style={{ marginBottom: 24 }}>
                        <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 12 }}>
                            Meals per day: <Text style={{ color: C.accent, fontWeight: "800" }}>{config.mealsPerDay}</Text>
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            {[1, 2, 3, 4, 5].map((n) => {
                                const active = config.mealsPerDay === n;
                                return (
                                    <TouchableOpacity
                                        key={n}
                                        onPress={() => setConfig({ mealsPerDay: n })}
                                        style={{
                                            flex: 1, height: 44, borderRadius: 12,
                                            borderWidth: 1.5,
                                            borderColor: active ? C.accent : C.border,
                                            backgroundColor: active ? C.accentMuted : C.card,
                                            alignItems: "center", justifyContent: "center",
                                        }}
                                    >
                                        <Text style={{ color: active ? C.accent : C.textMuted, fontWeight: "700", fontSize: 15 }}>{n}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* AI Provider */}
                <SectionLabel label="AI Provider" C={C} />
                <View style={{
                    flexDirection: "row",
                    backgroundColor: C.card,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: C.border,
                    padding: 4,
                    marginBottom: 32,
                }}>
                    {PROVIDER_OPTIONS.map((p) => {
                        const active = config.provider === p.value;
                        return (
                            <TouchableOpacity
                                key={p.value}
                                onPress={() => setConfig({ provider: p.value })}
                                activeOpacity={0.7}
                                style={{
                                    flex: 1, paddingVertical: 10, borderRadius: 11,
                                    backgroundColor: active ? C.cardElevated : "transparent",
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{
                                    color: active ? C.text : C.textMuted,
                                    fontWeight: "700", fontSize: 13,
                                }}>
                                    {p.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Generate button */}
                <TouchableOpacity
                    onPress={handleGenerate}
                    disabled={isGenerating}
                    activeOpacity={0.8}
                    style={{
                        backgroundColor: isGenerating ? C.accentMuted : C.accent,
                        paddingVertical: 18,
                        borderRadius: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 10,
                        shadowColor: C.accent,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: isGenerating ? 0 : 0.35,
                        shadowRadius: 16,
                        elevation: isGenerating ? 0 : 8,
                    }}
                >
                    <MaterialCommunityIcons
                        name="creation"
                        size={22}
                        color={isGenerating ? C.accent : C.background}
                    />
                    <Text style={{
                        color: isGenerating ? C.accent : C.background,
                        fontSize: 17, fontWeight: "900", letterSpacing: 0.3,
                    }}>
                        {isGenerating ? "Generating…" : "Generate with AI"}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

function SectionLabel({ label, C }: { label: string; C: (typeof Colors)["dark"] }) {
    return (
        <Text style={{
            color: C.textMuted, fontSize: 11, fontWeight: "700",
            letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10,
        }}>
            {label}
        </Text>
    );
}

function NumberField({
    label, value, onChange, C,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    C: (typeof Colors)["dark"];
}) {
    return (
        <View style={{ flex: 1 }}>
            <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 6 }}>
                {label}
            </Text>
            <TextInput
                value={String(value)}
                onChangeText={(t) => { onChange(parseInt(t, 10) || 0); }}
                keyboardType="numeric"
                style={{
                    backgroundColor: C.card,
                    borderWidth: 1.5,
                    borderColor: C.border,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: Platform.OS === "ios" ? 12 : 10,
                    color: C.text,
                    fontSize: 16,
                    fontWeight: "700",
                }}
                placeholderTextColor={C.textDim}
            />
        </View>
    );
}
