/**
 * Simple module-level reactive store for sharing state across tabs
 * without requiring a full state management library.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect } from "react";
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

const STORAGE_KEY = "planner-config-v1";

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

// Load persisted config on module init (async, non-blocking)
AsyncStorage.getItem(STORAGE_KEY)
    .then((saved) => {
        if (!saved) return;
        try {
            const parsed = JSON.parse(saved);
            const merged: PlannerConfig = {
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
            state = { ...state, config: merged };
            notify();
        } catch {
            // ignore corrupt storage
        }
    })
    .catch(() => {});

function persistConfig(config: PlannerConfig) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config)).catch(() => {});
}

export function getState(): StoreState {
    return state;
}

export function setState(patch: Partial<StoreState>) {
    state = { ...state, ...patch };
    notify();
}

export function setConfig(patch: Partial<PlannerConfig>) {
    state = { ...state, config: { ...state.config, ...patch } };
    notify();
    persistConfig(state.config);
}

export function setWeeklyCalorieDay(dayIndex: number, value: number) {
    if (dayIndex < 0 || dayIndex > 6) return;
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
