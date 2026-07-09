import { useEffect, useRef, useState } from "react";
import {
    View, Text, TouchableOpacity, Modal, Platform, useColorScheme, ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
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

// Restricting formats massively speeds up decoding. These cover ~all retail food
// products (UPC/EAN) plus Code 128 for the occasional store-printed label.
const PRODUCT_FORMATS = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
];

function buildHints(): Map<DecodeHintType, any> {
    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return hints;
}

export function BarcodeScanner({ visible, onClose, onScan }: BarcodeScannerProps) {
    const scheme = useColorScheme() ?? "dark";
    const C = Colors[scheme];
    const videoRef = useRef<any>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const firedRef = useRef(false);

    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(true);

    useEffect(() => {
        if (!visible || Platform.OS !== "web") return;

        let cancelled = false;
        firedRef.current = false;
        setError(null);
        setStarting(true);

        (async () => {
            try {
                const reader = new BrowserMultiFormatReader(buildHints(), {
                    // Default is 500ms — way too slow for handheld scanning.
                    delayBetweenScanAttempts: 80,
                    delayBetweenScanSuccess: 300,
                });

                // Higher resolution dramatically improves decode rate at typical
                // arm's-length distances. Browser will downscale if unsupported.
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 },
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

                const controls = await reader.decodeFromVideoElement(video, (result, err, ctrls) => {
                    if (cancelled || firedRef.current) return;
                    if (result) {
                        const text = result.getText();
                        if (text) {
                            firedRef.current = true;
                            try { ctrls.stop(); } catch { /* noop */ }
                            onScan(text);
                        }
                    }
                });
                controlsRef.current = controls;
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
                controlsRef.current?.stop();
            } catch { /* noop */ }
            controlsRef.current = null;
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
                            Hold the barcode steady inside the frame, ~15 cm away. It scans automatically.
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}
