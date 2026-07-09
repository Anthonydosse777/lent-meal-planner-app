import { supabase } from "./supabase";
import type { Track } from "./meal-data";

export type Provider = "openai" | "claude";

export interface AiMealIngredient {
    ingredientId: string;
    name: string;
    amount: number;
    unit: string;
}

export interface AiMeal {
    id: string;
    title: string;
    description: string;
    ingredients: AiMealIngredient[];
    instructions: string[];
    prepTime: number;
    cookTime: number;
    tags: string[];
    totalNutrition: {
        calories: number;
        protein: number;
        carbs: number;
        fiber: number;
        fat: number;
    };
    source: string;
    imageKeyword: string;
    isAiGenerated: true;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
}

// ─── Edge Function proxy ───────────────────────────────────────────────────────
// All AI calls go through the `ai-proxy` Supabase Edge Function so provider
// API keys stay server-side and never reach the client bundle.

async function invokeAiProxy<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke("ai-proxy", { body });
    if (error) {
        let message = error.message;
        try {
            const ctx = await (error as { context?: Response }).context?.json();
            if (ctx?.error) message = ctx.error;
        } catch {
            // keep the generic invoke error message
        }
        throw new Error(message);
    }
    return data as T;
}

// ─── Meal generation ───────────────────────────────────────────────────────────

export async function fetchAiMeal(params: {
    provider?: Provider;
    strictness: Track;
    targetProtein: number;
    targetCalories: number;
    existingTitles: string[];
}): Promise<AiMeal> {
    const { meal: parsed, provider } = await invokeAiProxy<{
        meal: Record<string, unknown>;
        provider: Provider;
    }>({
        action: "meal",
        provider: params.provider,
        strictness: params.strictness,
        targetProtein: params.targetProtein,
        targetCalories: params.targetCalories,
        existingTitles: params.existingTitles,
    });

    const nutrition = parsed.estimatedNutrition as Record<string, number> | undefined;
    return {
        id: Math.random().toString(36).slice(2, 10),
        title: (parsed.title as string) ?? "AI Meal",
        description: (parsed.description as string) ?? "",
        ingredients: ((parsed.ingredients ?? []) as Array<{ name: string; amount: number; unit: string }>).map((i) => ({
            ingredientId: i.name.toLowerCase().replace(/\s+/g, "_"),
            name: i.name,
            amount: i.amount,
            unit: i.unit,
        })),
        instructions: (parsed.instructions ?? []) as string[],
        prepTime: (parsed.prepTime as number) ?? 10,
        cookTime: (parsed.cookTime as number) ?? 20,
        tags: (parsed.tags ?? []) as string[],
        totalNutrition: {
            calories: nutrition?.calories ?? 0,
            protein: nutrition?.protein ?? 0,
            carbs: nutrition?.carbs ?? 0,
            fiber: nutrition?.fiber ?? 0,
            fat: nutrition?.fat ?? 0,
        },
        source: provider === "openai" ? "OpenAI GPT-4o mini" : "Claude Haiku",
        imageKeyword: ((parsed.imageQuery as string | undefined) ?? (parsed.title as string) ?? "food").replace(/\s+/g, "+"),
        isAiGenerated: true,
    };
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export async function sendChatMessage(messages: Message[], provider?: Provider): Promise<string> {
    const { reply } = await invokeAiProxy<{ reply: string }>({
        action: "chat",
        provider,
        messages,
    });
    return reply;
}
