import Constants from "expo-constants";
import type { BarcodeProduct } from "./openfoodfacts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface USDAFood {
    fdcId: number;
    description: string;
    brandName?: string;
    dataType: string;
    per100g: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
    };
}

interface USDANutrient {
    nutrientId: number;
    nutrientName: string;
    value: number;
    unitName: string;
}

interface USDASearchResult {
    foods: Array<{
        fdcId: number;
        description: string;
        brandName?: string;
        dataType: string;
        foodNutrients: USDANutrient[];
    }>;
    totalHits: number;
}

// Nutrient IDs in USDA FoodData Central
const NUTRIENT_IDS = {
    ENERGY: 1008,
    PROTEIN: 1003,
    CARBS: 1005,
    FAT: 1004,
    FIBER: 1079,
} as const;

// ─── API Key ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const extra = Constants.expoConfig?.extra ?? {};
    return (extra.usdaApiKey as string) || process.env.EXPO_PUBLIC_USDA_API_KEY || "DEMO_KEY";
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchFoods(query: string, pageSize = 20): Promise<USDAFood[]> {
    if (!query.trim()) return [];

    const apiKey = getApiKey();

    const params = new URLSearchParams({
        api_key: apiKey,
        query: query.trim(),
        pageSize: String(pageSize),
        dataType: "Foundation,SR Legacy,Branded",
    });

    const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`
    );

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(`[USDA] API error ${response.status}:`, text);
        throw new Error(`USDA API error: ${response.status}`);
    }

    const data: USDASearchResult = await response.json();

    return (data.foods ?? []).map((food) => {
        const nutrients = food.foodNutrients;
        const get = (id: number) =>
            nutrients.find((n) => n.nutrientId === id)?.value ?? 0;

        return {
            fdcId: food.fdcId,
            description: food.description,
            brandName: food.brandName,
            dataType: food.dataType,
            per100g: {
                calories: Math.round(get(NUTRIENT_IDS.ENERGY)),
                protein: Math.round(get(NUTRIENT_IDS.PROTEIN) * 10) / 10,
                carbs: Math.round(get(NUTRIENT_IDS.CARBS) * 10) / 10,
                fat: Math.round(get(NUTRIENT_IDS.FAT) * 10) / 10,
                fiber: Math.round(get(NUTRIENT_IDS.FIBER) * 10) / 10,
            },
        };
    });
}

// ─── Barcode (UPC) fallback ─────────────────────────────────────────────────

interface USDABrandedFood {
    fdcId: number;
    description: string;
    brandName?: string;
    brandOwner?: string;
    gtinUpc?: string;
    servingSize?: number;
    servingSizeUnit?: string;
    foodNutrients: USDANutrient[];
}

// Used when Open Food Facts is unavailable. USDA's Branded dataset is
// searchable by UPC; nutrient values there are per 100 g/ml.
export async function lookupBarcodeUSDA(barcode: string): Promise<BarcodeProduct | null> {
    const cleaned = barcode.replace(/\D/g, "");
    if (!cleaned) return null;

    const params = new URLSearchParams({
        api_key: getApiKey(),
        query: cleaned,
        pageSize: "10",
        dataType: "Branded",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res: Response;
    try {
        res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`, {
            signal: controller.signal,
        });
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
    if (!res.ok) return null;

    let data: { foods?: USDABrandedFood[] };
    try {
        data = await res.json();
    } catch {
        return null;
    }

    const match = (data.foods ?? []).find((f) => (f.gtinUpc ?? "").replace(/\D/g, "") === cleaned)
        ?? (data.foods ?? [])[0];
    if (!match) return null;

    const get = (id: number) => match.foodNutrients.find((n) => n.nutrientId === id)?.value ?? 0;
    const per100g = {
        calories: Math.round(get(NUTRIENT_IDS.ENERGY)),
        protein: Math.round(get(NUTRIENT_IDS.PROTEIN) * 10) / 10,
        carbs: Math.round(get(NUTRIENT_IDS.CARBS) * 10) / 10,
        fat: Math.round(get(NUTRIENT_IDS.FAT) * 10) / 10,
        fiber: Math.round(get(NUTRIENT_IDS.FIBER) * 10) / 10,
    };
    if (!per100g.calories && !per100g.protein) return null;

    const unit = (match.servingSizeUnit ?? "").toLowerCase();
    const servingGrams = match.servingSize && (unit === "g" || unit === "ml") ? match.servingSize : null;
    const servingSize = match.servingSize ? `${match.servingSize} ${match.servingSizeUnit ?? "g"}` : null;
    const perServing = servingGrams
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
        name: match.description || "Unknown product",
        brand: match.brandName || match.brandOwner || null,
        imageUrl: null,
        servingSize,
        servingGrams,
        perServing,
        per100g,
    };
}
