import { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, useColorScheme } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import {
    ensureHydrated,
    useSupplementState,
    getState,
    shouldShowToday,
    setOnboarded,
    setTodayAnswer,
    getTodayAnswer,
    type SupplementAnswer,
} from "../lib/supplement-reminder";

export function SupplementReminderModal() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const s = useSupplementState();
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState<"intro" | "checklist">("intro");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await ensureHydrated();
            if (cancelled) return;
            const cur = getState();
            if (shouldShowToday(cur)) {
                setStep(cur.onboarded ? "checklist" : "intro");
                setVisible(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    async function handleGetStarted() {
        await setOnboarded(true);
        setStep("checklist");
    }

    async function handleAnswer(supplement: string, value: SupplementAnswer) {
        await setTodayAnswer(supplement, value);
    }

    function handleDone() {
        setVisible(false);
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleDone}
        >
            <View style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.55)",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
            }}>
                <View style={{
                    width: "100%",
                    maxWidth: 420,
                    maxHeight: "85%",
                    backgroundColor: C.card,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: C.border,
                    overflow: "hidden",
                }}>
                    {step === "intro" ? (
                        <IntroView C={C} onGetStarted={handleGetStarted} />
                    ) : (
                        <ChecklistView
                            C={C}
                            supplements={s.supplements}
                            onAnswer={handleAnswer}
                            onDone={handleDone}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

function IntroView({
    C, onGetStarted,
}: {
    C: (typeof Colors)["dark"];
    onGetStarted: () => void;
}) {
    return (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View style={{
                width: 56, height: 56, borderRadius: 18,
                backgroundColor: C.accentMuted,
                alignItems: "center", justifyContent: "center",
                marginBottom: 18,
            }}>
                <MaterialCommunityIcons name="pill" size={28} color={C.accent} />
            </View>

            <Text style={{
                color: C.text, fontSize: 22, fontWeight: "900",
                letterSpacing: -0.3, marginBottom: 8,
            }}>
                Welcome — let's keep your supplements on track
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 14, lineHeight: 21, marginBottom: 18 }}>
                Each time you open the app, we'll show a quick checklist of the supplements you take daily. A single tap records whether you've taken them — no streaks, no nagging, just a gentle nudge so nothing gets skipped.
            </Text>

            <View style={{
                backgroundColor: C.cardElevated,
                borderRadius: 14,
                padding: 14,
                gap: 10,
                marginBottom: 22,
            }}>
                <IntroBullet C={C} icon="check-circle-outline" text="Defaults to creatine — edit the list anytime." />
                <IntroBullet C={C} icon="plus-circle-outline" text="Add as many supplements as you want from settings." />
                <IntroBullet C={C} icon="calendar-check" text="We'll keep reminding you each session until you confirm yes." />
            </View>

            <TouchableOpacity
                onPress={onGetStarted}
                activeOpacity={0.85}
                style={{
                    backgroundColor: C.accent,
                    paddingVertical: 14,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                }}
            >
                <Text style={{ color: C.background, fontWeight: "800", fontSize: 15 }}>
                    Get Started
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color={C.background} />
            </TouchableOpacity>
        </ScrollView>
    );
}

function IntroBullet({
    C, icon, text,
}: {
    C: (typeof Colors)["dark"];
    icon: string;
    text: string;
}) {
    return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <MaterialCommunityIcons name={icon as "pill"} size={18} color={C.accent} style={{ marginTop: 1 }} />
            <Text style={{ color: C.text, fontSize: 13, lineHeight: 19, flex: 1 }}>
                {text}
            </Text>
        </View>
    );
}

function ChecklistView({
    C, supplements, onAnswer, onDone,
}: {
    C: (typeof Colors)["dark"];
    supplements: string[];
    onAnswer: (supplement: string, value: SupplementAnswer) => void;
    onDone: () => void;
}) {
    if (supplements.length === 0) {
        return (
            <View style={{ padding: 24 }}>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>
                    No supplements configured
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 14, marginBottom: 18 }}>
                    Add one from the supplements settings to get a daily reminder.
                </Text>
                <TouchableOpacity
                    onPress={onDone}
                    activeOpacity={0.85}
                    style={{
                        backgroundColor: C.cardElevated,
                        borderWidth: 1.5, borderColor: C.border,
                        paddingVertical: 14, borderRadius: 14, alignItems: "center",
                    }}
                >
                    <Text style={{ color: C.text, fontWeight: "700", fontSize: 15 }}>Close</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
            <View style={{
                width: 56, height: 56, borderRadius: 18,
                backgroundColor: C.accentMuted,
                alignItems: "center", justifyContent: "center",
                marginBottom: 16,
            }}>
                <MaterialCommunityIcons name="pill" size={28} color={C.accent} />
            </View>

            <Text style={{ color: C.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.3, marginBottom: 6 }}>
                Daily Supplement Check
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
                Mark each supplement as taken or not. We'll remember your answers for today.
            </Text>

            <View style={{ gap: 10, marginBottom: 18 }}>
                {supplements.map((name) => (
                    <SupplementRow
                        key={name}
                        C={C}
                        name={name}
                        onAnswer={(v) => onAnswer(name, v)}
                    />
                ))}
            </View>

            <TouchableOpacity
                onPress={onDone}
                activeOpacity={0.85}
                style={{
                    backgroundColor: C.accent,
                    paddingVertical: 14, borderRadius: 14, alignItems: "center",
                }}
            >
                <Text style={{ color: C.background, fontWeight: "800", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

function SupplementRow({
    C, name, onAnswer,
}: {
    C: (typeof Colors)["dark"];
    name: string;
    onAnswer: (value: SupplementAnswer) => void;
}) {
    const [answer, setAnswer] = useState<SupplementAnswer | null>(getTodayAnswer(name));

    function pick(v: SupplementAnswer) {
        setAnswer(v);
        onAnswer(v);
    }

    return (
        <View style={{
            backgroundColor: C.cardElevated,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: C.border,
            padding: 14,
        }}>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: "700", marginBottom: 10 }}>
                {name}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
                <AnswerButton
                    C={C}
                    label="Yes"
                    icon="check"
                    selected={answer === "yes"}
                    tone="positive"
                    onPress={() => pick("yes")}
                />
                <AnswerButton
                    C={C}
                    label="No"
                    icon="close"
                    selected={answer === "no"}
                    tone="negative"
                    onPress={() => pick("no")}
                />
            </View>
        </View>
    );
}

function AnswerButton({
    C, label, icon, selected, tone, onPress,
}: {
    C: (typeof Colors)["dark"];
    label: string;
    icon: string;
    selected: boolean;
    tone: "positive" | "negative";
    onPress: () => void;
}) {
    const accent = tone === "positive" ? C.success : C.danger;
    const accentMuted = tone === "positive" ? C.successMuted : C.dangerMuted;
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: selected ? accent : C.border,
                backgroundColor: selected ? accentMuted : "transparent",
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
            }}
        >
            <MaterialCommunityIcons
                name={icon as "check"}
                size={16}
                color={selected ? accent : C.textMuted}
            />
            <Text style={{
                color: selected ? accent : C.textMuted,
                fontWeight: "700",
                fontSize: 14,
            }}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

