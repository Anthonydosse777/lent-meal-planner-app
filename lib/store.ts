/**
 * Simple module-level reactive store for sharing state across tabs
 * without requiring a full state management library.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import type { Track } from "./meal-data";
import type { AiMeal, Provider } from "./api";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export interface PlannerConfig {
    protein: number;
    // length 7, indexed by Date.getDay() — 0=Sun..6=Sat
    weeklyCalories: number[];
    strictness: Track;
    mealsPerDay: number;
    mode: "single" | "daily";
    provider: Provider;
}

export type AnyMeal = AiMeal | (import("./meal-data").Meal & { isAiGenerated?: false });

interface StoreState {
    config: PlannerConfig;
    meals: AnyMeal[];
    loadingSlots: boolean[];
    error: string | null;
}

const DEFAULT_CONFIG: PlannerConfig = {
    protein: 100,
    weeklyCalories: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
    strictness: "straight_vegan",
    mealsPerDay: 3,
    mode: "single",
    provider: "openai",
};

const LEGACY_STORAGE_KEY = "planner-config-v1";
const USER_STORAGE_PREFIX = "planner-config-v1:";
const ANON_STORAGE_KEY = "planner-config-v1:anon";

function storageKeyFor(userId: string | null): string {
    return userId ? `${USER_STORAGE_PREFIX}${userId}` : ANON_STORAGE_KEY;
}

// Tracks which user's config is currently loaded/saved. Null = anonymous/not
// yet hydrated. Until `hydrated` flips to true we must NOT persist, otherwise
// the initial defaults would clobber whatever's in AsyncStorage.
let currentUserId: string | null = null;
let hydrated = false;

let state: StoreState = {
    config: { ...DEFAULT_CONFIG, weeklyCalories: [...DEFAULT_CONFIG.weeklyCalories] },
    meals: [],
    loadingSlots: [],
    error: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((l) => l());
}

function parseConfig(raw: string | null): PlannerConfig | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            weeklyCalories:
                Array.isArray(parsed.weeklyCalories) && parsed.weeklyCalories.length === 7
                    ? parsed.weeklyCalories.map((v: any) => {
                        const n = Number(v);
                        return Number.isFinite(n) && n > 0 ? n : 2000;
                    })
                    : [...DEFAULT_CONFIG.weeklyCalories],
        };
    } catch {
        return null;
    }
}

async function fetchRemoteConfig(): Promise<PlannerConfig | null> {
    try {
        const { data } = await supabase.auth.getUser();
        const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const remote = meta.plannerConfig;
        if (remote && typeof remote === "object") {
            return parseConfig(JSON.stringify(remote));
        }
    } catch {
        // network / auth failure — fall back to local cache
    }
    return null;
}

let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRemoteSave(userId: string | null, config: PlannerConfig) {
    if (!userId) return;
    if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
    // Debounce to avoid hammering Supabase on every keystroke.
    remoteSaveTimer = setTimeout(() => {
        supabase.auth.updateUser({ data: { plannerConfig: config } }).catch(() => {});
    }, 800);
}

export async function hydrateForUser(userId: string | null): Promise<void> {
    currentUserId = userId;
    hydrated = false;
    const key = storageKeyFor(userId);
    try {
        let saved = await AsyncStorage.getItem(key);
        // One-time migration: if this user has no config yet but there's data
        // at the pre-per-user key, inherit it so existing installs don't reset.
        if (!saved) {
            const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
                await AsyncStorage.setItem(key, legacy);
                saved = legacy;
            }
        }
        const localLoaded = parseConfig(saved);

        // When logged in, treat Supabase user_metadata as the source of truth
        // so settings sync across devices. Local AsyncStorage is only a cache.
        let resolved: PlannerConfig | null = null;
        if (userId) {
            const remote = await fetchRemoteConfig();
            if (remote) {
                resolved = remote;
                // Refresh the local cache so next cold start is fast/offline.
                AsyncStorage.setItem(key, JSON.stringify(remote)).catch(() => {});
            } else if (localLoaded) {
                // First time on this account — push local settings up so other
                // devices pick them up going forward.
                resolved = localLoaded;
                supabase.auth.updateUser({ data: { plannerConfig: localLoaded } }).catch(() => {});
            }
        } else {
            resolved = localLoaded;
        }

        if (resolved) {
            state = { ...state, config: resolved };
        } else {
            state = {
                ...state,
                config: { ...DEFAULT_CONFIG, weeklyCalories: [...DEFAULT_CONFIG.weeklyCalories] },
            };
        }
    } catch {
        // ignore corrupt storage
    } finally {
        hydrated = true;
        notify();
    }
}

// Kick off a best-effort anonymous hydrate on module init so the app still
// shows something sensible before the auth layer reports a user.
hydrateForUser(null).catch(() => {});

function persistConfig(config: PlannerConfig) {
    if (!hydrated) return;
    // Always write to local cache for instant reads on next launch.
    AsyncStorage.setItem(storageKeyFor(currentUserId), JSON.stringify(config)).catch(() => {});
    // Also sync to Supabase so other devices on the same account see the change.
    scheduleRemoteSave(currentUserId, config);
}

export function isHydrated(): boolean {
    return hydrated;
}

export function getState(): StoreState {
    return state;
}

export function setState(patch: Partial<StoreState>) {
    state = { ...state, ...patch };
    notify();
}

export function setConfig(patch: Partial<PlannerConfig>) {
    // Drop writes that happen before the current user's config has loaded —
    // otherwise a default-value render could overwrite the saved values.
    if (!hydrated) return;
    state = { ...state, config: { ...state.config, ...patch } };
    notify();
    persistConfig(state.config);
}

export function setWeeklyCalorieDay(dayIndex: number, value: number) {
    if (dayIndex < 0 || dayIndex > 6) return;
    if (!hydrated) return;
    const next = [...state.config.weeklyCalories];
    next[dayIndex] = value;
    setConfig({ weeklyCalories: next });
}

export function setAllWeeklyCalories(value: number) {
    setConfig({ weeklyCalories: Array(7).fill(value) });
}

export function getDayCalorieGoal(config: PlannerConfig, dateStr?: string): number {
    const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    return config.weeklyCalories[d.getDay()] ?? 0;
}

export function getWeeklyCalorieTotal(config: PlannerConfig): number {
    return config.weeklyCalories.reduce((a, b) => a + b, 0);
}

export function useStore(): StoreState {
    const [, rerender] = useState(0);
    useEffect(() => {
        const listener = () => rerender((n) => n + 1);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);
    return state;
}
