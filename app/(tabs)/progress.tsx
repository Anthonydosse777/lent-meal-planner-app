import { useState, useCallback, useRef, useEffect } from "react";
import {
    View, Text, ScrollView, TouchableOpacity, TextInput,
    useColorScheme, Platform, Alert, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import {
    getLoggedMeals, getWeightEntries, saveWeightEntry, removeLoggedMeal, deleteWeightEntry,
    lastNDates, formatDate, todayDate, logMeal,
    type LoggedMeal, type WeightEntry,
} from "../../lib/storage";
import { useStore, getDayCalorieGoal, getWeeklyCalorieTotal } from "../../lib/store";
import { searchFoods, type USDAFood } from "../../lib/usda";
import { lookupBarcode, type BarcodeProduct } from "../../lib/openfoodfacts";
import { BarcodeScanner, isBarcodeScannerAvailable } from "../../components/BarcodeScanner";

type Tab = "nutrition" | "weight";

export default function ProgressScreen() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const { config } = useStore();

    const [tab, setTab] = useState<Tab>("nutrition");
    const [loggedMeals, setLoggedMeals] = useState<LoggedMeal[]>([]);
    const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
    const [weightInput, setWeightInput] = useState("");
    const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("lbs");
    const [savingWeight, setSavingWeight] = useState(false);

    const [customMealTitle, setCustomMealTitle] = useState("");
    const [customCalories, setCustomCalories] = useState("");
    const [customProtein, setCustomProtein] = useState("");
    const [savingMeal, setSavingMeal] = useState(false);
    const [showCustomForm, setShowCustomForm] = useState(false);

    // Food items logger
    const [foodItems, setFoodItems] = useState<{ name: string; grams: string; nutrition: { calories: number; protein: number; carbs: number; fat: number; fiber: number } | null }[]>([]);
    const [showFoodForm, setShowFoodForm] = useState(false);
    const [foodSearch, setFoodSearch] = useState("");
    const [selectedFoodIdx, setSelectedFoodIdx] = useState<number | null>(null);

    // USDA search state
    const [usdaResults, setUsdaResults] = useState<USDAFood[]>([]);
    const [usdaLoading, setUsdaLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Barcode scanning state
    const canScanBarcodes = isBarcodeScannerAvailable();
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannedProduct, setScannedProduct] = useState<BarcodeProduct | null>(null);
    const [servings, setServings] = useState("1");
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    // Debounced USDA search
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!foodSearch.trim()) {
            setUsdaResults([]);
            return;
        }
        setUsdaLoading(true);
        searchTimer.current = setTimeout(async () => {
            try {
                const results = await searchFoods(foodSearch);
                setUsdaResults(results);
            } catch {
                setUsdaResults([]);
            } finally {
                setUsdaLoading(false);
            }
        }, 400);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [foodSearch]);

    // Reload whenever tab becomes active
    useFocusEffect(
        useCallback(() => {
            load();
        }, [])
    );

    async function load() {
        const [meals, weights] = await Promise.all([getLoggedMeals(), getWeightEntries()]);
        setLoggedMeals(meals);
        setWeightEntries(weights);
    }

    async function handleSaveWeight() {
        const val = parseFloat(weightInput);
        if (isNaN(val) || val <= 0) return;
        setSavingWeight(true);
        await saveWeightEntry(val, weightUnit);
        setWeightInput("");
        await load();
        setSavingWeight(false);
    }

    async function handleSaveCustomMeal() {
        if (!customMealTitle && !customCalories && !customProtein) return;
        const cal = parseInt(customCalories, 10) || 0;
        const prot = parseFloat(customProtein) || 0;
        const title = customMealTitle.trim() || "Custom Entry";
        setSavingMeal(true);
        await logMeal({
            id: Math.random().toString(36).slice(2, 10),
            title,
            source: "Manual Entry",
            totalNutrition: { calories: cal, protein: prot, carbs: 0, fiber: 0, fat: 0 }
        });
        setCustomMealTitle("");
        setCustomCalories("");
        setCustomProtein("");
        setShowCustomForm(false);
        await load();
        setSavingMeal(false);
    }

    function addFoodItem(food: USDAFood) {
        setFoodItems([...foodItems, { name: food.description, grams: "", nutrition: food.per100g }]);
        setFoodSearch("");
        setUsdaResults([]);
        setSelectedFoodIdx(null);
    }

    async function handleBarcodeScanned(barcode: string) {
        setScannerOpen(false);
        setLookupLoading(true);
        setLookupError(null);
        try {
            const product = await lookupBarcode(barcode);
            if (!product) {
                setLookupError(`No product found for barcode ${barcode}. Try searching manually.`);
                return;
            }
            if (!product.perServing && !product.per100g) {
                setLookupError("Nutrition info isn't available for this product.");
                return;
            }
            setScannedProduct(product);
            setServings("1");
        } catch (e: any) {
            setLookupError(e?.message ?? "Lookup failed. Check your connection and try again.");
        } finally {
            setLookupLoading(false);
        }
    }

    function closeScannedProduct() {
        setScannedProduct(null);
        setServings("1");
    }

    async function handleLogScannedProduct() {
        if (!scannedProduct) return;
        const n = scannedProduct.perServing ?? scannedProduct.per100g;
        if (!n) return;
        const s = parseFloat(servings);
        if (!Number.isFinite(s) || s <= 0) return;

        setSavingMeal(true);
        const title = scannedProduct.brand
            ? `${scannedProduct.brand} — ${scannedProduct.name}`
            : scannedProduct.name;
        const suffix = scannedProduct.perServing
            ? ` (${s} serving${s === 1 ? "" : "s"})`
            : ` (${s}g)`;

        await logMeal({
            id: Math.random().toString(36).slice(2, 10),
            title: title + suffix,
            source: "Barcode",
            totalNutrition: {
                calories: Math.round(n.calories * s),
                protein: Math.round(n.protein * s * 10) / 10,
                carbs: Math.round(n.carbs * s * 10) / 10,
                fat: Math.round(n.fat * s * 10) / 10,
                fiber: Math.round(n.fiber * s * 10) / 10,
            },
        });
        closeScannedProduct();
        await load();
        setSavingMeal(false);
    }

    function addCustomFoodItem() {
        const name = foodSearch.trim() || "Custom Food";
        setFoodItems([...foodItems, { name, grams: "", nutrition: null }]);
        setFoodSearch("");
        setUsdaResults([]);
    }

    function updateFoodGrams(idx: number, grams: string) {
        const updated = [...foodItems];
        updated[idx].grams = grams;
        setFoodItems(updated);
    }

    function removeFoodItem(idx: number) {
        setFoodItems(foodItems.filter((_, i) => i !== idx));
    }

    function getFoodItemNutrition(item: typeof foodItems[0]) {
        const g = parseFloat(item.grams) || 0;
        if (!item.nutrition || g <= 0) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
        const scale = g / 100;
        return {
            calories: Math.round(item.nutrition.calories * scale),
            protein: Math.round(item.nutrition.protein * scale * 10) / 10,
            carbs: Math.round(item.nutrition.carbs * scale * 10) / 10,
            fat: Math.round(item.nutrition.fat * scale * 10) / 10,
            fiber: Math.round(item.nutrition.fiber * scale * 10) / 10,
        };
    }

    const foodTotals = foodItems.reduce(
        (acc, item) => {
            const n = getFoodItemNutrition(item);
            return {
                calories: acc.calories + n.calories,
                protein: acc.protein + n.protein,
                carbs: acc.carbs + n.carbs,
                fat: acc.fat + n.fat,
                fiber: acc.fiber + n.fiber,
            };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );

    async function handleSaveFoodItems() {
        if (foodItems.length === 0) return;
        const validItems = foodItems.filter((item) => parseFloat(item.grams) > 0);
        if (validItems.length === 0) return;
        setSavingMeal(true);
        const title = validItems.map((item) => `${item.name} ${item.grams}g`).join(", ");
        await logMeal({
            id: Math.random().toString(36).slice(2, 10),
            title,
            source: "Custom Foods",
            totalNutrition: {
                calories: Math.round(foodTotals.calories),
                protein: Math.round(foodTotals.protein),
                carbs: Math.round(foodTotals.carbs),
                fat: Math.round(foodTotals.fat),
                fiber: Math.round(foodTotals.fiber),
            },
        });
        setFoodItems([]);
        setShowFoodForm(false);
        await load();
        setSavingMeal(false);
    }

    async function handleDeleteMeal(id: string) {
        await removeLoggedMeal(id);
        await load();
    }

    async function handleDeleteWeight(date: string) {
        Alert.alert("Remove entry", "Delete this weight entry?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive",
                onPress: async () => { await deleteWeightEntry(date); await load(); },
            },
        ]);
    }

    const dates = lastNDates(7);
    const today = todayDate();

    // Group meals by date
    const mealsByDate = dates.reduce<Record<string, LoggedMeal[]>>((acc, d) => {
        acc[d] = loggedMeals.filter((m) => m.date === d);
        return acc;
    }, {});

    // Weekly totals
    const weeklyMeals = loggedMeals.filter((m) => dates.includes(m.date));
    const weeklyTotals = weeklyMeals.reduce(
        (acc, m) => ({
            calories: acc.calories + m.meal.totalNutrition.calories,
            protein: acc.protein + m.meal.totalNutrition.protein,
            carbs: acc.carbs + m.meal.totalNutrition.carbs,
            fat: acc.fat + m.meal.totalNutrition.fat,
            fiber: acc.fiber + m.meal.totalNutrition.fiber,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );

    // Daily calorie bars
    const dailyCalories = dates.map((d) => ({
        date: d,
        calories: mealsByDate[d].reduce((s, m) => s + m.meal.totalNutrition.calories, 0),
        meals: mealsByDate[d],
    }));
    const maxCal = Math.max(
        ...dailyCalories.map((d) => d.calories),
        ...config.weeklyCalories,
        1,
    );

    // Weight trend — last 10 entries
    const recentWeights = weightEntries.slice(-10);
    const todayWeight = weightEntries.find((e) => e.date === today);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                <Text style={{ color: C.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 }}>
                    Progress
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>
                    Last 7 days
                </Text>

                {/* Sub-tab */}
                <View style={{
                    flexDirection: "row", marginTop: 14,
                    backgroundColor: C.card, borderRadius: 14, padding: 3,
                    borderWidth: 1, borderColor: C.border,
                }}>
                    {(["nutrition", "weight"] as Tab[]).map((t) => (
                        <TouchableOpacity
                            key={t}
                            onPress={() => setTab(t)}
                            activeOpacity={0.7}
                            style={{
                                flex: 1, paddingVertical: 9, borderRadius: 11,
                                backgroundColor: tab === t ? C.cardElevated : "transparent",
                                alignItems: "center",
                            }}
                        >
                            <Text style={{
                                color: tab === t ? C.text : C.textMuted,
                                fontSize: 13, fontWeight: "700",
                            }}>
                                {t === "nutrition" ? "Nutrition" : "Weight"}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {tab === "nutrition" ? (
                    <>
                        {/* Log Food Items */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 20, borderWidth: 1,
                            borderColor: C.border, padding: 16, marginBottom: 20,
                        }}>
                            <TouchableOpacity
                                onPress={() => setShowFoodForm(!showFoodForm)}
                                activeOpacity={0.7}
                                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                            >
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                    <View style={{
                                        width: 32, height: 32, borderRadius: 10,
                                        backgroundColor: C.accentMuted,
                                        alignItems: "center", justifyContent: "center",
                                    }}>
                                        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={C.accent} />
                                    </View>
                                    <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
                                        Log What You Ate
                                    </Text>
                                </View>
                                <MaterialCommunityIcons
                                    name={showFoodForm ? "chevron-up" : "chevron-down"}
                                    size={20}
                                    color={C.textMuted}
                                />
                            </TouchableOpacity>

                            {showFoodForm && (
                                <View style={{ marginTop: 16 }}>
                                    {/* Scan barcode (mobile with camera only) */}
                                    {canScanBarcodes && !scannedProduct && (
                                        <TouchableOpacity
                                            onPress={() => { setLookupError(null); setScannerOpen(true); }}
                                            activeOpacity={0.8}
                                            style={{
                                                flexDirection: "row", alignItems: "center", justifyContent: "center",
                                                gap: 8, paddingVertical: 12, borderRadius: 12,
                                                backgroundColor: C.accent, marginBottom: 12,
                                            }}
                                        >
                                            <MaterialCommunityIcons name="barcode-scan" size={18} color={C.background} />
                                            <Text style={{ color: C.background, fontSize: 14, fontWeight: "800" }}>
                                                Scan barcode
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {lookupLoading && (
                                        <View style={{
                                            flexDirection: "row", alignItems: "center", gap: 8,
                                            backgroundColor: C.cardElevated, padding: 12,
                                            borderRadius: 12, marginBottom: 12,
                                        }}>
                                            <ActivityIndicator size="small" color={C.accent} />
                                            <Text style={{ color: C.textMuted, fontSize: 13 }}>
                                                Looking up product…
                                            </Text>
                                        </View>
                                    )}

                                    {lookupError && (
                                        <View style={{
                                            backgroundColor: C.dangerMuted ?? "#7f1d1d",
                                            padding: 12, borderRadius: 12, marginBottom: 12,
                                        }}>
                                            <Text style={{ color: C.danger ?? "#fecaca", fontSize: 12, fontWeight: "600" }}>
                                                {lookupError}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Scanned product preview */}
                                    {scannedProduct && (
                                        <View style={{
                                            backgroundColor: C.cardElevated, borderRadius: 14, padding: 14,
                                            marginBottom: 12, borderWidth: 1, borderColor: C.accent + "40",
                                        }}>
                                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: C.text, fontSize: 14, fontWeight: "800" }} numberOfLines={2}>
                                                        {scannedProduct.name}
                                                    </Text>
                                                    {scannedProduct.brand && (
                                                        <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                                                            {scannedProduct.brand}
                                                        </Text>
                                                    )}
                                                    <Text style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>
                                                        Barcode {scannedProduct.barcode}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity onPress={closeScannedProduct} hitSlop={8}>
                                                    <MaterialCommunityIcons name="close-circle" size={20} color={C.textDim} />
                                                </TouchableOpacity>
                                            </View>

                                            {/* Per-serving info */}
                                            {(() => {
                                                const n = scannedProduct.perServing ?? scannedProduct.per100g;
                                                if (!n) return null;
                                                const unit = scannedProduct.perServing
                                                    ? `per serving${scannedProduct.servingSize ? ` (${scannedProduct.servingSize})` : ""}`
                                                    : "per 100g";
                                                return (
                                                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borderFaint }}>
                                                        <Text style={{ color: C.textDim, fontSize: 10, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                                            {unit}
                                                        </Text>
                                                        <View style={{ flexDirection: "row", gap: 12 }}>
                                                            <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>{n.calories} cal</Text>
                                                            <Text style={{ color: C.success, fontSize: 12, fontWeight: "600" }}>{n.protein}g P</Text>
                                                            <Text style={{ color: "#60a5fa", fontSize: 12, fontWeight: "600" }}>{n.carbs}g C</Text>
                                                            <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600" }}>{n.fat}g F</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })()}

                                            {/* Servings input */}
                                            <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
                                                <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "600" }}>
                                                    {scannedProduct.perServing ? "Servings:" : "Grams:"}
                                                </Text>
                                                <TextInput
                                                    value={servings}
                                                    onChangeText={setServings}
                                                    keyboardType="decimal-pad"
                                                    selectTextOnFocus
                                                    style={{
                                                        width: 80,
                                                        backgroundColor: C.card,
                                                        borderWidth: 1.5, borderColor: C.border,
                                                        borderRadius: 10, paddingHorizontal: 10,
                                                        paddingVertical: 8,
                                                        color: C.text, fontSize: 14, fontWeight: "700",
                                                        textAlign: "center",
                                                    }}
                                                />
                                                {(() => {
                                                    const n = scannedProduct.perServing ?? scannedProduct.per100g;
                                                    const s = parseFloat(servings);
                                                    if (!n || !Number.isFinite(s) || s <= 0) return null;
                                                    const factor = scannedProduct.perServing ? s : s / 100;
                                                    return (
                                                        <Text style={{ color: C.accent, fontSize: 13, fontWeight: "800" }}>
                                                            = {Math.round(n.calories * factor)} cal
                                                        </Text>
                                                    );
                                                })()}
                                            </View>

                                            <TouchableOpacity
                                                onPress={handleLogScannedProduct}
                                                disabled={savingMeal || !parseFloat(servings)}
                                                activeOpacity={0.8}
                                                style={{
                                                    marginTop: 12, paddingVertical: 11, borderRadius: 12,
                                                    backgroundColor: parseFloat(servings) ? C.accent : C.card,
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Text style={{
                                                    color: parseFloat(servings) ? C.background : C.textDim,
                                                    fontWeight: "800", fontSize: 14,
                                                }}>
                                                    {savingMeal ? "Logging…" : "Log This"}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Search / add food */}
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                        <View style={{ flex: 1, position: "relative" }}>
                                            <View style={{ position: "absolute", left: 12, top: 11, zIndex: 1 }}>
                                                <MaterialCommunityIcons name="magnify" size={18} color={C.textDim} />
                                            </View>
                                            <TextInput
                                                value={foodSearch}
                                                onChangeText={setFoodSearch}
                                                placeholder="Search USDA database..."
                                                placeholderTextColor={C.textDim}
                                                style={{
                                                    backgroundColor: C.cardElevated,
                                                    borderWidth: 1.5, borderColor: C.border,
                                                    borderRadius: 12, paddingHorizontal: 14, paddingLeft: 36,
                                                    paddingVertical: Platform.OS === "ios" ? 11 : 9,
                                                    color: C.text, fontSize: 14, fontWeight: "600",
                                                }}
                                            />
                                        </View>
                                        {foodSearch.trim().length > 0 && (
                                            <TouchableOpacity
                                                onPress={addCustomFoodItem}
                                                activeOpacity={0.7}
                                                style={{
                                                    backgroundColor: C.cardElevated,
                                                    borderWidth: 1.5, borderColor: C.border,
                                                    borderRadius: 12, paddingHorizontal: 14,
                                                    paddingVertical: Platform.OS === "ios" ? 11 : 9,
                                                }}
                                            >
                                                <MaterialCommunityIcons name="plus" size={18} color={C.accent} />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* Search results — render inline so they push the cards
                                        below down instead of being covered by them. Only visible
                                        while the user is actually searching. */}
                                    {(usdaResults.length > 0 || usdaLoading) && foodSearch.trim().length > 0 && (
                                        <View style={{
                                            backgroundColor: C.cardElevated,
                                            borderRadius: 12, marginTop: 8,
                                            borderWidth: 1, borderColor: C.border,
                                            overflow: "hidden",
                                        }}>
                                            {usdaLoading && usdaResults.length === 0 ? (
                                                <View style={{ padding: 14, alignItems: "center" }}>
                                                    <ActivityIndicator size="small" color={C.accent} />
                                                    <Text style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>
                                                        Searching USDA database...
                                                    </Text>
                                                </View>
                                            ) : (
                                                usdaResults.map((food, i) => (
                                                    <TouchableOpacity
                                                        key={food.fdcId}
                                                        onPress={() => addFoodItem(food)}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            paddingHorizontal: 14, paddingVertical: 11,
                                                            borderBottomWidth: i < usdaResults.length - 1 ? 1 : 0,
                                                            borderBottomColor: C.borderFaint,
                                                        }}
                                                    >
                                                        <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                                                            {food.description}
                                                        </Text>
                                                        <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
                                                            {food.per100g.calories} cal · {food.per100g.protein}g P · {food.per100g.carbs}g C · {food.per100g.fat}g F / 100g
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))
                                            )}
                                        </View>
                                    )}

                                    {/* Added food items */}
                                    {foodItems.length > 0 && (
                                        <View style={{ marginTop: 14, gap: 8 }}>
                                            {foodItems.map((item, idx) => {
                                                const n = getFoodItemNutrition(item);
                                                return (
                                                    <View key={idx} style={{
                                                        backgroundColor: C.cardElevated,
                                                        borderRadius: 14, padding: 12,
                                                        borderWidth: 1, borderColor: C.borderFaint,
                                                    }}>
                                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }}>
                                                                    {item.name}
                                                                </Text>
                                                                {!item.nutrition && (
                                                                    <Text style={{ color: C.danger, fontSize: 10, marginTop: 2 }}>
                                                                        Custom entry — calories won't auto-calculate
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            <TextInput
                                                                value={item.grams}
                                                                onChangeText={(v) => updateFoodGrams(idx, v)}
                                                                placeholder="grams"
                                                                placeholderTextColor={C.textDim}
                                                                keyboardType="numeric"
                                                                style={{
                                                                    width: 80,
                                                                    backgroundColor: C.card,
                                                                    borderWidth: 1.5, borderColor: C.border,
                                                                    borderRadius: 10, paddingHorizontal: 10,
                                                                    paddingVertical: 6,
                                                                    color: C.text, fontSize: 14, fontWeight: "700",
                                                                    textAlign: "center",
                                                                }}
                                                            />
                                                            <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600" }}>g</Text>
                                                            <TouchableOpacity onPress={() => removeFoodItem(idx)} hitSlop={8}>
                                                                <MaterialCommunityIcons name="close-circle" size={18} color={C.textDim} />
                                                            </TouchableOpacity>
                                                        </View>
                                                        {item.nutrition && parseFloat(item.grams) > 0 && (
                                                            <View style={{
                                                                flexDirection: "row", gap: 12, marginTop: 8,
                                                                paddingTop: 8, borderTopWidth: 1, borderTopColor: C.borderFaint,
                                                            }}>
                                                                <Text style={{ color: C.accent, fontSize: 11, fontWeight: "700" }}>{n.calories} cal</Text>
                                                                <Text style={{ color: C.success, fontSize: 11, fontWeight: "600" }}>{n.protein}g P</Text>
                                                                <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "600" }}>{n.carbs}g C</Text>
                                                                <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600" }}>{n.fat}g F</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })}

                                            {/* Totals */}
                                            {foodTotals.calories > 0 && (
                                                <View style={{
                                                    flexDirection: "row", justifyContent: "space-between",
                                                    backgroundColor: C.accentMuted, borderRadius: 12, padding: 12,
                                                    borderWidth: 1, borderColor: C.accent + "30",
                                                }}>
                                                    <Text style={{ color: C.accent, fontSize: 13, fontWeight: "800" }}>Total</Text>
                                                    <View style={{ flexDirection: "row", gap: 12 }}>
                                                        <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>{Math.round(foodTotals.calories)} cal</Text>
                                                        <Text style={{ color: C.success, fontSize: 12, fontWeight: "600" }}>{Math.round(foodTotals.protein)}g P</Text>
                                                        <Text style={{ color: "#60a5fa", fontSize: 12, fontWeight: "600" }}>{Math.round(foodTotals.carbs)}g C</Text>
                                                        <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600" }}>{Math.round(foodTotals.fat)}g F</Text>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Save button */}
                                            <TouchableOpacity
                                                onPress={handleSaveFoodItems}
                                                disabled={savingMeal || foodItems.every((i) => !parseFloat(i.grams))}
                                                activeOpacity={0.7}
                                                style={{
                                                    paddingVertical: 13, borderRadius: 14,
                                                    backgroundColor: foodItems.some((i) => parseFloat(i.grams) > 0) ? C.accent : C.cardElevated,
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Text style={{
                                                    color: foodItems.some((i) => parseFloat(i.grams) > 0) ? C.background : C.textDim,
                                                    fontWeight: "800", fontSize: 14,
                                                }}>
                                                    {savingMeal ? "Saving..." : "Log This Meal"}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Quick-add calories only (collapsed) */}
                                    <TouchableOpacity
                                        onPress={() => setShowCustomForm(!showCustomForm)}
                                        style={{ marginTop: 14, alignItems: "center" }}
                                    >
                                        <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600" }}>
                                            {showCustomForm ? "Hide quick entry" : "Or just log calories & protein manually"}
                                        </Text>
                                    </TouchableOpacity>

                                    {showCustomForm && (() => {
                                        const hasAnyInput = Boolean(customMealTitle || customCalories || customProtein);
                                        return (
                                            <View style={{ marginTop: 10, gap: 10 }}>
                                                <TextInput
                                                    value={customMealTitle}
                                                    onChangeText={setCustomMealTitle}
                                                    placeholder="Meal name"
                                                    placeholderTextColor={C.textDim}
                                                    style={{
                                                        backgroundColor: C.cardElevated,
                                                        borderWidth: 1.5, borderColor: C.border,
                                                        borderRadius: 12, paddingHorizontal: 14,
                                                        paddingVertical: Platform.OS === "ios" ? 10 : 8,
                                                        color: C.text, fontSize: 14, fontWeight: "600",
                                                    }}
                                                />
                                                <View style={{ flexDirection: "row", gap: 10 }}>
                                                    <TextInput
                                                        value={customCalories}
                                                        onChangeText={setCustomCalories}
                                                        placeholder="Calories"
                                                        placeholderTextColor={C.textDim}
                                                        keyboardType="numeric"
                                                        style={{
                                                            flex: 1,
                                                            backgroundColor: C.cardElevated,
                                                            borderWidth: 1.5, borderColor: C.border,
                                                            borderRadius: 12, paddingHorizontal: 14,
                                                            paddingVertical: Platform.OS === "ios" ? 10 : 8,
                                                            color: C.text, fontSize: 14, fontWeight: "600",
                                                        }}
                                                    />
                                                    <TextInput
                                                        value={customProtein}
                                                        onChangeText={setCustomProtein}
                                                        placeholder="Protein (g)"
                                                        placeholderTextColor={C.textDim}
                                                        keyboardType="decimal-pad"
                                                        style={{
                                                            flex: 1,
                                                            backgroundColor: C.cardElevated,
                                                            borderWidth: 1.5, borderColor: C.border,
                                                            borderRadius: 12, paddingHorizontal: 14,
                                                            paddingVertical: Platform.OS === "ios" ? 10 : 8,
                                                            color: C.text, fontSize: 14, fontWeight: "600",
                                                        }}
                                                    />
                                                </View>
                                                <TouchableOpacity
                                                    onPress={handleSaveCustomMeal}
                                                    disabled={!hasAnyInput || savingMeal}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        paddingVertical: 11, borderRadius: 12,
                                                        backgroundColor: hasAnyInput ? C.accent : C.cardElevated,
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <Text style={{
                                                        color: hasAnyInput ? C.background : C.textDim,
                                                        fontWeight: "800", fontSize: 14,
                                                    }}>
                                                        Save Quick Entry
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })()}
                                </View>
                            )}
                        </View>

                        {/* Weekly summary cards */}
                        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                            <WeekSummaryCard label="Calories" value={weeklyTotals.calories} unit="kcal" target={getWeeklyCalorieTotal(config)} C={C} color={C.accent} />
                            <WeekSummaryCard label="Protein" value={weeklyTotals.protein} unit="g" target={config.protein * 7} C={C} color={C.success} />
                        </View>
                        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                            <WeekSummaryCard label="Carbs" value={weeklyTotals.carbs} unit="g" C={C} color="#60a5fa" />
                            <WeekSummaryCard label="Fat" value={weeklyTotals.fat} unit="g" C={C} color={C.textMuted} />
                        </View>

                        {/* 7-day calorie bar chart */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 20, borderWidth: 1,
                            borderColor: C.border, padding: 16, marginBottom: 20,
                        }}>
                            <Text style={{ color: C.text, fontSize: 14, fontWeight: "700", marginBottom: 16 }}>
                                Daily Calories
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 100 }}>
                                {dailyCalories.map(({ date, calories }) => {
                                    const pct = calories / maxCal;
                                    const isToday = date === today;
                                    return (
                                        <View key={date} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                                            <View style={{
                                                width: "100%", height: Math.max(pct * 80, calories > 0 ? 4 : 0),
                                                backgroundColor: isToday ? C.accent : C.accentMuted,
                                                borderRadius: 6, marginTop: "auto",
                                            }} />
                                            <Text style={{
                                                color: isToday ? C.accent : C.textDim,
                                                fontSize: 9, fontWeight: isToday ? "800" : "500",
                                            }}>
                                                {formatDate(date).split(" ")[0]}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                            {/* Target line label */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                                <View style={{ width: 12, height: 2, backgroundColor: C.accent, borderRadius: 1 }} />
                                <Text style={{ color: C.textMuted, fontSize: 11 }}>
                                    Target: {getDayCalorieGoal(config)} kcal today
                                </Text>
                            </View>
                        </View>

                        {/* Daily breakdown */}
                        {dates.slice().reverse().map((date) => {
                            const dayMeals = mealsByDate[date];
                            const dayCalories = dayMeals.reduce((s, m) => s + m.meal.totalNutrition.calories, 0);
                            const dayProtein = dayMeals.reduce((s, m) => s + m.meal.totalNutrition.protein, 0);
                            const isToday = date === today;

                            return (
                                <View key={date} style={{
                                    backgroundColor: C.card, borderRadius: 18, borderWidth: 1,
                                    borderColor: isToday ? C.accent + "50" : C.border,
                                    marginBottom: 12, overflow: "hidden",
                                }}>
                                    {/* Day header */}
                                    <View style={{
                                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                                        paddingHorizontal: 16, paddingVertical: 12,
                                        borderBottomWidth: dayMeals.length > 0 ? 1 : 0,
                                        borderBottomColor: C.border,
                                    }}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            {isToday && (
                                                <View style={{
                                                    backgroundColor: C.accent, borderRadius: 8,
                                                    paddingHorizontal: 7, paddingVertical: 2,
                                                }}>
                                                    <Text style={{ color: C.background, fontSize: 9, fontWeight: "800" }}>TODAY</Text>
                                                </View>
                                            )}
                                            <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
                                                {formatDate(date)}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: "flex-end" }}>
                                            <Text style={{ color: dayCalories > 0 ? C.accent : C.textDim, fontSize: 14, fontWeight: "800" }}>
                                                {dayCalories > 0 ? `${dayCalories} kcal` : "—"}
                                            </Text>
                                            {dayProtein > 0 && (
                                                <Text style={{ color: C.success, fontSize: 11, fontWeight: "600" }}>
                                                    {dayProtein}g protein
                                                </Text>
                                            )}
                                        </View>
                                    </View>

                                    {/* Meals list */}
                                    {dayMeals.map((entry) => (
                                        <LoggedMealRow
                                            key={entry.id}
                                            entry={entry}
                                            C={C}
                                            onDelete={() => handleDeleteMeal(entry.id)}
                                        />
                                    ))}

                                    {dayMeals.length === 0 && (
                                        <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                                            <Text style={{ color: C.textDim, fontSize: 12 }}>No meals logged</Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </>
                ) : (
                    <>
                        {/* Log weight today */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 20, borderWidth: 1,
                            borderColor: C.border, padding: 16, marginBottom: 20,
                        }}>
                            <Text style={{ color: C.text, fontSize: 14, fontWeight: "700", marginBottom: 14 }}>
                                Log Today's Weight
                                {todayWeight && (
                                    <Text style={{ color: C.textMuted, fontWeight: "500", fontSize: 12 }}>
                                        {" "}· logged: {todayWeight.weight} {todayWeight.unit}
                                    </Text>
                                )}
                            </Text>

                            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                                {(["lbs", "kg"] as const).map((u) => (
                                    <TouchableOpacity
                                        key={u}
                                        onPress={() => setWeightUnit(u)}
                                        activeOpacity={0.7}
                                        style={{
                                            paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10,
                                            backgroundColor: weightUnit === u ? C.accentMuted : C.cardElevated,
                                            borderWidth: 1, borderColor: weightUnit === u ? C.accent + "60" : C.border,
                                        }}
                                    >
                                        <Text style={{
                                            color: weightUnit === u ? C.accent : C.textMuted,
                                            fontWeight: "700", fontSize: 13,
                                        }}>
                                            {u}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <TextInput
                                    value={weightInput}
                                    onChangeText={setWeightInput}
                                    placeholder={`Weight in ${weightUnit}`}
                                    placeholderTextColor={C.textDim}
                                    keyboardType="decimal-pad"
                                    style={{
                                        flex: 1,
                                        backgroundColor: C.cardElevated,
                                        borderWidth: 1.5, borderColor: C.border,
                                        borderRadius: 12, paddingHorizontal: 14,
                                        paddingVertical: Platform.OS === "ios" ? 12 : 10,
                                        color: C.text, fontSize: 16, fontWeight: "700",
                                    }}
                                />
                                <TouchableOpacity
                                    onPress={handleSaveWeight}
                                    disabled={!weightInput || savingWeight}
                                    activeOpacity={0.7}
                                    style={{
                                        paddingHorizontal: 20, borderRadius: 12,
                                        backgroundColor: weightInput ? C.accent : C.cardElevated,
                                        alignItems: "center", justifyContent: "center",
                                    }}
                                >
                                    <Text style={{
                                        color: weightInput ? C.background : C.textDim,
                                        fontWeight: "800", fontSize: 14,
                                    }}>
                                        Save
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Weight trend chart */}
                        {recentWeights.length >= 2 && (
                            <WeightChart entries={recentWeights} C={C} />
                        )}

                        {/* Weight history list */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 20, borderWidth: 1,
                            borderColor: C.border, overflow: "hidden", marginTop: 16,
                        }}>
                            <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
                                <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
                                    History
                                </Text>
                            </View>
                            {recentWeights.length === 0 ? (
                                <View style={{ padding: 20, alignItems: "center" }}>
                                    <Text style={{ color: C.textDim, fontSize: 13 }}>No weight entries yet</Text>
                                </View>
                            ) : (
                                [...recentWeights].reverse().map((entry, i) => {
                                    const prev = recentWeights[recentWeights.length - 2 - i];
                                    const delta = prev ? entry.weight - prev.weight : null;
                                    return (
                                        <TouchableOpacity
                                            key={entry.date}
                                            onLongPress={() => handleDeleteWeight(entry.date)}
                                            activeOpacity={0.8}
                                            style={{
                                                flexDirection: "row", alignItems: "center",
                                                paddingHorizontal: 16, paddingVertical: 13,
                                                borderBottomWidth: i < recentWeights.length - 1 ? 1 : 0,
                                                borderBottomColor: C.borderFaint,
                                            }}
                                        >
                                            <Text style={{ color: C.textMuted, fontSize: 13, flex: 1 }}>
                                                {formatDate(entry.date)}
                                                {entry.date === today && (
                                                    <Text style={{ color: C.accent }}> · Today</Text>
                                                )}
                                            </Text>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                                {delta !== null && (
                                                    <Text style={{
                                                        fontSize: 12, fontWeight: "600",
                                                        color: delta < 0 ? C.success : delta > 0 ? C.danger : C.textDim,
                                                    }}>
                                                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                                                    </Text>
                                                )}
                                                <Text style={{ color: C.text, fontSize: 15, fontWeight: "800" }}>
                                                    {entry.weight} {entry.unit}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                            {recentWeights.length > 0 && (
                                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                                    <Text style={{ color: C.textDim, fontSize: 11, textAlign: "center" }}>
                                        Long press an entry to delete
                                    </Text>
                                </View>
                            )}
                        </View>
                    </>
                )}
            </ScrollView>

            <BarcodeScanner
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScan={handleBarcodeScanned}
            />
        </SafeAreaView>
    );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function WeekSummaryCard({
    label, value, unit, target, C, color,
}: {
    label: string; value: number; unit: string;
    target?: number; C: (typeof Colors)["dark"]; color: string;
}) {
    const pct = target ? Math.min((value / target) * 100, 100) : null;
    return (
        <View style={{
            flex: 1, backgroundColor: C.card, borderRadius: 18,
            borderWidth: 1, borderColor: C.border, padding: 14,
        }}>
            <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 4 }}>{label}</Text>
            <Text style={{ color: color, fontSize: 22, fontWeight: "900" }}>
                {Math.round(value)}<Text style={{ fontSize: 12, fontWeight: "600" }}> {unit}</Text>
            </Text>
            {pct !== null && (
                <>
                    <View style={{ height: 4, backgroundColor: C.cardElevated, borderRadius: 2, marginTop: 8 }}>
                        <View style={{ height: 4, width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
                    </View>
                    <Text style={{ color: C.textDim, fontSize: 10, marginTop: 4 }}>
                        {Math.round(pct)}% of weekly target
                    </Text>
                </>
            )}
        </View>
    );
}

function LoggedMealRow({
    entry, C, onDelete,
}: {
    entry: LoggedMeal; C: (typeof Colors)["dark"]; onDelete: () => void;
}) {
    const imageUrl = entry.meal.imageKeyword
        ? `https://source.unsplash.com/80x80/?${encodeURIComponent(entry.meal.imageKeyword)},food`
        : null;

    return (
        <View style={{
            flexDirection: "row", alignItems: "center",
            paddingHorizontal: 16, paddingVertical: 10,
            borderBottomWidth: 1, borderBottomColor: C.borderFaint,
            gap: 12,
        }}>
            {/* Thumbnail */}
            <View style={{
                width: 44, height: 44, borderRadius: 10,
                backgroundColor: C.accentMuted, overflow: "hidden",
            }}>
                {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <MaterialCommunityIcons name="food-variant" size={20} color={C.accent} />
                    </View>
                )}
            </View>

            <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                    {entry.meal.title}
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>
                    {entry.meal.totalNutrition.calories} kcal · {entry.meal.totalNutrition.protein}g protein
                </Text>
            </View>

            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={16} color={C.textDim} />
            </TouchableOpacity>
        </View>
    );
}

function WeightChart({
    entries, C,
}: {
    entries: WeightEntry[]; C: (typeof Colors)["dark"];
}) {
    const weights = entries.map((e) => e.weight);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const range = maxW - minW || 1;
    const CHART_H = 90;
    const unit = entries[entries.length - 1]?.unit ?? "lbs";

    return (
        <View style={{
            backgroundColor: C.card, borderRadius: 20, borderWidth: 1,
            borderColor: C.border, padding: 16,
        }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>Weight Trend</Text>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    {minW.toFixed(1)} – {maxW.toFixed(1)} {unit}
                </Text>
            </View>

            {/* Dot chart */}
            <View style={{ height: CHART_H, flexDirection: "row", alignItems: "flex-end", gap: 0 }}>
                {entries.map((e, i) => {
                    const normalised = (e.weight - minW) / range;
                    const dotY = CHART_H - normalised * (CHART_H - 16) - 8;
                    const isLast = i === entries.length - 1;
                    return (
                        <View key={e.date} style={{ flex: 1, height: CHART_H, justifyContent: "flex-end" }}>
                            {/* Connecting line to next */}
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: CHART_H }}>
                                <View style={{
                                    position: "absolute",
                                    bottom: normalised * (CHART_H - 16) + 6,
                                    left: "50%",
                                    width: 10, height: 10, borderRadius: 5,
                                    backgroundColor: isLast ? C.accent : C.accentMuted,
                                    borderWidth: 2,
                                    borderColor: isLast ? C.accentLight : C.accent + "40",
                                    transform: [{ translateX: -5 }],
                                }} />
                            </View>
                            <Text style={{
                                color: C.textDim, fontSize: 8, textAlign: "center",
                                marginBottom: 2,
                            }}>
                                {formatDate(e.date).split(" ")[0]}
                            </Text>
                        </View>
                    );
                })}
            </View>

            {/* Latest + change */}
            {entries.length >= 2 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <Text style={{ color: C.text, fontSize: 18, fontWeight: "900" }}>
                        {entries[entries.length - 1].weight} {unit}
                    </Text>
                    {(() => {
                        const delta = entries[entries.length - 1].weight - entries[0].weight;
                        return (
                            <View style={{
                                flexDirection: "row", alignItems: "center", gap: 4,
                                backgroundColor: delta < 0 ? C.successMuted : delta > 0 ? C.dangerMuted : C.cardElevated,
                                borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
                            }}>
                                <MaterialCommunityIcons
                                    name={delta < 0 ? "trending-down" : delta > 0 ? "trending-up" : "minus"}
                                    size={14}
                                    color={delta < 0 ? C.success : delta > 0 ? C.danger : C.textMuted}
                                />
                                <Text style={{
                                    color: delta < 0 ? C.success : delta > 0 ? C.danger : C.textMuted,
                                    fontSize: 12, fontWeight: "700",
                                }}>
                                    {delta > 0 ? "+" : ""}{delta.toFixed(1)} {unit} over {entries.length} entries
                                </Text>
                            </View>
                        );
                    })()}
                </View>
            )}
        </View>
    );
}
