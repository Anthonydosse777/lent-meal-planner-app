import { useEffect, useRef, useState } from "react";
import {
    View, Text, TouchableOpacity, Modal, Platform, useColorScheme, ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Colors } from "../constants/Colors";

interface BarcodeScannerProps {
    visible: boolean;
    onClose: () => void;
    onScan: (barcode: string) => void;
}

// Runtime check so we can hide the entry point on devices without a camera.
export function isBarcodeScannerAvailable(): boolean {
    if (Platform.OS !== "web") return false;
    if (typeof navigator === "undefined") return false;
    return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
}

export function BarcodeScanner({ visible, onClose, onScan }: BarcodeScannerProps) {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const videoRef = useRef<any>(null);
    const readerRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(true);

    useEffect(() => {
        if (!visible || Platform.OS !== "web") return;

        let cancelled = false;
        setError(null);
        setStarting(true);

        (async () => {
            try {
                const reader = new BrowserMultiFormatReader();
                readerRef.current = reader;

                // Prefer the rear camera on phones.
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
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

                await reader.decodeFromVideoElement(video, (result) => {
                    if (cancelled) return;
                    if (result) {
                        const text = result.getText();
                        if (text) onScan(text);
                    }
                });
            } catch (e: any) {
                if (cancelled) return;
                const msg =
                    e?.name === "NotAllowedError"
                        ? "Camera permission denied. Allow access in your browser settings."
                        : e?.name === "NotFoundError"
                            ? "No camera found on this device."
                            : e?.message ?? "Failed to start camera.";
                setError(msg);
                setStarting(false);
            }
        })();

        return () => {
            cancelled = true;
            try {
                readerRef.current?.reset?.();
            } catch { /* noop */ }
            readerRef.current = null;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
        };
    }, [visible, onScan]);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
            <View style={{ flex: 1, backgroundColor: "#000" }}>
                {/* Header */}
                <View style={{
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                    paddingHorizontal: 20, paddingTop: Platform.OS === "ios" ? 56 : 20, paddingBottom: 16,
                    backgroundColor: "rgba(0,0,0,0.6)",
                }}>
                    <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
                        Scan Barcode
                    </Text>
                    <TouchableOpacity onPress={onClose} hitSlop={12}>
                        <MaterialCommunityIcons name="close" size={26} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Camera area */}
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    {Platform.OS === "web" ? (
                        <View style={{ width: "100%", height: "100%", position: "relative" }}>
                            <video
                                ref={videoRef}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    backgroundColor: "#000",
                                }}
                                muted
                                autoPlay
                                playsInline
                            />
                            {/* Targeting frame */}
                            <View pointerEvents="none" style={{
                                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                justifyContent: "center", alignItems: "center",
                            }}>
                                <View style={{
                                    width: "75%", aspectRatio: 1.6,
                                    borderWidth: 2, borderColor: C.accent, borderRadius: 16,
                                    shadowColor: C.accent, shadowOpacity: 0.8, shadowRadius: 12,
                                }} />
                            </View>
                            {starting && !error && (
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
                            Barcode scanning from the camera is currently available on web only.
                        </Text>
                    )}
                </View>

                {/* Footer / status */}
                <View style={{
                    padding: 20, backgroundColor: "rgba(0,0,0,0.7)",
                }}>
                    {error ? (
                        <Text style={{ color: "#fca5a5", fontSize: 13, textAlign: "center" }}>
                            {error}
                        </Text>
                    ) : (
                        <Text style={{ color: "#d1d5db", fontSize: 12, textAlign: "center" }}>
                            Point the rear camera at the product barcode. It will scan automatically.
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}
