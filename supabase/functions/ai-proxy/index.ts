// Authenticated proxy for OpenAI, Anthropic, and Nutritionix so API keys
// never ship inside the client bundle.
//
// Deploy:   supabase functions deploy ai-proxy
// Secrets:  supabase secrets set OPENAI_API_KEY=... ANTHROPIC_API_KEY=... \
//             NUTRITIONIX_APP_ID=... NUTRITIONIX_APP_KEY=... DEFAULT_AI_PROVIDER=openai
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "openai" | "claude";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;
const MAX_QUERY_CHARS = 200;
const MAX_TITLES = 40;
const MAX_IMAGE_B64 = 3_000_000; // ~2.2 MB of JPEG, plenty for a downscaled photo
const MAX_RECENT_FOODS = 15;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function resolveProvider(requested: unknown): Provider {
    if (requested === "openai" || requested === "claude") return requested;
    return Deno.env.get("DEFAULT_AI_PROVIDER") === "claude" ? "claude" : "openai";
}

// ─── Prompt builder (moved from lib/api.ts so targets stay server-validated) ──

function buildMealPrompt(strictness: string, targetProtein: number, targetCalories: number, existingTitles: string[]): string {
    const trackDesc: Record<string, string> = {
        straight_vegan: "strictly vegan — NO meat, NO fish, NO dairy, NO eggs. Only plant-based ingredients.",
        vegan_fish: "pescatarian — NO meat, NO dairy, NO eggs. You MUST include fish or seafood (such as salmon, tilapia, shrimp, tuna, sardines, or calamari) as a main protein source in this meal. Do NOT make a fully vegan meal.",
        unrestricted: "unrestricted and macro-optimized — you MUST build the meal around a lean, high-quality animal protein (chicken breast, lean beef, turkey, fish, eggs/egg whites, or Greek yogurt) as the main component. Prioritize the highest-protein, healthiest macro profile possible while hitting the targets. Do NOT make a vegan or vegetarian meal and do NOT default to beans/lentils/tofu as the primary protein.",
    };

    const avoid = existingTitles.length > 0
        ? `\nDo NOT suggest any of these already-generated meals: ${existingTitles.join(", ")}.`
        : "";

    return `You are a nutritionist specializing in Coptic Orthodox fasting meal planning.
Generate ONE unique, creative, and delicious meal that is ${trackDesc[strictness] ?? "vegan"}.

CRITICAL NUTRITION REQUIREMENTS — the meal MUST hit these targets:
- Protein: exactly ${targetProtein}g (within ±5g)
- Calories: exactly ${targetCalories} calories (within ±50)

Use realistic portion sizes and enough ingredients to actually reach these numbers. If needed, use larger servings, add protein-rich sides (beans, lentils, tofu, seitan, nuts), or increase portions. Do NOT return a meal that falls short of the targets.
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
  "estimatedNutrition": { "calories": ${targetCalories}, "protein": ${targetProtein}, "carbs": 55, "fiber": 12, "fat": 10 },
  "imageQuery": "keyword1+keyword2"
}`;
}

function buildPhotoFoodPrompt(recentFoods: string[]): string {
    const recentList = recentFoods.length > 0
        ? recentFoods.map((f, i) => `${i}. ${f}`).join("\n")
        : "(none)";

    return `You are a food-logging assistant. The photo shows food that is sitting on a kitchen scale, about to be eaten.

Do ALL of the following:
1. Read the scale's display if it is visible and legible. Report the weight in grams (convert from oz/lb if the display shows those). If you cannot read it confidently, use null.
2. Look for branded packaging or a product label on the food (e.g. a yogurt tub that says "Lidl Greek Yogurt"). If a label is readable, extract the brand and the product name.
3. If there is no readable label (plain/unpackaged food), identify the food generically in a short phrase (e.g. "greek yogurt", "grilled chicken breast").
4. Compare what you see against the user's recently logged foods below. If the food in the photo is very likely one of them, report that item's index number. Otherwise use null.
5. Estimate the nutrition of this food per 100 g.

User's recently logged foods:
${recentList}

Respond ONLY with a valid JSON object (no markdown, no explanation):
{
  "scaleWeightGrams": 100.0,
  "labelDetected": true,
  "brand": "Lidl",
  "productName": "Greek Yogurt",
  "foodGuess": "greek yogurt",
  "matchedRecentIndex": 0,
  "confidence": "high",
  "per100g": { "calories": 59, "protein": 10, "carbs": 3.6, "fat": 0.4, "fiber": 0 }
}
Use null for any field you cannot determine ("confidence" must be "high", "medium", or "low").`;
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function callOpenAI(messages: Array<{ role: string; content: string }>, opts: { temperature: number; maxTokens?: number; jsonMode?: boolean }): Promise<string> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY secret is not set");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            temperature: opts.temperature,
            ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
            ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(messages: ChatMessage[], opts: { system?: string; maxTokens: number }): Promise<string> {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY secret is not set");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: opts.maxTokens,
            ...(opts.system ? { system: opts.system } : {}),
            messages,
        }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json();
    const block = data.content?.[0];
    return block?.type === "text" ? block.text : "";
}

