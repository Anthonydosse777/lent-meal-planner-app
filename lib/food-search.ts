// Unified food search across USDA, Nutritionix (branded), and Open Food Facts.
// Extracted so both the manual logger and the photo logger share one ranking.
import { searchFoods, type USDAFood } from "./usda";
import { searchFoodsNutritionix } from "./nutritionix";
import { searchFoodsOFF } from "./openfoodfacts";

export type { USDAFood };

export function scoreRelevance(food: USDAFood, query: string): number {
    const desc = food.description.toLowerCase().trim();
    const q = query.toLowerCase().trim();
    let score = 0;

    if (desc === q) {
        score += 100;
    } else if (desc.startsWith(q + ",") || desc.startsWith(q + " ")) {
        score += 70;
    } else if (desc.startsWith(q)) {
        score += 60;
    } else {
        const firstWord = desc.split(/[\s,]+/)[0];
        if (firstWord === q) score += 40;
        else if (desc.split(/[\s,]+/).some((w) => w === q)) score += 20;
        else if (desc.includes(q)) score += 5;
    }

    // Prefer whole foods over branded products for generic queries.
    if (food.dataType === "Foundation") score += 8;
    else if (food.dataType === "SR Legacy") score += 4;

    // Shorter names are usually more relevant (less compound/processed).
    score -= food.description.length * 0.05;

    return score;
}

// Runs the three sources in parallel, de-dupes by name, and ranks by relevance.
// Never throws — a failing source just contributes nothing.
export async function searchAllFoods(query: string): Promise<USDAFood[]> {
    const q = query.trim();
    if (!q) return [];

    const [usdaRes, nxRes, offRes] = await Promise.all([
        searchFoods(q).catch(() => [] as USDAFood[]),
        searchFoodsNutritionix(q).catch(() => [] as USDAFood[]),
        searchFoodsOFF(q).catch(() => [] as USDAFood[]),
    ]);

    const usdaNames = new Set(usdaRes.map((f) => f.description.toLowerCase().trim()));
    const dedupedNx = nxRes.filter((f) => !usdaNames.has(f.description.toLowerCase().trim()));
    const allNames = new Set([...usdaRes, ...dedupedNx].map((f) => f.description.toLowerCase().trim()));
    const dedupedOff = offRes.filter((f) => !allNames.has(f.description.toLowerCase().trim()));

    const merged = [...usdaRes, ...dedupedNx, ...dedupedOff];
    merged.sort((a, b) => scoreRelevance(b, q) - scoreRelevance(a, q));
    return merged;
}
