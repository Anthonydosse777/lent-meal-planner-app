/**
 * Simple module-level reactive store for sharing state across tabs
 * without requiring a full state management library.
 */
import { useState, useEffect } from "react";
import type { Track } from "./meal-data";
import type { AiMeal, Provider } from "./api";

export interface PlannerConfig {
    protein: number;
    calories: number;
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
    calories: 2000,
    strictness: "straight_vegan",
    mealsPerDay: 3,
    mode: "single",
    provider: "openai",
};

let state: StoreState = {
    config: { ...DEFAULT_CONFIG },
    meals: [],
    loadingSlots: [],
    error: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((l) => l());
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
