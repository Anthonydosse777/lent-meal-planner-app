import { supabase } from "./supabase";

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
    if (!user) return;

    await supabase.from('logged_meals').insert({
        user_id: user.id,
        date: todayDate(),
        meal_data: meal
    });
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
    if (!user) return;

    const targetDate = date ?? todayDate();

    // Upsert equivalent by deleting the old and inserting the new
    await supabase.from('weight_entries').delete().eq('date', targetDate).eq('user_id', user.id);
    await supabase.from('weight_entries').insert({
        user_id: user.id,
        date: targetDate,
        weight: weight,
        unit: unit
    });
}

export async function deleteWeightEntry(date: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('weight_entries').delete().eq('date', date).eq('user_id', user.id);
}
