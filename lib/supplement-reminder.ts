import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { todayDate } from "./storage";

export type SupplementAnswer = "yes" | "no";

export interface SupplementState {
    supplements: string[];
    onboarded: boolean;
    responses: Record<string, Record<string, SupplementAnswer>>;
}

const STORAGE_PREFIX = "supplement-reminder-v2:";
const LEGACY_PREFIX = "supplement-reminder-v1:";

const DEFAULT_STATE: SupplementState = {
    supplements: ["Creatine"],
    onboarded: false,
    responses: {},
};

let currentUserId: string | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let state: SupplementState = cloneDefault();

function cloneDefault(): SupplementState {
    return {
        supplements: [...DEFAULT_STATE.supplements],
        onboarded: false,
        responses: {},
    };
}

function keyFor(userId: string | null): string {
    return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

type Listener = (s: SupplementState) => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((l) => l(state));
}

function parse(raw: string | null): SupplementState | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            supplements: Array.isArray(parsed.supplements)
                ? parsed.supplements.filter((s: unknown) => typeof s === "string" && s.trim().length > 0)
                : [...DEFAULT_STATE.supplements],
            onboarded: Boolean(parsed.onboarded),
            responses: parsed.responses && typeof parsed.responses === "object" ? parsed.responses : {},
        };
    } catch {
        return null;
    }
}

async function persist() {
    try {
        await AsyncStorage.setItem(keyFor(currentUserId), JSON.stringify(state));
    } catch (e) {
        console.warn("[supplement-reminder] persist failed:", e);
    }
}

async function fetchUserId(): Promise<string | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id ?? null;
    } catch {
        return null;
    }
}

async function runHydrate(): Promise<void> {
    const userId = await fetchUserId();
    currentUserId = userId;
    try {
        let raw = await AsyncStorage.getItem(keyFor(userId));
        if (!raw) {
            const legacy = await AsyncStorage.getItem(`${LEGACY_PREFIX}${userId ?? "anon"}`);
            if (legacy) {
                try {
                    const v1 = JSON.parse(legacy);
                    if (v1?.date && v1?.answer) {
                        const migrated: SupplementState = {
                            ...cloneDefault(),
                            onboarded: true,
                            responses: { [v1.date]: { Creatine: v1.answer } },
                        };
                        raw = JSON.stringify(migrated);
                        await AsyncStorage.setItem(keyFor(userId), raw);
                    }
                } catch { /* ignore */ }
            }
        }
        state = parse(raw) ?? cloneDefault();
    } catch (e) {
        console.warn("[supplement-reminder] hydrate failed:", e);
        state = cloneDefault();
    } finally {
        hydrated = true;
        notify();
    }
}

export async function ensureHydrated(): Promise<void> {
    if (hydrated) return;
    if (!hydratePromise) {
        hydratePromise = runHydrate().finally(() => { hydratePromise = null; });
    }
    return hydratePromise;
}

export async function hydrate(): Promise<SupplementState> {
    await ensureHydrated();
    return state;
}

// Re-hydrate whenever the active Supabase user changes so cached state from a
// previous user can't leak into a new session.
let authListenerInstalled = false;
function installAuthListener() {
    if (authListenerInstalled) return;
    authListenerInstalled = true;
    try {
        supabase.auth.onAuthStateChange((_event, session) => {
            const userId = session?.user?.id ?? null;
            if (userId === currentUserId) return;
            hydrated = false;
            hydratePromise = null;
            ensureHydrated().catch(() => {});
        });
    } catch (e) {
        console.warn("[supplement-reminder] auth listener install failed:", e);
    }
}
installAuthListener();

export function getState(): SupplementState {
    return state;
}

export function isHydrated(): boolean {
    return hydrated;
}

export function shouldShowToday(s: SupplementState = state): boolean {
    // Shows once at sign-up (until onboarded).
    if (!s.onboarded) return true;
    if (s.supplements.length === 0) return false;
    const todayAnswers = s.responses[todayDate()] ?? {};
    // After onboarding it appears each morning, but as soon as the user has
    // confirmed "yes" today it stays hidden until the next day.
    const confirmedToday = s.supplements.some((name) => todayAnswers[name] === "yes");
    return !confirmedToday;
}

export async function setOnboarded(onboarded: boolean) {
    await ensureHydrated();
    state = { ...state, onboarded };
    notify();
    await persist();
}

export async function setTodayAnswer(supplement: string, answer: SupplementAnswer) {
    await ensureHydrated();
    const date = todayDate();
    const day = { ...(state.responses[date] ?? {}), [supplement]: answer };
    state = { ...state, responses: { ...state.responses, [date]: day } };
    notify();
    await persist();
}

export function getTodayAnswer(supplement: string): SupplementAnswer | null {
    return state.responses[todayDate()]?.[supplement] ?? null;
}

export async function addSupplement(name: string): Promise<boolean> {
    await ensureHydrated();
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (state.supplements.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return false;
    state = { ...state, supplements: [...state.supplements, trimmed] };
    notify();
    await persist();
    return true;
}

export async function removeSupplement(name: string) {
    await ensureHydrated();
    state = {
        ...state,
        supplements: state.supplements.filter((s) => s !== name),
    };
    notify();
    await persist();
}

export async function renameSupplement(oldName: string, newName: string): Promise<boolean> {
    await ensureHydrated();
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return false;
    if (state.supplements.some((s) => s.toLowerCase() === trimmed.toLowerCase() && s !== oldName)) return false;
    state = {
        ...state,
        supplements: state.supplements.map((s) => (s === oldName ? trimmed : s)),
    };
    notify();
    await persist();
    return true;
}

export function useSupplementState(): SupplementState {
    const [snapshot, setSnapshot] = useState(state);
    useEffect(() => {
        const listener: Listener = (s) => setSnapshot(s);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);
    return snapshot;
}
