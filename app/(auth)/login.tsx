import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    useColorScheme,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
    const scheme = useColorScheme() ?? 'dark';
    const C = Colors[scheme];

    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');

    // Focus states for premium input styling
    const [focusedField, setFocusedField] = useState<string | null>(null);

    // Animations
    const fadeIn = useRef(new Animated.Value(0)).current;
    const slideUp = useRef(new Animated.Value(40)).current;
    const logoScale = useRef(new Animated.Value(0.3)).current;
    const logoRotate = useRef(new Animated.Value(0)).current;
    const formOpacity = useRef(new Animated.Value(0)).current;
    const formSlide = useRef(new Animated.Value(30)).current;
    const glowPulse = useRef(new Animated.Value(0)).current;
    const modeSlide = useRef(new Animated.Value(0)).current;

    // Floating orbs animation
    const orb1 = useRef(new Animated.Value(0)).current;
    const orb2 = useRef(new Animated.Value(0)).current;
    const orb3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance sequence
        Animated.sequence([
            // Logo entrance
            Animated.parallel([
                Animated.spring(logoScale, {
                    toValue: 1,
                    tension: 60,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.timing(logoRotate, {
                    toValue: 1,
                    duration: 800,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
                Animated.timing(fadeIn, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(slideUp, {
                    toValue: 0,
                    duration: 600,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
            // Form entrance
            Animated.parallel([
                Animated.timing(formOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(formSlide, {
                    toValue: 0,
                    duration: 500,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        ]).start();

        // Continuous glow pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowPulse, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(glowPulse, {
                    toValue: 0,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]),
        ).start();

        // Floating orbs
        const animateOrb = (orb: Animated.Value, duration: number) => {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(orb, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(orb, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ]),
            ).start();
        };
        animateOrb(orb1, 4000);
        animateOrb(orb2, 5500);
        animateOrb(orb3, 3500);
    }, []);

    // Animate mode switch
    useEffect(() => {
        Animated.spring(modeSlide, {
            toValue: mode === 'login' ? 0 : 1,
            tension: 80,
            friction: 12,
            useNativeDriver: true,
        }).start();
    }, [mode]);

    const spin = logoRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['-30deg', '0deg'],
    });

    const glowOpacity = glowPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
    });

    const nameHeight = modeSlide.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });

    async function handleSubmit() {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing Fields', 'Please enter your email and password.');
            return;
        }

        if (mode === 'signup' && !name.trim()) {
            Alert.alert('Missing Name', 'Please enter your name.');
            return;
        }

        setLoading(true);
        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) Alert.alert('Login Failed', error.message);
            } else {
                const { error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { data: { full_name: name.trim() } },
                });
                if (error) Alert.alert('Sign Up Failed', error.message);
                else setVerifyEmail(true);
            }
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Something went wrong.');
        }
        setLoading(false);
    }

    async function handleVerifyCode() {
        if (!verificationCode.trim()) {
            Alert.alert('Missing Code', 'Please enter the 6-digit code from your email.');
            return;
        }
        setLoading(true);
        try {
            const trimmedEmail = email.trim();
            const trimmedToken = verificationCode.trim();
            console.log('[verify] attempt 1: type=email');
            let { data, error: verifyError } = await supabase.auth.verifyOtp({
                email: trimmedEmail,
                token: trimmedToken,
                type: 'email',
            });
            console.log('[verify] attempt 1 result', { data, verifyError });
            if (verifyError || !data.session) {
                console.log('[verify] attempt 2: type=signup');
                const result = await supabase.auth.verifyOtp({
                    email: trimmedEmail,
                    token: trimmedToken,
                    type: 'signup',
                });
                data = result.data;
                verifyError = result.error;
                console.log('[verify] attempt 2 result', { data, verifyError });
            }
            if (verifyError) {
                Alert.alert('Verification Failed', verifyError.message);
            } else if (!data.session) {
                Alert.alert('Verification Failed', 'No session returned. Check console for details.');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Something went wrong.');
        }
        setLoading(false);
    }

    async function handleResendCode() {
        setLoading(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email.trim(),
            });
            if (error) Alert.alert('Resend Failed', error.message);
            else Alert.alert('Code Sent', 'A new confirmation code has been sent to your email.');
        } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Something went wrong.');
        }
        setLoading(false);
    }

    function toggleMode() {
        setMode(mode === 'login' ? 'signup' : 'login');
        setVerifyEmail(false);
        setVerificationCode('');
    }

    const inputStyle = (field: string) => ({
        backgroundColor: focusedField === field ? C.cardElevated : C.card,
        borderWidth: 1.5,
        borderColor: focusedField === field ? C.accent : C.border,
        borderRadius: 16,
        padding: 16,
        paddingRight: field === 'password' ? 52 : 16,
        color: C.text,
        fontSize: 16,
        letterSpacing: 0.3,
    });

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            {/* Floating accent orbs */}
            <Animated.View
                style={{
                    position: 'absolute',
                    top: height * 0.08,
                    right: -40,
                    width: 160,
                    height: 160,
                    borderRadius: 80,
                    backgroundColor: C.accent,
                    opacity: glowOpacity,
                    transform: [
                        { translateY: orb1.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
                        { scale: orb1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
                    ],
                }}
            />
            <Animated.View
                style={{
                    position: 'absolute',
                    bottom: height * 0.15,
                    left: -60,
                    width: 200,
                    height: 200,
                    borderRadius: 100,
                    backgroundColor: C.accent,
                    opacity: Animated.multiply(glowOpacity, 0.5),
                    transform: [
                        { translateY: orb2.interpolate({ inputRange: [0, 1], outputRange: [0, 25] }) },
                        { scale: orb2.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) },
                    ],
                }}
            />
            <Animated.View
                style={{
                    position: 'absolute',
                    top: height * 0.35,
                    left: width * 0.6,
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    backgroundColor: C.violet ?? C.accent,
                    opacity: Animated.multiply(glowOpacity, 0.3),
                    transform: [
                        { translateX: orb3.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                    ],
                }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center' }}>
                    {/* Logo & branding */}
                    <Animated.View
                        style={{
                            alignItems: 'center',
                            marginBottom: 44,
                            opacity: fadeIn,
                            transform: [{ translateY: slideUp }],
                        }}
                    >
                        {/* Glow behind icon */}
                        <Animated.View
                            style={{
                                position: 'absolute',
                                top: -10,
                                width: 100,
                                height: 100,
                                borderRadius: 50,
                                backgroundColor: C.accent,
                                opacity: Animated.multiply(glowOpacity, 0.25),
                            }}
                        />
                        <Animated.View
                            style={{
                                transform: [
                                    { scale: logoScale },
                                    { rotate: spin },
                                ],
                            }}
                        >
                            <View
                                style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: 24,
                                    backgroundColor: C.accentMuted,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: 1,
                                    borderColor: C.accent + '40',
                                }}
                            >
                                <MaterialCommunityIcons name="leaf" size={44} color={C.accent} />
                            </View>
                        </Animated.View>
                        <Text
                            style={{
                                color: C.text,
                                fontSize: 30,
                                fontWeight: '900',
                                marginTop: 20,
                                letterSpacing: -0.5,
                            }}
                        >
                            Lent Planner
                        </Text>
                        <Text
                            style={{
                                color: C.textMuted,
                                fontSize: 15,
                                marginTop: 8,
                                letterSpacing: 0.2,
                            }}
                        >
                            {mode === 'login' ? 'Welcome back' : 'Create your account'}
                        </Text>
                    </Animated.View>

                    {/* Form */}
                    <Animated.View
                        style={{
                            opacity: formOpacity,
                            transform: [{ translateY: formSlide }],
                        }}
                    >
                        {verifyEmail ? (
                            /* ── OTP Verification Screen ── */
                            <View>
                                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                                    <View
                                        style={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: 20,
                                            backgroundColor: C.accentMuted,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginBottom: 16,
                                            borderWidth: 1,
                                            borderColor: C.accent + '40',
                                        }}
                                    >
                                        <MaterialCommunityIcons name="email-check-outline" size={32} color={C.accent} />
                                    </View>
                                    <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
                                        Check your email
                                    </Text>
                                    <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                                        We sent a 6-digit verification code to{'\n'}
                                        <Text style={{ color: C.accent, fontWeight: '600' }}>{email.trim()}</Text>
                                    </Text>
                                </View>

                                <View style={{ gap: 14 }}>
                                    <View style={{ position: 'relative' }}>
                                        <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}>
                                            <MaterialCommunityIcons name="shield-key-outline" size={20} color={focusedField === 'code' ? C.accent : C.textDim} />
                                        </View>
                                        <TextInput
                                            value={verificationCode}
                                            onChangeText={setVerificationCode}
                                            placeholder="Enter 6-digit code"
                                            placeholderTextColor={C.textDim}
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            autoFocus
                                            onFocus={() => setFocusedField('code')}
                                            onBlur={() => setFocusedField(null)}
                                            style={{
                                                ...inputStyle('code'),
                                                paddingLeft: 44,
                                                fontSize: 22,
                                                letterSpacing: 8,
                                                textAlign: 'center',
                                            }}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        onPress={handleVerifyCode}
                                        disabled={loading}
                                        activeOpacity={0.85}
                                        style={{
                                            backgroundColor: C.accent,
                                            padding: 17,
                                            borderRadius: 16,
                                            alignItems: 'center',
                                            marginTop: 6,
                                            shadowColor: C.accent,
                                            shadowOffset: { width: 0, height: 4 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 12,
                                            elevation: 6,
                                        }}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color={C.background} />
                                        ) : (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text style={{ color: C.background, fontWeight: '800', fontSize: 16, letterSpacing: 0.3 }}>
                                                    Verify Email
                                                </Text>
                                                <MaterialCommunityIcons name="check-circle-outline" size={18} color={C.background} />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    onPress={handleResendCode}
                                    disabled={loading}
                                    style={{ marginTop: 20, alignItems: 'center' }}
                                >
                                    <Text style={{ color: C.textMuted, fontSize: 14 }}>
                                        Didn't get the code?{' '}
                                        <Text style={{ color: C.accent, fontWeight: '700' }}>Resend</Text>
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => { setVerifyEmail(false); setVerificationCode(''); }}
                                    style={{ marginTop: 12, alignItems: 'center' }}
                                >
                                    <Text style={{ color: C.textMuted, fontSize: 14 }}>
                                        <Text style={{ color: C.accent, fontWeight: '700' }}>Back to Sign Up</Text>
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            /* ── Login / Signup Form ── */
                            <View>
                                {/* Mode toggle pills */}
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        backgroundColor: C.card,
                                        borderRadius: 14,
                                        padding: 4,
                                        marginBottom: 24,
                                        borderWidth: 1,
                                        borderColor: C.borderFaint,
                                    }}
                                >
                                    <TouchableOpacity
                                        onPress={() => setMode('login')}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 11,
                                            alignItems: 'center',
                                            backgroundColor: mode === 'login' ? C.accent : 'transparent',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontWeight: '700',
                                                fontSize: 14,
                                                color: mode === 'login' ? C.background : C.textMuted,
                                            }}
                                        >
                                            Sign In
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setMode('signup')}
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 11,
                                            alignItems: 'center',
                                            backgroundColor: mode === 'signup' ? C.accent : 'transparent',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontWeight: '700',
                                                fontSize: 14,
                                                color: mode === 'signup' ? C.background : C.textMuted,
                                            }}
                                        >
                                            Sign Up
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ gap: 14 }}>
                                    {/* Name field — only in signup mode */}
                                    {mode === 'signup' && (
                                        <Animated.View style={{ opacity: nameHeight }}>
                                            <View style={{ position: 'relative' }}>
                                                <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}>
                                                    <MaterialCommunityIcons name="account-outline" size={20} color={focusedField === 'name' ? C.accent : C.textDim} />
                                                </View>
                                                <TextInput
                                                    value={name}
                                                    onChangeText={setName}
                                                    placeholder="Full Name"
                                                    placeholderTextColor={C.textDim}
                                                    autoCapitalize="words"
                                                    onFocus={() => setFocusedField('name')}
                                                    onBlur={() => setFocusedField(null)}
                                                    style={{
                                                        ...inputStyle('name'),
                                                        paddingLeft: 44,
                                                    }}
                                                />
                                            </View>
                                        </Animated.View>
                                    )}

                                    {/* Email */}
                                    <View style={{ position: 'relative' }}>
                                        <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}>
                                            <MaterialCommunityIcons name="email-outline" size={20} color={focusedField === 'email' ? C.accent : C.textDim} />
                                        </View>
                                        <TextInput
                                            value={email}
                                            onChangeText={setEmail}
                                            placeholder="Email"
                                            placeholderTextColor={C.textDim}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                            onFocus={() => setFocusedField('email')}
                                            onBlur={() => setFocusedField(null)}
                                            style={{
                                                ...inputStyle('email'),
                                                paddingLeft: 44,
                                            }}
                                        />
                                    </View>

                                    {/* Password */}
                                    <View style={{ position: 'relative' }}>
                                        <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}>
                                            <MaterialCommunityIcons name="lock-outline" size={20} color={focusedField === 'password' ? C.accent : C.textDim} />
                                        </View>
                                        <TextInput
                                            value={password}
                                            onChangeText={setPassword}
                                            placeholder="Password"
                                            placeholderTextColor={C.textDim}
                                            secureTextEntry={!showPassword}
                                            onFocus={() => setFocusedField('password')}
                                            onBlur={() => setFocusedField(null)}
                                            style={{
                                                ...inputStyle('password'),
                                                paddingLeft: 44,
                                            }}
                                        />
                                        <TouchableOpacity
                                            onPress={() => setShowPassword(!showPassword)}
                                            style={{ position: 'absolute', right: 16, top: 16, zIndex: 1 }}
                                        >
                                            <MaterialCommunityIcons
                                                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                                size={20}
                                                color={C.textDim}
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Submit button */}
                                    <TouchableOpacity
                                        onPress={handleSubmit}
                                        disabled={loading}
                                        activeOpacity={0.85}
                                        style={{
                                            backgroundColor: C.accent,
                                            padding: 17,
                                            borderRadius: 16,
                                            alignItems: 'center',
                                            marginTop: 6,
                                            shadowColor: C.accent,
                                            shadowOffset: { width: 0, height: 4 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 12,
                                            elevation: 6,
                                        }}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color={C.background} />
                                        ) : (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text
                                                    style={{
                                                        color: C.background,
                                                        fontWeight: '800',
                                                        fontSize: 16,
                                                        letterSpacing: 0.3,
                                                    }}
                                                >
                                                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                                                </Text>
                                                <MaterialCommunityIcons
                                                    name="arrow-right"
                                                    size={18}
                                                    color={C.background}
                                                />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                {/* Bottom toggle text */}
                                <TouchableOpacity
                                    onPress={toggleMode}
                                    style={{ marginTop: 24, alignItems: 'center' }}
                                >
                                    <Text style={{ color: C.textMuted, fontSize: 14 }}>
                                        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                                        <Text style={{ color: C.accent, fontWeight: '700' }}>
                                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                                        </Text>
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </Animated.View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
