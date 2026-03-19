import { useState } from "react";
import {
    View, Text, TouchableOpacity, Image, useColorScheme, ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import { INGREDIENTS } from "../lib/meal-data";
import { logMeal } from "../lib/storage";
import type { AnyMeal } from "../lib/store";

interface Props {
    meal: AnyMeal;
    index?: number;
    onLogged?: () => void;
}

function getMealImageUrl(meal: AnyMeal): string {
    const keyword = (meal as { imageKeyword?: string }).imageKeyword ?? meal.title;
    return `https://source.unsplash.com/600x400/?${encodeURIComponent(keyword)},food`;
}

export function MealCard({ meal, index, onLogged }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [imgLoading, setImgLoading] = useState(true);
    const [imgError, setImgError] = useState(false);
    const [logging, setLogging] = useState(false);
    const [logged, setLogged] = useState(false);

    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const isAi = (meal as { isAiGenerated?: boolean }).isAiGenerated;
    const imageUrl = getMealImageUrl(meal);

    async function handleLog() {
        if (logging || logged) return;
        setLogging(true);
        try {
            await logMeal({
                id: meal.id,
                title: meal.title,
                source: meal.source,
                imageKeyword: (meal as { imageKeyword?: string }).imageKeyword,
                totalNutrition: meal.totalNutrition,
            });
            setLogged(true);
            onLogged?.();
        } finally {
            setLogging(false);
        }
    }

    return (
        <View style={{
            backgroundColor: C.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: C.border,
            overflow: "hidden",
            marginBottom: 16,
        }}>
            {/* ── Meal photo ── */}
            <View style={{ height: 180, backgroundColor: C.cardElevated }}>
                {!imgError ? (
                    <>
                        <Image
                            source={{ uri: imageUrl }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                            onLoad={() => setImgLoading(false)}
                            onError={() => { setImgError(true); setImgLoading(false); }}
                        />
                        {imgLoading && (
                            <View style={{
                                position: "absolute", inset: 0,
                                alignItems: "center", justifyContent: "center",
                                backgroundColor: C.cardElevated,
                            }}>
                                <ActivityIndicator color={C.accent} />
                            </View>
                        )}
                    </>
                ) : (
                    // Fallback gradient-style placeholder
                    <View style={{
                        flex: 1, alignItems: "center", justifyContent: "center",
                        backgroundColor: C.accentMuted,
                    }}>
                        <MaterialCommunityIcons name="food-variant" size={48} color={C.accent} />
                    </View>
                )}

                {/* AI badge overlay */}
                {isAi && (
                    <View style={{
                        position: "absolute", top: 10, right: 10,
                        flexDirection: "row", alignItems: "center", gap: 4,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4,
                    }}>
                        <MaterialCommunityIcons name="robot-outline" size={11} color="#a78bfa" />
                        <Text style={{ color: "#a78bfa", fontSize: 10, fontWeight: "700" }}>AI Generated</Text>
                    </View>
                )}

                {/* Meal number overlay */}
                {index !== undefined && (
                    <View style={{
                        position: "absolute", top: 10, left: 10,
                        backgroundColor: C.accent,
                        borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
                    }}>
                        <Text style={{ color: C.background, fontSize: 11, fontWeight: "800" }}>
                            MEAL {index + 1}
                        </Text>
                    </View>
                )}
            </View>

            <View style={{ padding: 16 }}>
                {/* Title + tags */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 10 }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ color: C.text, fontSize: 17, fontWeight: "800", lineHeight: 22 }}>
                            {meal.title}
                        </Text>
                        <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                            {meal.description}
                        </Text>
                    </View>
                    <View style={{ gap: 5 }}>
                        {meal.tags.slice(0, 2).map((tag) => (
                            <View key={tag} style={{
                                backgroundColor: C.cardElevated, borderRadius: 20,
                                paddingHorizontal: 8, paddingVertical: 3,
                            }}>
                                <Text style={{ color: C.textMuted, fontSize: 10, fontWeight: "600" }}>{tag}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Nutrition row */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    <NutriBadge icon="fire" label="kcal" value={meal.totalNutrition.calories} C={C} color={C.accent} />
                    <NutriBadge icon="arm-flex" label="Protein" value={meal.totalNutrition.protein} unit="g" C={C} color={C.success} />
                    <NutriBadge icon="grain" label="Carbs" value={meal.totalNutrition.carbs} unit="g" C={C} color="#60a5fa" />
                    <NutriBadge icon="water" label="Fat" value={meal.totalNutrition.fat} unit="g" C={C} color={C.textMuted} />
                </View>

                {/* Timing row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color={C.textDim} />
                        <Text style={{ color: C.textMuted, fontSize: 12 }}>Prep {meal.prepTime}m</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <MaterialCommunityIcons name="stove" size={13} color={C.textDim} />
                        <Text style={{ color: C.textMuted, fontSize: 12 }}>Cook {meal.cookTime}m</Text>
                    </View>
                    <Text style={{ marginLeft: "auto", color: C.textDim, fontSize: 10 }}>{meal.source}</Text>
                </View>

                {/* Log + expand row */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 0 }}>
                    <TouchableOpacity
                        onPress={handleLog}
                        disabled={logging || logged}
                        activeOpacity={0.7}
                        style={{
                            flex: 1, paddingVertical: 11, borderRadius: 12,
                            backgroundColor: logged ? C.successMuted : C.accentMuted,
                            borderWidth: 1,
                            borderColor: logged ? C.success + "60" : C.accent + "60",
                            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                    >
                        {logging ? (
                            <ActivityIndicator size="small" color={C.accent} />
                        ) : (
                            <>
                                <MaterialCommunityIcons
                                    name={logged ? "check-circle" : "plus-circle-outline"}
                                    size={15}
                                    color={logged ? C.success : C.accent}
                                />
                                <Text style={{
                                    color: logged ? C.success : C.accent,
                                    fontSize: 13, fontWeight: "700",
                                }}>
                                    {logged ? "Logged" : "Log Meal"}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setExpanded(!expanded)}
                        activeOpacity={0.7}
                        style={{
                            flex: 1, paddingVertical: 11, borderRadius: 12,
                            backgroundColor: C.cardElevated,
                            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                    >
                        <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "600" }}>
                            {expanded ? "Hide Details" : "View Details"}
                        </Text>
                        <MaterialCommunityIcons
                            name={expanded ? "chevron-up" : "chevron-down"}
                            size={16}
                            color={C.textMuted}
                        />
                    </TouchableOpacity>
                </View>

                {/* Expanded details */}
                {expanded && (
                    <View style={{ marginTop: 16, gap: 16 }}>
                        <View>
                            <Text style={{ color: C.text, fontSize: 13, fontWeight: "700", marginBottom: 8 }}>
                                Ingredients
                            </Text>
                            {meal.ingredients.map((item, i) => {
                                const aiItem = item as { name?: string; ingredientId: string; amount: number; unit: string };
                                const localIng = INGREDIENTS.find((x) => x.id === item.ingredientId);
                                const name = aiItem.name ?? localIng?.name ?? item.ingredientId;
                                return (
                                    <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                                        <Text style={{ color: C.text, fontWeight: "700", fontSize: 13, minWidth: 60 }}>
                                            {item.amount} {item.unit}
                                        </Text>
                                        <Text style={{ color: C.textMuted, fontSize: 13, flex: 1 }}>{name}</Text>
                                    </View>
                                );
                            })}
                        </View>
                        {meal.instructions.length > 0 && (
                            <View>
                                <Text style={{ color: C.text, fontSize: 13, fontWeight: "700", marginBottom: 8 }}>
                                    Instructions
                                </Text>
                                {meal.instructions.map((step, i) => (
                                    <View key={i} style={{ flexDirection: "row", gap: 10, paddingVertical: 3 }}>
                                        <View style={{
                                            width: 20, height: 20, borderRadius: 10,
                                            backgroundColor: C.accentMuted, alignItems: "center", justifyContent: "center",
                                            marginTop: 1, flexShrink: 0,
                                        }}>
                                            <Text style={{ color: C.accent, fontSize: 10, fontWeight: "800" }}>{i + 1}</Text>
                                        </View>
                                        <Text style={{ color: C.textMuted, fontSize: 13, flex: 1, lineHeight: 19 }}>{step}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

function NutriBadge({
    icon, label, value, unit = "", C, color,
}: {
    icon: string;
    label: string;
    value: number;
    unit?: string;
    C: (typeof Colors)["dark"];
    color: string;
}) {
    return (
        <View style={{
            flex: 1, backgroundColor: C.cardElevated, borderRadius: 12,
            padding: 10, alignItems: "center", gap: 2,
        }}>
            <MaterialCommunityIcons name={icon as "fire"} size={14} color={color} />
            <Text style={{ color: C.text, fontSize: 13, fontWeight: "800" }}>{value}{unit}</Text>
            <Text style={{ color: C.textMuted, fontSize: 10 }}>{label}</Text>
        </View>
    );
}
