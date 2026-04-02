import Constants from "expo-constants";

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

export async function searchFoods(query: string, pageSize = 8): Promise<USDAFood[]> {
    if (!query.trim()) return [];

    const apiKey = getApiKey();
    console.log("[USDA] searching:", query, "key:", apiKey.slice(0, 6) + "...");

    const params = new URLSearchParams({
        api_key: apiKey,
        query: query.trim(),
        pageSize: String(pageSize),
        dataType: "Foundation,SR Legacy",
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
    console.log("[USDA] got", data.foods?.length ?? 0, "results");

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
