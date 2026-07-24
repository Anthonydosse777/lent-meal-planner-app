// Open Food Facts barcode lookup. Free, no API key, CORS-enabled.
// Docs: https://wiki.openfoodfacts.org/API
import { lookupBarcodeUSDA, type USDAFood } from "./usda";
import { supabase } from "./supabase";

export interface BarcodeProduct {
    barcode: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    servingSize: string | null;       // e.g. "30 g" or "240 ml"
    servingGrams: number | null;       // parsed grams when resolvable
    perServing: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
    } | null;
    per100g: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
    } | null;
}

function num(v: unknown): number {
    const n = typeof v === "string" ? parseFloat(v) : (v as number);
    return Number.isFinite(n) ? n : 0;
}

function parseServingGrams(servingSize: string | null): number | null {
    if (!servingSize) return null;
    // Matches "30 g", "30g", "1.5 oz", "240 ml" etc.
    const match = servingSize.match(/(\d+(?:\.\d+)?)\s*(g|ml|oz)/i);
    if (!match) return null;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "g" || unit === "ml") return value;
    if (unit === "oz") return value * 28.3495;
    return null;
}

function mapOffProduct(p: any, cleaned: string): BarcodeProduct {
    const n = p.nutriments ?? {};
    const servingSize: string | null = p.serving_size ?? null;
    const servingGrams = parseServingGrams(servingSize);

    const per100g = n["energy-kcal_100g"] !== undefined || n["proteins_100g"] !== undefined
        ? {
            calories: Math.round(num(n["energy-kcal_100g"])),
            protein: Math.round(num(n["proteins_100g"]) * 10) / 10,
            carbs: Math.round(num(n["carbohydrates_100g"]) * 10) / 10,
            fat: Math.round(num(n["fat_100g"]) * 10) / 10,
            fiber: Math.round(num(n["fiber_100g"]) * 10) / 10,
        }
        : null;

    const perServing = n["energy-kcal_serving"] !== undefined || n["proteins_serving"] !== undefined
        ? {
            calories: Math.round(num(n["energy-kcal_serving"])),
            protein: Math.round(num(n["proteins_serving"]) * 10) / 10,
            carbs: Math.round(num(n["carbohydrates_serving"]) * 10) / 10,
            fat: Math.round(num(n["fat_serving"]) * 10) / 10,
            fiber: Math.round(num(n["fiber_serving"]) * 10) / 10,
        }
        : per100g && servingGrams
            ? {
                calories: Math.round(per100g.calories * (servingGrams / 100)),
                protein: Math.round(per100g.protein * (servingGrams / 100) * 10) / 10,
                carbs: Math.round(per100g.carbs * (servingGrams / 100) * 10) / 10,
                fat: Math.round(per100g.fat * (servingGrams / 100) * 10) / 10,
                fiber: Math.round(per100g.fiber * (servingGrams / 100) * 10) / 10,
            }
            : null;

    return {
        barcode: cleaned,
        name: p.product_name || p.generic_name || "Unknown product",
        brand: p.brands || null,
        imageUrl: p.image_front_small_url || p.image_front_url || p.image_url || null,
        servingSize,
        servingGrams,
        perServing,
        per100g,
    };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Open Food Facts production occasionally returns 429/5xx or an HTML error
// page. Try the primary host then the mirror, retrying transient failures.
// Returns the parsed product, null if not found, or throws if unreachable.
async function fetchOffProduct(cleaned: string): Promise<BarcodeProduct | null> {
    const hosts = ["world.openfoodfacts.org", "world.openfoodfacts.net"];
    let reached = false;

    for (const host of hosts) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);
            try {
                // No custom headers: browsers forbid User-Agent, and on
                // Safari/iOS WebKit it makes fetch reject with "Load failed".
                const res = await fetch(
                    `https://${host}/api/v0/product/${encodeURIComponent(cleaned)}.json`,
                    { signal: controller.signal }
                );
                if (res.status === 429 || res.status >= 500) {
                    await sleep(400 * (attempt + 1));
                    continue;
                }
                if (!res.ok) break;
                let data: any;
                try {
                    data = await res.json();
                } catch {
                    break; // HTML/error page instead of JSON
                }
                reached = true;
                if (data.status !== 1 || !data.product) return null;
                return mapOffProduct(data.product, cleaned);
            } catch {
                // network error / abort — try next attempt or host
            } finally {
                clearTimeout(timeout);
            }
        }
    }

    if (reached) return null;
    throw new Error("offline");
}

// Open Food Facts text search — supplements USDA for international/niche brands
// (e.g. Lidl/Milbona and other European store brands USDA & Nutritionix lack).
//
// Proxied through the ai-proxy Edge Function: it uses the dedicated relevance
// engine at search.openfoodfacts.org (the world.openfoodfacts.org search_terms
// endpoint silently ignores the query text and returns the whole database),
// which does not send CORS headers, so it can't be called from the browser.
export async function searchFoodsOFF(query: string, _pageSize = 12): Promise<USDAFood[]> {
    const q = query.trim();
    if (!q) return [];

    let hits: any[];
    try {
        const { data, error } = await supabase.functions.invoke("ai-proxy", {
            body: { action: "off-search", query: q },
        });
        if (error || !Array.isArray(data?.hits)) return [];
        hits = data.hits;
    } catch {
        return [];
    }

    return hits
        .filter((p: any) => p.product_name && (p.nutriments?.["energy-kcal_100g"] != null || p.nutriments?.["proteins_100g"] != null))
        .map((p: any, i: number) => {
            const n = p.nutriments ?? {};
            // `brands` comes back as an array from this engine (vs a comma string elsewhere).
            const brand = Array.isArray(p.brands) ? p.brands.join(", ") : (p.brands || undefined);
            return {
                fdcId: -(i + 1),
                description: p.product_name as string,
                brandName: brand || undefined,
                dataType: "Branded",
                per100g: {
                    calories: Math.round(num(n["energy-kcal_100g"])),
                    protein: Math.round(num(n["proteins_100g"]) * 10) / 10,
                    carbs: Math.round(num(n["carbohydrates_100g"]) * 10) / 10,
                    fat: Math.round(num(n["fat_100g"]) * 10) / 10,
                    fiber: Math.round(num(n["fiber_100g"]) * 10) / 10,
                },
            } satisfies USDAFood;
        });
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
    const cleaned = barcode.replace(/\D/g, "");
    if (!cleaned) return null;

    let offReachable = true;
    try {
        const off = await fetchOffProduct(cleaned);
        if (off && (off.perServing || off.per100g)) return off;
    } catch {
        offReachable = false;
    }

    // Fall back to USDA's Branded (UPC-searchable) dataset.
    try {
        const usda = await lookupBarcodeUSDA(cleaned);
        if (usda) return usda;
    } catch {
        // ignore — handled below
    }

    if (!offReachable) {
        throw new Error("Couldn't reach the product database. Check your connection and try again.");
    }
    return null; // reachable but genuinely not found
}
