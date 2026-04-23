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
        const { data, error } = await supabase.auth.getUser();
        if (error) {
            console.warn("[store] getUser failed:", error.message);
            return null;
        }
        const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const remote = meta.plannerConfig;
        if (remote && typeof remote === "object") {
            return parseConfig(JSON.stringify(remote));
        }
        return null;
    } catch (e) {
        console.warn("[store] getUser threw:", e);
        return null;
    }
}

let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
// Tracks whether we've pushed the most recent local value up yet. If a save
// errors, we retry on the next edit. Needed so a silent failure isn't
// permanent.
let remotePending: PlannerConfig | null = null;

async function flushRemoteSave(userId: string, config: PlannerConfig) {
    try {
        const { data, error } = await supabase.auth.updateUser({
            data: { plannerConfig: config },
        });
        if (error) {
            console.warn("[store] updateUser failed:", error.message);
            remotePending = config;
            return;
        }
        remotePending = null;
        console.log("[store] synced planner config to Supabase", {
            userId,
            calories: data?.user?.user_metadata?.plannerConfig?.weeklyCalories,
        });
    } catch (e) {
        console.warn("[store] updateUser threw:", e);
        remotePending = config;
    }
}

function scheduleRemoteSave(userId: string | null, config: PlannerConfig) {
    if (!userId) return;
    remotePending = config;
    if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
    // Debounce to avoid hammering Supabase on every keystroke.
    remoteSaveTimer = setTimeout(() => {
        if (remotePending && currentUserId) {
            flushRemoteSave(currentUserId, remotePending);
        }
    }, 800);
}

export async function hydrateForUser(userId: string | null): Promise<void> {
    // No-op if we're already hydrated for this user. Prevents USER_UPDATED
    // events (fired after every updateUser call) from redundantly re-fetching
    // and racing with in-flight local edits.
    if (hydrated && userId === currentUserId) return;

    currentUserId = userId;
    hydrated = false;
    const key = storageKeyFor(userId);
    try {
        let saved = await AsyncStorage.getItem(key);
        if (!saved) {
            const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
                await AsyncStorage.setItem(key, legacy);
                saved = legacy;
            }
        }
        const localLoaded = parseConfig(saved);

        // When logged in, Supabase user_metadata is the source of truth so
        // settings follow the account across devices. Local AsyncStorage is
        // just a warm cache.
        let resolved: PlannerConfig | null = null;
        if (userId) {
            const remote = await fetchRemoteConfig();
            if (remote) {
                resolved = remote;
                AsyncStorage.setItem(key, JSON.stringify(remote)).catch((e) =>
                    console.warn("[store] local cache write failed:", e),
                );
            } else if (localLoaded) {
                // First time on this account — push local up so future devices
                // inherit these goals.
                resolved = localLoaded;
                flushRemoteSave(userId, localLoaded);
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
    } catch (e) {
        console.warn("[store] hydrate failed:", e);
    } finally {
        hydrated = true;
        notify();
    }
}

// Best-effort anonymous hydrate on module init so the app renders something
// sensible before auth resolves.
hydrateForUser(null).catch(() => {});

function persistConfig(config: PlannerConfig) {
    if (!hydrated) return;
    AsyncStorage.setItem(storageKeyFor(currentUserId), JSON.stringify(config)).catch((e) =>
        console.warn("[store] local cache write failed:", e),
    );
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
