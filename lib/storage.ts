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

// ─── Keys ─────────────────────────────────────────────────────────────────────

const MEALS_KEY = "@lent_planner:logged_meals";
const WEIGHT_KEY = "@lent_planner:weight_entries";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Returns the last N calendar dates as "YYYY-MM-DD" strings, ending today. */
export function lastNDates(n: number): string[] {
    const dates: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}

// ─── Meal log ─────────────────────────────────────────────────────────────────

export async function getLoggedMeals(): Promise<LoggedMeal[]> {
    try {
        const raw = await AsyncStorage.getItem(MEALS_KEY);
        return raw ? (JSON.parse(raw) as LoggedMeal[]) : [];
    } catch {
        return [];
    }
}

export async function logMeal(meal: LoggedMeal["meal"]): Promise<void> {
    const existing = await getLoggedMeals();
    existing.push({
        id: Math.random().toString(36).slice(2, 10),
        date: todayDate(),
        loggedAt: new Date().toISOString(),
        meal,
    });
    await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(existing));
}

export async function removeLoggedMeal(id: string): Promise<void> {
    const existing = await getLoggedMeals();
    await AsyncStorage.setItem(
        MEALS_KEY,
        JSON.stringify(existing.filter((m) => m.id !== id))
    );
}

// ─── Weight log ───────────────────────────────────────────────────────────────

export async function getWeightEntries(): Promise<WeightEntry[]> {
    try {
        const raw = await AsyncStorage.getItem(WEIGHT_KEY);
        return raw ? (JSON.parse(raw) as WeightEntry[]) : [];
    } catch {
        return [];
    }
}

export async function saveWeightEntry(weight: number, unit: "kg" | "lbs", date?: string): Promise<void> {
    const entries = await getWeightEntries();
    const targetDate = date ?? todayDate();
    const filtered = entries.filter((e) => e.date !== targetDate);
    filtered.push({ date: targetDate, weight, unit });
    // Keep sorted by date
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    await AsyncStorage.setItem(WEIGHT_KEY, JSON.stringify(filtered));
}

export async function deleteWeightEntry(date: string): Promise<void> {
    const entries = await getWeightEntries();
    await AsyncStorage.setItem(
        WEIGHT_KEY,
        JSON.stringify(entries.filter((e) => e.date !== date))
    );
}
