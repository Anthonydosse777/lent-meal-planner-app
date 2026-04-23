// Open Food Facts barcode lookup. Free, no API key, CORS-enabled.
// Docs: https://wiki.openfoodfacts.org/API

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

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
    const cleaned = barcode.replace(/\D/g, "");
    if (!cleaned) return null;

    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(cleaned)}.json`;
    const res = await fetch(url, {
        headers: { "User-Agent": "LentMealPlanner/1.0" },
    });
    if (!res.ok) throw new Error(`OpenFoodFacts error: ${res.status}`);
    const data = await res.json();

    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
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