async function callOpenAIVision(prompt: string, imageB64: string): Promise<string> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OPENAI_API_KEY secret is not set");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.2,
            max_tokens: 500,
            response_format: { type: "json_object" },
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
                ],
            }],
        }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropicVision(prompt: string, imageB64: string): Promise<string> {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY secret is not set");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 500,
            messages: [{
                role: "user",
                content: [
                    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } },
                    { type: "text", text: prompt },
                ],
            }],
        }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json();
    const block = data.content?.[0];
    return block?.type === "text" ? block.text : "";
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function handleMeal(body: Record<string, unknown>): Promise<Response> {
    const provider = resolveProvider(body.provider);
    const strictness = typeof body.strictness === "string" ? body.strictness : "straight_vegan";
    const targetProtein = Math.min(Math.max(Number(body.targetProtein) || 0, 1), 400);
    const targetCalories = Math.min(Math.max(Number(body.targetCalories) || 0, 50), 10000);
    const existingTitles = (Array.isArray(body.existingTitles) ? body.existingTitles : [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.slice(0, 120))
        .slice(0, MAX_TITLES);

    const prompt = buildMealPrompt(strictness, targetProtein, targetCalories, existingTitles);

    let raw: string;
    if (provider === "openai") {
        raw = await callOpenAI([{ role: "user", content: prompt }], { temperature: 1.1, jsonMode: true });
    } else {
        raw = await callAnthropic([{ role: "user", content: prompt }], { maxTokens: 1024 });
        raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }

    let meal: unknown;
    try {
        meal = JSON.parse(raw || "{}");
    } catch {
        return json({ error: "AI returned invalid JSON" }, 502);
    }
    return json({ meal, provider });
}

async function handleChat(body: Record<string, unknown>): Promise<Response> {
    const provider = resolveProvider(body.provider);
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = rawMessages
        .filter((m): m is ChatMessage =>
            m && typeof m === "object" &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" && m.content.length > 0)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
        .slice(-MAX_MESSAGES);
    if (messages.length === 0) return json({ error: "No messages" }, 400);

    const systemPrompt = "You are a helpful nutritionist assistant specializing in Coptic Orthodox fasting and Middle Eastern cuisine. Help users with meal planning, nutrition advice, and recipe questions.";

    let reply: string;
    if (provider === "openai") {
        reply = await callOpenAI(
            [{ role: "system", content: systemPrompt }, ...messages],
            { temperature: 0.8, maxTokens: 600 },
        );
    } else {
        reply = await callAnthropic(messages, { system: systemPrompt, maxTokens: 600 });
    }
    return json({ reply });
}

function sanitizePhotoAnalysis(raw: Record<string, unknown>, recentCount: number) {
    const num = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
    const str = (v: unknown): string | null =>
        typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;
    const macro = (v: unknown): number => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, 1000) : 0;
    };

    const weight = num(raw.scaleWeightGrams);
    const idx = num(raw.matchedRecentIndex);
    const per = raw.per100g;

    return {
        scaleWeightGrams: weight !== null && weight > 0 && weight < 20000
            ? Math.round(weight * 10) / 10
            : null,
        labelDetected: raw.labelDetected === true,
        brand: str(raw.brand),
        productName: str(raw.productName),
        foodGuess: str(raw.foodGuess),
        matchedRecentIndex: idx !== null && Number.isInteger(idx) && idx >= 0 && idx < recentCount
            ? idx
            : null,
        confidence: raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low",
        per100g: per && typeof per === "object"
            ? {
                calories: macro((per as Record<string, unknown>).calories),
                protein: macro((per as Record<string, unknown>).protein),
                carbs: macro((per as Record<string, unknown>).carbs),
                fat: macro((per as Record<string, unknown>).fat),
                fiber: macro((per as Record<string, unknown>).fiber),
            }
            : null,
    };
}

async function handlePhotoFood(body: Record<string, unknown>): Promise<Response> {
    const provider = resolveProvider(body.provider);

    let image = typeof body.image === "string" ? body.image.trim() : "";
    // Accept either a raw base64 string or a full data URL.
    const commaIdx = image.indexOf(",");
    if (image.startsWith("data:")) image = commaIdx >= 0 ? image.slice(commaIdx + 1) : "";
    if (!image || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: "Missing or invalid image" }, 400);
    if (image.length > MAX_IMAGE_B64) return json({ error: "Image is too large" }, 400);

    const recentFoods = (Array.isArray(body.recentFoods) ? body.recentFoods : [])
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 120))
        .slice(0, MAX_RECENT_FOODS);

    const prompt = buildPhotoFoodPrompt(recentFoods);

    let raw: string;
    if (provider === "openai") {
        raw = await callOpenAIVision(prompt, image);
    } else {
        raw = await callAnthropicVision(prompt, image);
        raw = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw || "{}");
    } catch {
        return json({ error: "AI returned invalid JSON" }, 502);
    }
    return json({ analysis: sanitizePhotoAnalysis(parsed, recentFoods.length), provider });
}

async function handleFoodSearch(body: Record<string, unknown>): Promise<Response> {
    const appId = Deno.env.get("NUTRITIONIX_APP_ID");
    const appKey = Deno.env.get("NUTRITIONIX_APP_KEY");
    if (!appId || !appKey) return json({ branded: [] });

    const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_CHARS) : "";
    if (!query) return json({ branded: [] });

    const res = await fetch(
        `https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(query)}&branded=true&self=false`,
        {
            headers: {
                "x-app-id": appId,
                "x-app-key": appKey,
                "x-remote-user-id": "0",
            },
        },
    );
    if (!res.ok) return json({ branded: [] });
    const data = await res.json().catch(() => null);
    return json({ branded: data?.branded ?? [] });
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    // The platform's JWT check also accepts the public anon key, so verify the
    // token actually belongs to a signed-in user before spending API credits.
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    try {
        switch (body.action) {
            case "meal": return await handleMeal(body);
            case "chat": return await handleChat(body);
            case "photo-food": return await handlePhotoFood(body);
            case "food-search": return await handleFoodSearch(body);
            default: return json({ error: "Unknown action" }, 400);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : "Upstream request failed";
        return json({ error: message }, 502);
    }
});
