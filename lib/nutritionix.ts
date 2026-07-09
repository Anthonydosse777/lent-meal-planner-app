// Nutritionix branded-food search, proxied through the `ai-proxy` Supabase
// Edge Function so the app ID/key stay server-side.
import { supabase } from "./supabase";
import type { USDAFood } from "./usda";

interface NxBrandedItem {
    food_name: string;
    brand_name?: string;
    serving_weight_grams: number | null;
    nf_calories: number | null;
    nf_total_fat: number | null;
    nf_total_carbohydrate: number | null;
    nf_protein: number | null;
    nf_dietary_fiber: number | null;
}

export async function searchFoodsNutritionix(query: string): Promise<USDAFood[]> {
    if (!query.trim()) return [];

    let branded: NxBrandedItem[];
    try {
        const { data, error } = await supabase.functions.invoke("ai-proxy", {
            body: { action: "food-search", query: query.trim() },
        });
        if (error || !Array.isArray(data?.branded)) return [];
        branded = data.branded;
    } catch {
        return [];
    }

    return branded
        .filter((item) => item.serving_weight_grams && item.nf_calories != null)
        .map((item, i) => {
            const g = item.serving_weight_grams!;
            const s = 100 / g;
            return {
                fdcId: -(3000 + i),
                description: item.food_name,
                brandName: item.brand_name,
                dataType: "Branded",
                per100g: {
                    calories: Math.round((item.nf_calories ?? 0) * s),
                    protein: Math.round((item.nf_protein ?? 0) * s * 10) / 10,
                    carbs: Math.round((item.nf_total_carbohydrate ?? 0) * s * 10) / 10,
                    fat: Math.round((item.nf_total_fat ?? 0) * s * 10) / 10,
                    fiber: Math.round((item.nf_dietary_fiber ?? 0) * s * 10) / 10,
                },
            } satisfies USDAFood;
        });
}
