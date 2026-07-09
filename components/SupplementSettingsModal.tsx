import { useEffect, useState } from "react";
import {
    Modal, View, Text, TextInput, TouchableOpacity,
    ScrollView, useColorScheme, Platform, Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import {
    ensureHydrated,
    useSupplementState,
    addSupplement,
    removeSupplement,
    renameSupplement,
    setTodayAnswer,
    getTodayAnswer,
    type SupplementAnswer,
} from "../lib/supplement-reminder";

export function SupplementSettingsModal({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const s = useSupplementState();
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    useEffect(() => {
        if (visible) ensureHydrated().catch(() => {});
    }, [visible]);

    async function handleAdd() {
        const ok = await addSupplement(draft);
        if (!ok) {
            setError(draft.trim() ? "Already in your list" : "Enter a name");
            return;
        }
        setDraft("");
        setError(null);
    }

    function confirmRemove(name: string) {
        const onConfirm = () => removeSupplement(name);
        if (Platform.OS === "web") {
            if (window.confirm(`Remove ${name} from your reminder list?`)) onConfirm();
        } else {
            Alert.alert("Remove supplement", `Remove ${name} from your reminder list?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: onConfirm },
            ]);
        }
    }

    async function commitRename(oldName: string) {
        const ok = await renameSupplement(oldName, editValue);
        if (!ok && editValue.trim() && editValue.trim() !== oldName) {
            setError("Already in your list");
            return;
        }
        setEditing(null);
        setEditValue("");
        setError(null);
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.55)",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
            }}>
                <View style={{
                    width: "100%",
                    maxWidth: 460,
                    maxHeight: "85%",
                    backgroundColor: C.card,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: C.border,
                    overflow: "hidden",
                }}>
                    <View style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14,
                    }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={{
                                width: 36, height: 36, borderRadius: 12,
                                backgroundColor: C.accentMuted,
                                alignItems: "center", justifyContent: "center",
                            }}>
                                <MaterialCommunityIcons name="pill" size={18} color={C.accent} />
                            </View>
                            <Text style={{ color: C.text, fontSize: 17, fontWeight: "800" }}>
                                Supplement Reminders
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={8}>
                            <MaterialCommunityIcons name="close" size={22} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                        <Text style={{ color: C.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
                            These supplements appear in your daily check-in. Add the ones you take, rename them, or remove any you no longer need.
                        </Text>

                        <Text style={{
                            color: C.textMuted, fontSize: 11, fontWeight: "700",
                            letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
                        }}>
                            Your list
                        </Text>

                        {s.supplements.length === 0 ? (
                            <View style={{
                                backgroundColor: C.cardElevated,
                                borderRadius: 12, padding: 14, marginBottom: 18,
                                borderWidth: 1, borderColor: C.border,
                            }}>
                                <Text style={{ color: C.textMuted, fontSize: 13 }}>
                                    No supplements yet. Add one below to start getting daily reminders.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 8, marginBottom: 18 }}>
                                {s.supplements.map((name) => {
                                    const isEditing = editing === name;
                                    return (
                                        <View
                                            key={name}
                                            style={{
                                                backgroundColor: C.cardElevated,
                                                borderRadius: 12,
                                                borderWidth: 1,
                                                borderColor: C.border,
                                                padding: 12,
                                                flexDirection: "row",
                                                alignItems: "center",
                                                gap: 10,
                                            }}
                                        >
                                            {isEditing ? (
                                                <TextInput
                                                    value={editValue}
                                                    onChangeText={setEditValue}
                                                    onBlur={() => commitRename(name)}
                                                    onSubmitEditing={() => commitRename(name)}
                                                    autoFocus
                                                    style={{
                                                        flex: 1,
                                                        color: C.text,
                                                        fontSize: 14,
                                                        fontWeight: "700",
                                                        padding: 0,
                                                    }}
                                                    placeholderTextColor={C.textDim}
                                                />
                                            ) : (
                                                <View style={{ flex: 1, gap: 6 }}>
                                                    <TouchableOpacity
                                                        onPress={() => { setEditing(name); setEditValue(name); }}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
                                                            {name}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TodayStatusToggle C={C} name={name} />
                                                </View>
                                            )}
                                            <TouchableOpacity
                                                onPress={() => { setEditing(name); setEditValue(name); }}
                                                hitSlop={6}
                                            >
                                                <MaterialCommunityIcons
                                                    name="pencil-outline"
                                                    size={18}
                                                    color={C.textMuted}
                                                />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => confirmRemove(name)} hitSlop={6}>
                                                <MaterialCommunityIcons
                                                    name="trash-can-outline"
                                                    size={18}
                                                    color={C.danger}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        <Text style={{
                            color: C.textMuted, fontSize: 11, fontWeight: "700",
                            letterSpacing: 1, textTransform: "uppercase", marginBottom: 8,
                        }}>
                            Add a supplement
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <TextInput
                                value={draft}
                                onChangeText={(t) => { setDraft(t); if (error) setError(null); }}
                                onSubmitEditing={handleAdd}
                                placeholder="e.g. Vitamin D"
                                placeholderTextColor={C.textDim}
                                style={{
                                    flex: 1,
                                    backgroundColor: C.cardElevated,
                                    borderWidth: 1.5,
                                    borderColor: error ? C.danger : C.border,
                                    borderRadius: 12,
                                    paddingHorizontal: 14,
                                    paddingVertical: Platform.OS === "ios" ? 12 : 10,
                                    color: C.text,
                                    fontSize: 14,
                                    fontWeight: "600",
                                }}
                            />
                            <TouchableOpacity
                                onPress={handleAdd}
                                activeOpacity={0.85}
                                style={{
                                    backgroundColor: C.accent,
                                    borderRadius: 12,
                                    paddingHorizontal: 16,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexDirection: "row",
                                    gap: 4,
                                }}
                            >
                                <MaterialCommunityIcons name="plus" size={18} color={C.background} />
                                <Text style={{ color: C.background, fontWeight: "800", fontSize: 14 }}>
                                    Add
                                </Text>
                            </TouchableOpacity>
                        </View>
                        {error && (
                            <Text style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>
                                {error}
                            </Text>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function TodayStatusToggle({
    C, name,
}: {
    C: (typeof Colors)["dark"];
    name: string;
}) {
    const answer = getTodayAnswer(name);

    function pick(value: SupplementAnswer) {
        setTodayAnswer(name, value).catch(() => {});
    }

    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{
                color: C.textDim,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                marginRight: 2,
            }}>
                Today
            </Text>
            <StatusChip C={C} label="Yes" tone="positive" selected={answer === "yes"} onPress={() => pick("yes")} />
            <StatusChip C={C} label="No" tone="negative" selected={answer === "no"} onPress={() => pick("no")} />
        </View>
    );
}

function StatusChip({
    C, label, tone, selected, onPress,
}: {
    C: (typeof Colors)["dark"];
    label: string;
    tone: "positive" | "negative";
    selected: boolean;
    onPress: () => void;
}) {
    const accent = tone === "positive" ? C.success : C.danger;
    const accentMuted = tone === "positive" ? C.successMuted : C.dangerMuted;
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            hitSlop={4}
            style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? accent : C.border,
                backgroundColor: selected ? accentMuted : "transparent",
            }}
        >
            <Text style={{
                color: selected ? accent : C.textMuted,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.3,
            }}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}
