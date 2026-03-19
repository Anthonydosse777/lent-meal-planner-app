import { useState, useRef, useEffect } from "react";
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    KeyboardAvoidingView, Platform, useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/Colors";
import { sendChatMessage, type Message, type Provider } from "../../lib/api";
import { useStore } from "../../lib/store";

export default function ChatScreen() {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const { config } = useStore();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
    }, [messages, loading]);

    async function handleSend() {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg: Message = { role: "user", content: text };
        const next = [...messages, userMsg];
        setMessages(next);
        setInput("");
        setLoading(true);
        setError(null);

        try {
            const reply = await sendChatMessage(next, config.provider as Provider);
            setMessages([...next, { role: "assistant", content: reply }]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chat failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={0}
            >
                {/* Header */}
                <View style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: 1, borderBottomColor: C.borderFaint,
                }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{
                            width: 34, height: 34, borderRadius: 17,
                            backgroundColor: C.violetMuted,
                            alignItems: "center", justifyContent: "center",
                        }}>
                            <MaterialCommunityIcons name="robot-outline" size={18} color={C.violet} />
                        </View>
                        <View>
                            <Text style={{ color: C.text, fontSize: 15, fontWeight: "800" }}>Chef Assistant</Text>
                            <Text style={{ color: C.textMuted, fontSize: 11 }}>
                                Powered by {config.provider === "openai" ? "GPT-4o" : "Claude"}
                            </Text>
                        </View>
                    </View>
                    {messages.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setMessages([])}
                            activeOpacity={0.7}
                            style={{ padding: 6 }}
                        >
                            <MaterialCommunityIcons name="delete-outline" size={18} color={C.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Messages */}
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
                    showsVerticalScrollIndicator={false}
                    keyboardDismissMode="on-drag"
                >
                    {messages.length === 0 && (
                        <View style={{ alignItems: "center", paddingTop: 60 }}>
                            <MaterialCommunityIcons name="robot-outline" size={52} color={C.textDim} />
                            <Text style={{ color: C.textMuted, fontSize: 15, fontWeight: "700", marginTop: 14 }}>
                                Ask me anything
                            </Text>
                            <Text style={{ color: C.textDim, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 }}>
                                Recipes, nutrition advice, fasting questions — I'm here to help.
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20, justifyContent: "center" }}>
                                {SUGGESTIONS.map((s) => (
                                    <TouchableOpacity
                                        key={s}
                                        onPress={() => setInput(s)}
                                        activeOpacity={0.7}
                                        style={{
                                            backgroundColor: C.card,
                                            borderWidth: 1, borderColor: C.border,
                                            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                                        }}
                                    >
                                        <Text style={{ color: C.textMuted, fontSize: 12 }}>{s}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    {messages.map((m, i) => (
                        <ChatBubble key={i} message={m} C={C} />
                    ))}

                    {loading && (
                        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                            <View style={{
                                width: 30, height: 30, borderRadius: 15,
                                backgroundColor: C.violetMuted,
                                alignItems: "center", justifyContent: "center",
                            }}>
                                <MaterialCommunityIcons name="robot-outline" size={16} color={C.violet} />
                            </View>
                            <View style={{
                                backgroundColor: C.card,
                                borderRadius: 18, borderBottomLeftRadius: 4,
                                paddingHorizontal: 14, paddingVertical: 12,
                            }}>
                                <ThinkingDots C={C} />
                            </View>
                        </View>
                    )}

                    {error && (
                        <View style={{
                            backgroundColor: C.dangerMuted, borderWidth: 1, borderColor: C.danger + "40",
                            borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
                            flexDirection: "row", alignItems: "center", gap: 8,
                        }}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={15} color={C.danger} />
                            <Text style={{ color: C.danger, fontSize: 13, flex: 1 }}>{error}</Text>
                        </View>
                    )}
                </ScrollView>

                {/* Input */}
                <View style={{
                    flexDirection: "row", alignItems: "flex-end", gap: 10,
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderTopWidth: 1, borderTopColor: C.borderFaint,
                    backgroundColor: C.background,
                }}>
                    <TextInput
                        value={input}
                        onChangeText={setInput}
                        placeholder="Ask about fasting, recipes..."
                        placeholderTextColor={C.textDim}
                        multiline
                        maxLength={500}
                        style={{
                            flex: 1,
                            backgroundColor: C.card,
                            borderWidth: 1.5, borderColor: C.border,
                            borderRadius: 20, paddingHorizontal: 16,
                            paddingTop: 12, paddingBottom: 12,
                            color: C.text, fontSize: 14,
                            maxHeight: 120,
                        }}
                        onSubmitEditing={handleSend}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!input.trim() || loading}
                        activeOpacity={0.7}
                        style={{
                            width: 44, height: 44, borderRadius: 22,
                            backgroundColor: input.trim() && !loading ? C.accent : C.cardElevated,
                            alignItems: "center", justifyContent: "center",
                        }}
                    >
                        <MaterialCommunityIcons
                            name="send"
                            size={18}
                            color={input.trim() && !loading ? C.background : C.textDim}
                        />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function ChatBubble({ message, C }: { message: Message; C: (typeof Colors)["dark"] }) {
    const isUser = message.role === "user";
    return (
        <View style={{
            flexDirection: isUser ? "row-reverse" : "row",
            alignItems: "flex-end",
            gap: 8,
        }}>
            {!isUser && (
                <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: C.violetMuted,
                    alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                }}>
                    <MaterialCommunityIcons name="robot-outline" size={16} color={C.violet} />
                </View>
            )}
            <View style={{
                maxWidth: "78%",
                backgroundColor: isUser ? C.accent : C.card,
                borderRadius: 18,
                borderBottomRightRadius: isUser ? 4 : 18,
                borderBottomLeftRadius: isUser ? 18 : 4,
                paddingHorizontal: 14, paddingVertical: 10,
            }}>
                <Text style={{
                    color: isUser ? C.background : C.text,
                    fontSize: 14, lineHeight: 20,
                }}>
                    {message.content}
                </Text>
            </View>
            {isUser && (
                <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: C.successMuted,
                    alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                }}>
                    <MaterialCommunityIcons name="account" size={16} color={C.success} />
                </View>
            )}
        </View>
    );
}

function ThinkingDots({ C }: { C: (typeof Colors)["dark"] }) {
    return (
        <View style={{ flexDirection: "row", gap: 4, paddingVertical: 2 }}>
            {[0, 1, 2].map((i) => (
                <View key={i} style={{
                    width: 6, height: 6, borderRadius: 3,
                    backgroundColor: C.textMuted,
                }} />
            ))}
        </View>
    );
}

const SUGGESTIONS = [
    "How do I cook ful medames?",
    "High protein vegan meals?",
    "What can I eat during Lent?",
    "Coptic fasting rules?",
];
