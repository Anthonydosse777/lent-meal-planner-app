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
            case "food-search": return await handleFoodSearch(body);
            default: return json({ error: "Unknown action" }, 400);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : "Upstream request failed";
        return json({ error: message }, 502);
    }
});
