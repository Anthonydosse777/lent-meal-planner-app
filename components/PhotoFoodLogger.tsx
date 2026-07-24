import { useEffect, useRef, useState } from "react";
import {
    View, Text, TouchableOpacity, Modal, Platform, useColorScheme,
    ActivityIndicator, TextInput, ScrollView, Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import { analyzeFoodPhoto, type PhotoFoodAnalysis, type Macros } from "../lib/api";
import { searchAllFoods, type USDAFood } from "../lib/food-search";
import type { FoodHistoryItem } from "../lib/storage";

export interface PhotoLogEntry {
    name: string;
    brandName?: string;
    quantityLabel: string; // e.g. "100 g" or "1 can (355 ml)"
    totalNutrition: Macros;
    per100g?: Macros | null; // saved to history when we know a per-100g basis
}

interface PhotoFoodLoggerProps {
    visible: boolean;
    onClose: () => void;
    foodHistory: FoodHistoryItem[];
    onLog: (entry: PhotoLogEntry) => Promise<void>;
}

// Runtime check so we can hide the entry point on devices without a camera.
export function isPhotoLoggerAvailable(): boolean {
    if (Platform.OS !== "web") return false;
    if (typeof navigator === "undefined") return false;
    return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

type Phase = "camera" | "analyzing" | "review";
type AmountMode = "grams" | "serving";
type OptionSource = "history" | "search" | "ai" | "manual";

interface FoodOption {
    key: string;
    name: string;
    brandName?: string;
    per100g: Macros | null;
    perServing?: Macros | null;
    servingLabel?: string | null;
    source: OptionSource;
    exact: boolean; // real database / remembered nutrition vs. an AI estimate
}

const MANUAL_KEY = "manual";
const MAX_PHOTO_DIM = 1280;
const MAX_RECENT_SENT = 15;

function downscaleToJpeg(source: CanvasImageSource, width: number, height: number): string {
    const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
}

function historyLabel(item: FoodHistoryItem): string {
    return item.brandName ? `${item.brandName} — ${item.name}` : item.name;
}

function scaleMacros(m: Macros, factor: number): Macros {
    const r = (n: number) => Math.round(n * factor * 10) / 10;
    return {
        calories: Math.round(m.calories * factor),
        protein: r(m.protein),
        carbs: r(m.carbs),
        fat: r(m.fat),
        fiber: r(m.fiber),
    };
}

function optionFromSearch(f: USDAFood): FoodOption {
    return {
        key: `search-${f.fdcId}`,
        name: f.description,
        brandName: f.brandName,
        per100g: f.per100g,
        source: "search",
        exact: true,
    };
}

export function PhotoFoodLogger({ visible, onClose, foodHistory, onLog }: PhotoFoodLoggerProps) {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const videoRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const userPickedRef = useRef(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [phase, setPhase] = useState<Phase>("camera");
    const [starting, setStarting] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<PhotoFoodAnalysis | null>(null);

    // Options to choose from + which is selected.
    const [options, setOptions] = useState<FoodOption[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [autoSearching, setAutoSearching] = useState(false);

    // Brand/product search box.
    const [searchText, setSearchText] = useState("");
    const [searchResults, setSearchResults] = useState<USDAFood[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // Amount.
    const [amountMode, setAmountMode] = useState<AmountMode>("grams");
    const [grams, setGrams] = useState("");
    const [servings, setServings] = useState("1");

    // Manual entry fields (used when the manual option is selected).
    const [mName, setMName] = useState("");
    const [mBrand, setMBrand] = useState("");
    const [mCal, setMCal] = useState("");
    const [mProt, setMProt] = useState("");
    const [mCarb, setMCarb] = useState("");
    const [mFat, setMFat] = useState("");
    const [mFib, setMFib] = useState("");
    const [saving, setSaving] = useState(false);

    function stopStream() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    }

    function resetAll() {
        stopStream();
        setPhase("camera");
        setStarting(true);
        setCameraError(null);
        setError(null);
        setPhotoUri(null);
        setAnalysis(null);
        setOptions([]);
        setSelectedKey(null);
        setAutoSearching(false);
        setSearchText("");
        setSearchResults([]);
        setSearchLoading(false);
        setAmountMode("grams");
        setGrams("");
        setServings("1");
        setMName(""); setMBrand("");
        setMCal(""); setMProt(""); setMCarb(""); setMFat(""); setMFib("");
        setSaving(false);
        userPickedRef.current = false;
    }

    // Start the camera whenever the modal is open and we're in the camera phase.
    useEffect(() => {
        if (!visible || phase !== "camera" || Platform.OS !== "web") return;

        let cancelled = false;
        setCameraError(null);
        setStarting(true);

        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                const video = videoRef.current as HTMLVideoElement | null;
                if (!video) return;
                video.srcObject = stream;
                video.setAttribute("playsinline", "true");
                await video.play().catch(() => {});
                setStarting(false);
            } catch (e: any) {
                if (cancelled) return;
                const msg =
                    e?.name === "NotAllowedError"
                        ? "Camera permission denied. Allow access in your browser settings."
                        : e?.name === "NotFoundError"
                            ? "No camera found on this device."
                            : e?.message ?? "Failed to start camera.";
                setCameraError(msg);
                setStarting(false);
            }
        })();

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [visible, phase]);

    // Reset every time the modal is opened fresh.
    useEffect(() => {
        if (visible) resetAll();
        else stopStream();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    function historyMatchFor(a: PhotoFoodAnalysis): number | null {
        if (a.matchedRecentIndex !== null && foodHistory[a.matchedRecentIndex]) {
            return a.matchedRecentIndex;
        }
        const names = [a.productName, a.foodGuess, ...a.candidates.map((c) => c.name)]
            .filter((n): n is string => Boolean(n))
            .map((n) => n.toLowerCase().trim());
        const idx = foodHistory.findIndex((h) => names.includes(h.name.toLowerCase().trim()));
        return idx >= 0 ? idx : null;
    }

    // Build the initial option list (before the async DB search resolves).
    function buildBaseOptions(a: PhotoFoodAnalysis): FoodOption[] {
        const opts: FoodOption[] = [];

        const matchIdx = historyMatchFor(a);
        if (matchIdx !== null) {
            const h = foodHistory[matchIdx];
            opts.push({
                key: `history-${matchIdx}`,
                name: h.name,
                brandName: h.brandName,
                per100g: h.per100g,
                source: "history",
                exact: true,
            });
        }

        // The AI's primary branded/product guess (carries serving info).
        const primaryName = a.productName ?? a.foodGuess;
        if (primaryName && (a.per100g || a.perServing)) {
            opts.push({
                key: "ai-primary",
                name: primaryName,
                brandName: a.brand ?? undefined,
                per100g: a.per100g,
                perServing: a.perServing,
                servingLabel: a.servingLabel,
                source: "ai",
                exact: false,
            });
        }

        // Alternative candidate identities (e.g. greek yogurt vs sour cream).
        a.candidates.forEach((c, i) => {
            const dup = opts.some((o) => o.name.toLowerCase().trim() === c.name.toLowerCase().trim());
            if (!dup) {
                opts.push({
                    key: `ai-${i}`,
                    name: c.name,
                    per100g: c.per100g,
                    source: "ai",
                    exact: false,
                });
            }
        });

        return opts;
    }

    function selectOption(key: string, opts: FoodOption[] = options) {
        setSelectedKey(key);
        const opt = opts.find((o) => o.key === key);
        // Prefer serving mode only for a packaged AI product with no scale weight.
        if (opt?.perServing && analysis?.scaleWeightGrams == null && analysis?.recommendedLogMode === "serving") {
            setAmountMode("serving");
        } else {
            setAmountMode("grams");
        }
    }

    async function runAutoSearch(a: PhotoFoodAnalysis, baseOptions: FoodOption[]) {
        const query = (a.searchQuery
            ?? [a.brand, a.productName].filter(Boolean).join(" ").trim())
            || a.foodGuess
            || (a.candidates[0]?.name ?? "");
        if (!query.trim()) return;

        setAutoSearching(true);
        try {
            const results = await searchAllFoods(query);
            const top = results.slice(0, 4).map(optionFromSearch);
            if (top.length === 0) return;

            setOptions((prev) => {
                // Keep history first, then DB matches, then AI guesses.
                const history = prev.filter((o) => o.source === "history");
                const ai = prev.filter((o) => o.source === "ai");
                return [...history, ...top, ...ai];
            });
            // Auto-select the best exact match unless the user already chose.
            if (!userPickedRef.current) {
                const hasHistory = baseOptions.some((o) => o.source === "history");
                if (!hasHistory) selectOption(top[0].key, [...baseOptions, ...top]);
            }
        } catch {
            // best-effort; AI estimates remain available
        } finally {
            setAutoSearching(false);
        }
    }

    function beginReview(a: PhotoFoodAnalysis | null, analysisError?: string) {
        setAnalysis(a);
        setError(analysisError ?? null);

        // Amount defaults.
        if (a?.scaleWeightGrams != null) {
            setGrams(String(a.scaleWeightGrams));
        } else {
            setGrams("");
        }
        setServings("1");

        // Manual fallback prefilled with the AI's best estimate.
        setMName(a?.productName ?? a?.foodGuess ?? a?.candidates[0]?.name ?? "");
        setMBrand(a?.brand ?? "");
        const est = a?.per100g ?? a?.candidates[0]?.per100g ?? null;
        setMCal(est ? String(est.calories) : "");
        setMProt(est ? String(est.protein) : "");
        setMCarb(est ? String(est.carbs) : "");
        setMFat(est ? String(est.fat) : "");
        setMFib(est ? String(est.fiber) : "");

        const base = a ? buildBaseOptions(a) : [];
        setOptions(base);
        setSearchText(a?.searchQuery ?? "");

        // Default selection: remembered match first, else AI best guess, else manual.
        const initialKey = base[0]?.key ?? MANUAL_KEY;
        selectOption(initialKey, base);

        setPhase("review");
        if (a) runAutoSearch(a, base);
    }

    async function runAnalysis(dataUrl: string) {
        setPhase("analyzing");
        setError(null);
        try {
            const recent = foodHistory.slice(0, MAX_RECENT_SENT).map(historyLabel);
            const a = await analyzeFoodPhoto(dataUrl.split(",")[1] ?? "", recent);
            beginReview(a);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Analysis failed.";
            beginReview(null, `Couldn't analyze the photo: ${msg} You can still search or log it manually below.`);
        }
    }

    function handleCapture() {
        const video = videoRef.current as HTMLVideoElement | null;
        if (!video || !video.videoWidth) return;
        const dataUrl = downscaleToJpeg(video, video.videoWidth, video.videoHeight);
        stopStream();
        if (!dataUrl) {
            setCameraError("Couldn't capture the photo. Try again.");
            return;
        }
        setPhotoUri(dataUrl);
        runAnalysis(dataUrl);
    }

    function handleUploadPress() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const img = new window.Image();
                img.onload = () => {
                    const dataUrl = downscaleToJpeg(img, img.naturalWidth, img.naturalHeight);
                    stopStream();
                    if (!dataUrl) return;
                    setPhotoUri(dataUrl);
                    runAnalysis(dataUrl);
                };
                img.src = String(reader.result);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    function retakePhoto() {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        setPhotoUri(null);
        setAnalysis(null);
        setOptions([]);
        setSelectedKey(null);
        setSearchResults([]);
        setError(null);
        setPhase("camera");
        setStarting(true);
        userPickedRef.current = false;
    }

    // Manual brand/product search box (debounced).
    useEffect(() => {
        if (phase !== "review") return;
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const q = searchText.trim();
        if (!q) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }
        setSearchLoading(true);
        searchTimer.current = setTimeout(async () => {
            const results = await searchAllFoods(q).catch(() => [] as USDAFood[]);
            setSearchResults(results.slice(0, 12));
            setSearchLoading(false);
        }, 400);
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
        };
    }, [searchText, phase]);

    function pickManualSearchResult(f: USDAFood) {
        userPickedRef.current = true;
        const opt = optionFromSearch(f);
        setOptions((prev) => {
            if (prev.some((o) => o.key === opt.key)) return prev;
            const history = prev.filter((o) => o.source === "history");
            const rest = prev.filter((o) => o.source !== "history");
            return [...history, opt, ...rest];
        });
        selectOption(opt.key, [...options, opt]);
        setSearchText("");
        setSearchResults([]);
    }

    // The selected option, with manual fields resolved live.
    function resolveSelected(): FoodOption | null {
        if (selectedKey === MANUAL_KEY) {
            const name = mName.trim();
            if (!name) return null;
            return {
                key: MANUAL_KEY,
                name,
                brandName: mBrand.trim() || undefined,
                per100g: {
                    calories: parseFloat(mCal) || 0,
                    protein: parseFloat(mProt) || 0,
                    carbs: parseFloat(mCarb) || 0,
                    fat: parseFloat(mFat) || 0,
                    fiber: parseFloat(mFib) || 0,
                },
                source: "manual",
                exact: false,
            };
        }
        return options.find((o) => o.key === selectedKey) ?? null;
    }

    const selected = phase === "review" ? resolveSelected() : null;
    const canWeigh = Boolean(selected?.per100g);
    const canServe = Boolean(selected?.perServing);
    const effMode: AmountMode =
        amountMode === "serving" && canServe ? "serving"
            : canWeigh ? "grams"
                : canServe ? "serving" : "grams";

    function buildEntry(): PhotoLogEntry | null {
        const id = resolveSelected();
        if (!id) return null;
        if (effMode === "serving" && id.perServing) {
            const s = parseFloat(servings);
            if (!Number.isFinite(s) || s <= 0) return null;
            const label = id.servingLabel
                ? (s === 1 ? id.servingLabel : `${s} × ${id.servingLabel}`)
                : `${s} serving${s === 1 ? "" : "s"}`;
            return {
                name: id.name,
                brandName: id.brandName,
                quantityLabel: label,
                totalNutrition: scaleMacros(id.perServing, s),
                per100g: id.per100g,
            };
        }
        if (id.per100g) {
            const g = parseFloat(grams);
            if (!Number.isFinite(g) || g <= 0) return null;
            return {
                name: id.name,
                brandName: id.brandName,
                quantityLabel: `${Math.round(g * 10) / 10} g`,
                totalNutrition: scaleMacros(id.per100g, g / 100),
                per100g: id.per100g,
            };
        }
        return null;
    }

    const preview = phase === "review" ? buildEntry() : null;
    const canLog = Boolean(preview) && !saving;

    async function handleLog() {
        const entry = buildEntry();
        if (!entry) return;
        setSaving(true);
        setError(null);
        try {
            await onLog(entry);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't log the food. Try again.");
        } finally {
            setSaving(false);
        }
    }

    const inputStyle = {
        backgroundColor: C.card,
        borderWidth: 1.5, borderColor: C.border,
        borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
        color: C.text, fontSize: 14, fontWeight: "600" as const,
    };

    function sourceBadge(o: FoodOption) {
        if (o.source === "history") return { label: "REMEMBERED", color: C.violet, bg: C.violetMuted };
        if (o.source === "search") return { label: "EXACT", color: C.success, bg: C.successMuted };
        return { label: "AI ESTIMATE", color: C.accent, bg: C.accentMuted };
    }

    function renderOption(o: FoodOption) {
        const selectedThis = selectedKey === o.key;
        const badge = sourceBadge(o);
        return (
            <TouchableOpacity
                key={o.key}
                onPress={() => { userPickedRef.current = true; selectOption(o.key); }}
                activeOpacity={0.7}
                style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, marginBottom: 6,
                    backgroundColor: selectedThis ? C.accentMuted : C.cardElevated,
                    borderWidth: 1, borderColor: selectedThis ? C.accent : "transparent",
                }}
            >
                <MaterialCommunityIcons
                    name={selectedThis ? "radiobox-marked" : "radiobox-blank"}
                    size={18}
                    color={selectedThis ? C.accent : C.textDim}
                />
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }} numberOfLines={2}>
                            {o.brandName ? `${o.brandName} — ${o.name}` : o.name}
                        </Text>
                        <View style={{ backgroundColor: badge.bg, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                            <Text style={{ color: badge.color, fontSize: 9, fontWeight: "800" }}>{badge.label}</Text>
                        </View>
                    </View>
                    {o.per100g && (
                        <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>
                            {o.per100g.calories} cal · {o.per100g.protein}g P · {o.per100g.carbs}g C · {o.per100g.fat}g F / 100g
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    }

    const isManual = selectedKey === MANUAL_KEY;

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
            <View style={{ flex: 1, backgroundColor: phase === "review" ? C.background : "#000" }}>
                {/* Header */}
                <View style={{
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                    paddingHorizontal: 20, paddingTop: Platform.OS === "ios" ? 56 : 20, paddingBottom: 16,
                    backgroundColor: phase === "review" ? C.background : "rgba(0,0,0,0.6)",
                }}>
                    <Text style={{ color: phase === "review" ? C.text : "#fff", fontSize: 18, fontWeight: "800" }}>
                        {phase === "review" ? "Confirm & Log" : "Photo Log"}
                    </Text>
                    <TouchableOpacity onPress={onClose} hitSlop={12}>
                        <MaterialCommunityIcons name="close" size={26} color={phase === "review" ? C.text : "#fff"} />
                    </TouchableOpacity>
                </View>

                {/* ── Camera phase ── */}
                {phase === "camera" && (
                    <>
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                            {Platform.OS === "web" ? (
                                <View style={{ width: "100%", height: "100%", position: "relative" }}>
                                    <video
                                        ref={videoRef}
                                        style={{ width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#000" }}
                                        muted
                                        autoPlay
                                        playsInline
                                    />
                                    {starting && !cameraError && (
                                        <View style={{
                                            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: "rgba(0,0,0,0.5)",
                                            justifyContent: "center", alignItems: "center",
                                        }}>
                                            <ActivityIndicator color="#fff" size="large" />
                                            <Text style={{ color: "#fff", marginTop: 10, fontSize: 13 }}>
                                                Starting camera…
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <Text style={{ color: "#fff", padding: 24, textAlign: "center" }}>
                                    Photo logging from the camera is currently available on web only.
                                </Text>
                            )}
                        </View>

                        <View style={{ padding: 20, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", gap: 14 }}>
                            {cameraError ? (
                                <Text style={{ color: "#fca5a5", fontSize: 13, textAlign: "center" }}>
                                    {cameraError}
                                </Text>
                            ) : (
                                <Text style={{ color: "#d1d5db", fontSize: 12, textAlign: "center" }}>
                                    Snap the food or drink. Put it on a scale for an exact weight, or just capture the label — it adapts.
                                </Text>
                            )}
                            {Platform.OS === "web" && (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 28 }}>
                                    <TouchableOpacity
                                        onPress={handleCapture}
                                        disabled={starting || Boolean(cameraError)}
                                        activeOpacity={0.8}
                                        style={{
                                            width: 68, height: 68, borderRadius: 34,
                                            backgroundColor: starting || cameraError ? "#555" : "#fff",
                                            borderWidth: 4, borderColor: C.accent,
                                            alignItems: "center", justifyContent: "center",
                                        }}
                                    >
                                        <MaterialCommunityIcons name="camera" size={28} color="#111" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleUploadPress} hitSlop={10} style={{ alignItems: "center" }}>
                                        <MaterialCommunityIcons name="image-plus" size={26} color="#fff" />
                                        <Text style={{ color: "#d1d5db", fontSize: 10, marginTop: 4 }}>Upload</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </>
                )}

                {/* ── Analyzing phase ── */}
                {phase === "analyzing" && (
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
                        {photoUri && (
                            <Image
                                source={{ uri: photoUri }}
                                style={{ width: 220, height: 220, borderRadius: 20, opacity: 0.85 }}
                                resizeMode="cover"
                            />
                        )}
                        <ActivityIndicator color={C.accent} size="large" />
                        <Text style={{ color: "#d1d5db", fontSize: 13 }}>
                            Identifying your food and reading the scale…
                        </Text>
                    </View>
                )}

                {/* ── Review phase ── */}
                {phase === "review" && (
                    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                        {error && (
                            <View style={{ backgroundColor: C.dangerMuted, padding: 12, borderRadius: 12, marginBottom: 12 }}>
                                <Text style={{ color: C.danger, fontSize: 12, fontWeight: "600" }}>{error}</Text>
                            </View>
                        )}

                        {/* Photo + amount (weight or servings) */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
                            padding: 14, marginBottom: 14, flexDirection: "row", gap: 14, alignItems: "center",
                        }}>
                            {photoUri && (
                                <Image
                                    source={{ uri: photoUri }}
                                    style={{ width: 84, height: 84, borderRadius: 12 }}
                                    resizeMode="cover"
                                />
                            )}
                            <View style={{ flex: 1 }}>
                                {effMode === "serving" ? (
                                    <>
                                        <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
                                            {selected?.servingLabel
                                                ? `How many · ${selected.servingLabel}`
                                                : "How many servings"}
                                        </Text>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <TextInput
                                                value={servings}
                                                onChangeText={setServings}
                                                keyboardType="decimal-pad"
                                                selectTextOnFocus
                                                placeholder="1"
                                                placeholderTextColor={C.textDim}
                                                style={[inputStyle, { width: 70, textAlign: "center", fontSize: 16, fontWeight: "800" }]}
                                            />
                                            <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }}>
                                                {parseFloat(servings) === 1 ? "serving" : "servings"}
                                            </Text>
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
                                            {analysis?.scaleWeightGrams != null
                                                ? "Weight read from your scale"
                                                : "Weight in grams"}
                                        </Text>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <TextInput
                                                value={grams}
                                                onChangeText={setGrams}
                                                keyboardType="decimal-pad"
                                                selectTextOnFocus
                                                placeholder="0"
                                                placeholderTextColor={C.textDim}
                                                style={[inputStyle, { width: 90, textAlign: "center", fontSize: 16, fontWeight: "800" }]}
                                            />
                                            <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>g</Text>
                                            {analysis?.scaleWeightGrams != null && (
                                                <MaterialCommunityIcons name="scale" size={18} color={C.success} />
                                            )}
                                        </View>
                                    </>
                                )}
                                {canWeigh && canServe && (
                                    <TouchableOpacity
                                        onPress={() => setAmountMode(effMode === "serving" ? "grams" : "serving")}
                                        hitSlop={8}
                                        style={{ marginTop: 8 }}
                                    >
                                        <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>
                                            {effMode === "serving" ? "Log by weight instead →" : "Log by serving instead →"}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Options list */}
                        <View style={{
                            backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
                            padding: 14, marginBottom: 14,
                        }}>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                <Text style={{ color: C.text, fontSize: 14, fontWeight: "800" }}>
                                    Which is it?
                                </Text>
                                {autoSearching && <ActivityIndicator size="small" color={C.accent} />}
                            </View>
                            {analysis && !isManual && (
                                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
                                    Pick the exact product for accurate nutrition. Green = real database values, gold = AI estimate.
                                </Text>
                            )}

                            {!isManual && options.map(renderOption)}

                            {/* Manual entry option */}
                            {isManual ? (
                                <View style={{ gap: 10 }}>
                                    <Text style={{ color: C.text, fontSize: 13, fontWeight: "800" }}>Enter it manually</Text>
                                    <TextInput
                                        value={mName}
                                        onChangeText={setMName}
                                        placeholder="Food or drink name (e.g. Greek Yogurt)"
                                        placeholderTextColor={C.textDim}
                                        style={inputStyle}
                                    />
                                    <TextInput
                                        value={mBrand}
                                        onChangeText={setMBrand}
                                        placeholder="Brand (optional, e.g. Lidl)"
                                        placeholderTextColor={C.textDim}
                                        style={inputStyle}
                                    />
                                    <Text style={{ color: C.textDim, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Nutrition per 100g
                                    </Text>
                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                        {([
                                            ["Cal", mCal, setMCal],
                                            ["Protein", mProt, setMProt],
                                            ["Carbs", mCarb, setMCarb],
                                            ["Fat", mFat, setMFat],
                                            ["Fiber", mFib, setMFib],
                                        ] as const).map(([label, value, setter]) => (
                                            <View key={label} style={{ flex: 1 }}>
                                                <Text style={{ color: C.textMuted, fontSize: 10, fontWeight: "700", marginBottom: 4, textAlign: "center" }}>
                                                    {label}
                                                </Text>
                                                <TextInput
                                                    value={value}
                                                    onChangeText={setter}
                                                    keyboardType="decimal-pad"
                                                    selectTextOnFocus
                                                    placeholder="0"
                                                    placeholderTextColor={C.textDim}
                                                    style={[inputStyle, { paddingHorizontal: 4, textAlign: "center" }]}
                                                />
                                            </View>
                                        ))}
                                    </View>
                                    {options.length > 0 && (
                                        <TouchableOpacity onPress={() => selectOption(options[0].key)} hitSlop={8}>
                                            <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>
                                                ← Back to detected options
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => { userPickedRef.current = true; setSelectedKey(MANUAL_KEY); }}
                                    activeOpacity={0.7}
                                    style={{
                                        flexDirection: "row", alignItems: "center", gap: 10,
                                        paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12,
                                        backgroundColor: C.cardElevated, marginTop: 2,
                                    }}
                                >
                                    <MaterialCommunityIcons name="pencil-plus-outline" size={18} color={C.accent} />
                                    <Text style={{ color: C.accent, fontSize: 13, fontWeight: "700" }}>
                                        None of these — enter it myself
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Brand / product search */}
                        {!isManual && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
                                padding: 14, marginBottom: 14,
                            }}>
                                <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
                                    Not the right brand? Search for it:
                                </Text>
                                <View style={{ position: "relative" }}>
                                    <View style={{ position: "absolute", left: 12, top: 11, zIndex: 1 }}>
                                        <MaterialCommunityIcons name="magnify" size={18} color={C.textDim} />
                                    </View>
                                    <TextInput
                                        value={searchText}
                                        onChangeText={setSearchText}
                                        placeholder="e.g. Fage 0% greek yogurt"
                                        placeholderTextColor={C.textDim}
                                        style={[inputStyle, { paddingLeft: 38 }]}
                                    />
                                    {searchLoading && (
                                        <View style={{ position: "absolute", right: 12, top: 11 }}>
                                            <ActivityIndicator size="small" color={C.accent} />
                                        </View>
                                    )}
                                </View>
                                {searchResults.length > 0 && (
                                    <View style={{ marginTop: 8 }}>
                                        {searchResults.map((f) => (
                                            <TouchableOpacity
                                                key={`sr-${f.fdcId}`}
                                                onPress={() => pickManualSearchResult(f)}
                                                activeOpacity={0.7}
                                                style={{
                                                    paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10,
                                                    marginBottom: 4, backgroundColor: C.cardElevated,
                                                }}
                                            >
                                                <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>
                                                    {f.brandName ? `${f.brandName} — ${f.description}` : f.description}
                                                </Text>
                                                <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>
                                                    {f.per100g.calories} cal · {f.per100g.protein}g P · {f.per100g.carbs}g C · {f.per100g.fat}g F / 100g
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Actions */}
                        <TouchableOpacity
                            onPress={handleLog}
                            disabled={!canLog}
                            activeOpacity={0.8}
                            style={{
                                paddingVertical: 13, borderRadius: 12, alignItems: "center",
                                backgroundColor: canLog ? C.accent : C.card,
                                borderWidth: canLog ? 0 : 1, borderColor: C.border,
                            }}
                        >
                            <Text style={{ color: canLog ? C.background : C.textDim, fontWeight: "800", fontSize: 15 }}>
                                {saving
                                    ? "Logging…"
                                    : preview
                                        ? `Log ${preview.quantityLabel} · ${preview.totalNutrition.calories} cal`
                                        : "Pick a food and amount to log"}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={retakePhoto}
                            activeOpacity={0.7}
                            style={{ paddingVertical: 12, alignItems: "center" }}
                        >
                            <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "700" }}>
                                Retake photo
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                )}
            </View>
        </Modal>
    );
}
