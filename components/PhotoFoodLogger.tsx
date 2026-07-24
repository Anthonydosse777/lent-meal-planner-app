import { useEffect, useRef, useState } from "react";
import {
    View, Text, TouchableOpacity, Modal, Platform, useColorScheme,
    ActivityIndicator, TextInput, ScrollView, Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import { analyzeFoodPhoto, type PhotoFoodAnalysis } from "../lib/api";
import type { FoodHistoryItem } from "../lib/storage";

export interface PhotoLogEntry {
    name: string;
    brandName?: string;
    grams: number;
    per100g: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
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
type IdMode = "detected" | "choose" | "manual";

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

export function PhotoFoodLogger({ visible, onClose, foodHistory, onLog }: PhotoFoodLoggerProps) {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const videoRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [phase, setPhase] = useState<Phase>("camera");
    const [starting, setStarting] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<PhotoFoodAnalysis | null>(null);

    // Review state
    const [grams, setGrams] = useState("");
    const [mode, setMode] = useState<IdMode>("manual");
    const [chosenIdx, setChosenIdx] = useState<number | null>(null);
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
        setGrams("");
        setMode("manual");
        setChosenIdx(null);
        setMName(""); setMBrand("");
        setMCal(""); setMProt(""); setMCarb(""); setMFat(""); setMFib("");
        setSaving(false);
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
        const name = (a.productName ?? a.foodGuess ?? "").toLowerCase().trim();
        if (!name) return null;
        const idx = foodHistory.findIndex((h) => h.name.toLowerCase().trim() === name);
        return idx >= 0 ? idx : null;
    }

    function beginReview(a: PhotoFoodAnalysis | null, analysisError?: string) {
        setAnalysis(a);
        setError(analysisError ?? null);
        setGrams(a?.scaleWeightGrams ? String(a.scaleWeightGrams) : "");

        // Prefill the manual form with the AI's best guess so it's useful as a fallback.
        setMName(a?.productName ?? a?.foodGuess ?? "");
        setMBrand(a?.brand ?? "");
        setMCal(a?.per100g ? String(a.per100g.calories) : "");
        setMProt(a?.per100g ? String(a.per100g.protein) : "");
        setMCarb(a?.per100g ? String(a.per100g.carbs) : "");
        setMFat(a?.per100g ? String(a.per100g.fat) : "");
        setMFib(a?.per100g ? String(a.per100g.fiber) : "");

        const matchIdx = a ? historyMatchFor(a) : null;
        setChosenIdx(matchIdx);

        const detectedName = a?.productName ?? a?.foodGuess;
        if (a?.labelDetected && detectedName && (matchIdx !== null || a.per100g)) {
            // Clear label on the package (e.g. "Lidl Greek Yogurt") — trust it.
            setMode("detected");
        } else if (foodHistory.length > 0) {
            // No label: ask the user, starting from their recently logged foods.
            setMode("choose");
        } else {
            setMode("manual");
        }
        setPhase("review");
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
            beginReview(null, `Couldn't analyze the photo (${msg}). You can still log it manually below.`);
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
        setPhotoUri(null);
        setAnalysis(null);
        setError(null);
        setPhase("camera");
        setStarting(true);
    }

    // What food + nutrition is currently selected, across the three modes.
    function resolveSelection(): { name: string; brandName?: string; per100g: PhotoLogEntry["per100g"] } | null {
        if (mode === "detected" && analysis) {
            const name = analysis.productName ?? analysis.foodGuess;
            if (!name) return null;
            const matchIdx = historyMatchFor(analysis);
            const match = matchIdx !== null ? foodHistory[matchIdx] : null;
            const per100g = match?.per100g ?? analysis.per100g;
            if (!per100g) return null;
            return {
                name: match?.name ?? name,
                brandName: analysis.brand ?? match?.brandName ?? undefined,
                per100g,
            };
        }
        if (mode === "choose") {
            if (chosenIdx === null || !foodHistory[chosenIdx]) return null;
            const item = foodHistory[chosenIdx];
            return { name: item.name, brandName: item.brandName, per100g: item.per100g };
        }
        // manual
        const name = mName.trim();
        if (!name) return null;
        return {
            name,
            brandName: mBrand.trim() || undefined,
            per100g: {
                calories: parseFloat(mCal) || 0,
                protein: parseFloat(mProt) || 0,
                carbs: parseFloat(mCarb) || 0,
                fat: parseFloat(mFat) || 0,
                fiber: parseFloat(mFib) || 0,
            },
        };
    }

    const selection = phase === "review" ? resolveSelection() : null;
    const gramsNum = parseFloat(grams);
    const canLog = Boolean(selection) && Number.isFinite(gramsNum) && gramsNum > 0 && !saving;
    const previewCalories = selection && Number.isFinite(gramsNum) && gramsNum > 0
        ? Math.round(selection.per100g.calories * (gramsNum / 100))
        : null;

    async function handleLog() {
        const sel = resolveSelection();
        const g = parseFloat(grams);
        if (!sel || !Number.isFinite(g) || g <= 0) return;
        setSaving(true);
        setError(null);
        try {
            await onLog({ ...sel, grams: Math.round(g * 10) / 10 });
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

    const detectedName = analysis?.productName ?? analysis?.foodGuess ?? null;
    const detectedMatchIdx = analysis ? historyMatchFor(analysis) : null;
    const detectedPer100g = detectedMatchIdx !== null
        ? foodHistory[detectedMatchIdx].per100g
        : analysis?.per100g ?? null;

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
                                    Fit the food, its label, and the scale display in the frame, then snap.
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
                            Reading the scale and identifying your food…
                        </Text>
                    </View>
                )}

                {/* ── Review phase ── */}
                {phase === "review" && (
                    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                        {error && (
                            <View style={{ backgroundColor: C.dangerMuted, padding: 12, borderRadius: 12, marginBottom: 12 }}>
                                <Text style={{ color: C.danger, fontSize: 12, fontWeight: "600" }}>{error}</Text>
                            </View>
                        )}

                        {/* Photo + weight */}
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
                                <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
                                    {analysis?.scaleWeightGrams
                                        ? "Weight read from your scale"
                                        : "Couldn't read the scale — enter the weight"}
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
                            </View>
                        </View>

                        {/* ── Detected (labeled product) ── */}
                        {mode === "detected" && analysis && detectedName && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
                                borderColor: C.accent + "50", padding: 14, marginBottom: 14,
                            }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <MaterialCommunityIcons name="tag-text-outline" size={16} color={C.accent} />
                                    <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Label detected
                                    </Text>
                                </View>
                                <Text style={{ color: C.text, fontSize: 16, fontWeight: "800" }}>
                                    {detectedName}
                                </Text>
                                {analysis.brand && (
                                    <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>
                                        {analysis.brand}
                                    </Text>
                                )}
                                {detectedPer100g && (
                                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.borderFaint }}>
                                        <Text style={{ color: C.textDim, fontSize: 10, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                            per 100g · {detectedMatchIdx !== null ? "from your history" : "AI estimate"}
                                        </Text>
                                        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                                            <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>{detectedPer100g.calories} cal</Text>
                                            <Text style={{ color: C.success, fontSize: 12, fontWeight: "600" }}>{detectedPer100g.protein}g P</Text>
                                            <Text style={{ color: "#60a5fa", fontSize: 12, fontWeight: "600" }}>{detectedPer100g.carbs}g C</Text>
                                            <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600" }}>{detectedPer100g.fat}g F</Text>
                                        </View>
                                    </View>
                                )}
                                <TouchableOpacity
                                    onPress={() => setMode(foodHistory.length > 0 ? "choose" : "manual")}
                                    hitSlop={8}
                                    style={{ marginTop: 10 }}
                                >
                                    <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>
                                        Wrong food? Pick or enter it yourself →
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* ── Choose from recent foods ── */}
                        {mode === "choose" && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
                                padding: 14, marginBottom: 14,
                            }}>
                                <Text style={{ color: C.text, fontSize: 14, fontWeight: "800", marginBottom: 4 }}>
                                    Which food is this?
                                </Text>
                                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
                                    {analysis?.foodGuess
                                        ? `Looks like ${analysis.foodGuess}. Pick from your recent foods:`
                                        : "Pick from your recent foods:"}
                                </Text>
                                {foodHistory.slice(0, 8).map((item, idx) => {
                                    const isBest = idx === (analysis ? historyMatchFor(analysis) : null);
                                    const selected = chosenIdx === idx;
                                    return (
                                        <TouchableOpacity
                                            key={`${item.name}-${idx}`}
                                            onPress={() => setChosenIdx(idx)}
                                            activeOpacity={0.7}
                                            style={{
                                                flexDirection: "row", alignItems: "center", gap: 10,
                                                paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12,
                                                marginBottom: 6,
                                                backgroundColor: selected ? C.accentMuted : C.cardElevated,
                                                borderWidth: 1,
                                                borderColor: selected ? C.accent : "transparent",
                                            }}
                                        >
                                            <MaterialCommunityIcons
                                                name={selected ? "radiobox-marked" : "radiobox-blank"}
                                                size={18}
                                                color={selected ? C.accent : C.textDim}
                                            />
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                                    <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                                                        {historyLabel(item)}
                                                    </Text>
                                                    {isBest && (
                                                        <View style={{ backgroundColor: C.successMuted, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                                                            <Text style={{ color: C.success, fontSize: 9, fontWeight: "800" }}>BEST MATCH</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>
                                                    {item.per100g.calories} cal · {item.per100g.protein}g P / 100g
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                                <TouchableOpacity
                                    onPress={() => setMode("manual")}
                                    activeOpacity={0.7}
                                    style={{
                                        flexDirection: "row", alignItems: "center", gap: 10,
                                        paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12,
                                        backgroundColor: C.cardElevated,
                                    }}
                                >
                                    <MaterialCommunityIcons name="pencil-plus-outline" size={18} color={C.accent} />
                                    <Text style={{ color: C.accent, fontSize: 13, fontWeight: "700" }}>
                                        None of these — enter it myself
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* ── Manual entry ── */}
                        {mode === "manual" && (
                            <View style={{
                                backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
                                padding: 14, marginBottom: 14, gap: 10,
                            }}>
                                <Text style={{ color: C.text, fontSize: 14, fontWeight: "800" }}>
                                    What is it?
                                </Text>
                                <TextInput
                                    value={mName}
                                    onChangeText={setMName}
                                    placeholder="Food name (e.g. Greek Yogurt)"
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
                                <Text style={{ color: C.textDim, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
                                    Nutrition per 100g{analysis?.per100g ? " · prefilled from AI estimate" : ""}
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
                                {foodHistory.length > 0 && (
                                    <TouchableOpacity onPress={() => setMode("choose")} hitSlop={8}>
                                        <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>
                                            ← Back to recent foods
                                        </Text>
                                    </TouchableOpacity>
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
                                    : previewCalories !== null && selection
                                        ? `Log ${grams}g of ${selection.name} · ${previewCalories} cal`
                                        : "Log This"}
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
