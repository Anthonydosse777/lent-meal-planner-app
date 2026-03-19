import Constants from "expo-constants";
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

// ─── Key resolution ────────────────────────────────────────────────────────────

function getKeys(): { openaiKey: string | undefined; anthropicKey: string | undefined; defaultProvider: Provider } {
    const extra = Constants.expoConfig?.extra ?? {};
    return {
        openaiKey: extra.openaiApiKey as string | undefined,
        anthropicKey: extra.anthropicApiKey as string | undefined,
        defaultProvider: (extra.defaultProvider as Provider | undefined) ?? "openai",
    };
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

function buildMealPrompt(strictness: string, targetProtein: number, targetCalories: number, existingTitles: string[]): string {
    const trackDesc: Record<string, string> = {
        straight_vegan: "strictly vegan — NO meat, NO fish, NO dairy, NO eggs. Only plant-based ingredients.",
        vegan_fish: "vegan + fish allowed — NO meat, NO dairy, NO eggs. Fish and seafood are permitted.",
        unrestricted: "no dietary restrictions — any ingredients allowed including meat, dairy, and eggs.",
    };

    const avoid = existingTitles.length > 0
        ? `\nDo NOT suggest any of these already-generated meals: ${existingTitles.join(", ")}.`
        : "";

    return `You are a nutritionist specializing in Coptic Orthodox fasting meal planning.
Generate ONE unique, creative, and delicious meal that is ${trackDesc[strictness] ?? "vegan"}.
Target approximately ${targetProtein}g of protein and ${targetCalories} calories.
${avoid}

Vary the cuisine widely — Egyptian, Mediterranean, Middle Eastern, Asian, Mexican, Ethiopian, etc.
Be specific and creative with dish names. Do not repeat generic dishes.

Respond ONLY with a valid JSON object (no markdown, no explanation):
{
  "title": "Dish Name",
  "description": "One sentence description.",
  "ingredients": [{ "name": "Ingredient Name", "amount": 1.5, "unit": "cup" }],
  "instructions": ["Step 1.", "Step 2."],
  "prepTime": 10,
  "cookTime": 20,
  "tags": ["Tag1", "Tag2"],
  "estimatedNutrition": { "calories": 450, "protein": 28, "carbs": 55, "fiber": 12, "fat": 10 },
  "imageQuery": "keyword1+keyword2"
}`;
}

// ─── Meal generation ───────────────────────────────────────────────────────────

export async function fetchAiMeal(params: {
    provider?: Provider;
    strictness: Track;
    targetProtein: number;
    targetCalories: number;
    existingTitles: string[];
}): Promise<AiMeal> {
    const { openaiKey, anthropicKey, defaultProvider } = getKeys();
    const provider = params.provider ?? defaultProvider;
    const activeKey = provider === "openai" ? openaiKey : anthropicKey;

    if (!activeKey) {
        throw new Error(`No API key configured for ${provider}. Add it to .env`);
    }

    const prompt = buildMealPrompt(params.strictness, params.targetProtein, params.targetCalories, params.existingTitles);
    let raw = "";

    if (provider === "openai") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${activeKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 1.1,
                response_format: { type: "json_object" },
            }),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI error: ${err}`);
        }
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        raw = data.choices[0]?.message?.content ?? "{}";
    } else {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": activeKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 1024,
                messages: [{ role: "user", content: prompt }],
            }),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Anthropic error: ${err}`);
        }
        const data = await response.json() as { content: Array<{ type: string; text: string }> };
        const block = data.content[0];
        raw = block?.type === "text" ? block.text : "{}";
        raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("AI returned invalid JSON");
    }

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
    const { openaiKey, anthropicKey, defaultProvider } = getKeys();
    const activeProvider = provider ?? defaultProvider;
    const activeKey = activeProvider === "openai" ? openaiKey : anthropicKey;

    if (!activeKey) {
        throw new Error(`No API key configured for ${activeProvider}.`);
    }

    const systemPrompt = "You are a helpful nutritionist assistant specializing in Coptic Orthodox fasting and Middle Eastern cuisine. Help users with meal planning, nutrition advice, and recipe questions.";

    if (activeProvider === "openai") {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${activeKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages,
                ],
                temperature: 0.8,
                max_tokens: 600,
            }),
        });
        if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        return data.choices[0]?.message?.content ?? "";
    } else {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": activeKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 600,
                system: systemPrompt,
                messages,
            }),
        });
        if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
        const data = await response.json() as { content: Array<{ type: string; text: string }> };
        const block = data.content[0];
        return block?.type === "text" ? block.text : "";
    }
}
