import { supabase } from "./supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoggedMeal {
    id: string;
    date: string; // "YYYY-MM-DD"
    loggedAt: string; // ISO timestamp
    meal: {
        id: string;
        title: string;
        source: string;
        imageKeyword?: string;
        totalNutrition: {
            calories: number;
            protein: number;
            carbs: number;
            fiber: number;
            fat: number;
        };
    };
}

export interface WeightEntry {
    date: string; // "YYYY-MM-DD"
    weight: number;
    unit: "kg" | "lbs";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function lastNDates(n: number): string[] {
    const dates: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}

// ─── Food history (local) ────────────────────────────────────────────────────

export interface FoodHistoryItem {
    name: string;
    brandName?: string;
    per100g: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
    count: number;
    lastUsed: string; // ISO timestamp
}

const FOOD_HISTORY_KEY = "food_history_v1";
const MAX_HISTORY = 50;

export async function getFoodHistory(): Promise<FoodHistoryItem[]> {
    try {
        const raw = await AsyncStorage.getItem(FOOD_HISTORY_KEY);
        return raw ? (JSON.parse(raw) as FoodHistoryItem[]) : [];
    } catch {
        return [];
    }
}

export async function recordFoodHistory(
    name: string,
    brandName: string | undefined,
    per100g: FoodHistoryItem["per100g"]
): Promise<void> {
    try {
        const history = await getFoodHistory();
        const existing = history.find((h) => h.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.count += 1;
            existing.lastUsed = new Date().toISOString();
            existing.per100g = per100g; // keep nutrition fresh
        } else {
            history.push({ name, brandName, per100g, count: 1, lastUsed: new Date().toISOString() });
        }
        history.sort(
            (a, b) => b.count - a.count || new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
        );
        await AsyncStorage.setItem(FOOD_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch {
        // ignore storage errors
    }
}

// ─── Meal log ─────────────────────────────────────────────────────────────────

export async function getLoggedMeals(): Promise<LoggedMeal[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('logged_meals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
        id: row.id,
        date: row.date,
        loggedAt: row.created_at,
        meal: row.meal_data,
    }));
}

export async function logMeal(meal: LoggedMeal["meal"]): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You're signed out — please sign in again.");

    const { error } = await supabase.from('logged_meals').insert({
        user_id: user.id,
        date: todayDate(),
        meal_data: meal
    });
    if (error) throw new Error(`Couldn't save the meal: ${error.message}`);
}

export async function removeLoggedMeal(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('logged_meals').delete().eq('id', id).eq('user_id', user.id);
}

// ─── Weight log ───────────────────────────────────────────────────────────────

export async function getWeightEntries(): Promise<WeightEntry[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('weight_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });

    if (error || !data) return [];

    return data.map((row: any) => ({
        date: row.date,
        weight: Number(row.weight),
        unit: row.unit,
    }));
}

export async function saveWeightEntry(weight: number, unit: "kg" | "lbs", date?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You're signed out — please sign in again.");

    // Atomic upsert; relies on the UNIQUE (user_id, date) constraint.
    const { error } = await supabase.from('weight_entries').upsert({
        user_id: user.id,
        date: date ?? todayDate(),
        weight: weight,
        unit: unit
    }, { onConflict: 'user_id,date' });
    if (error) throw new Error(`Couldn't save the weight entry: ${error.message}`);
}

export async function deleteWeightEntry(date: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('weight_entries').delete().eq('date', date).eq('user_id', user.id);
}
