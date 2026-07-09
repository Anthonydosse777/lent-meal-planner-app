import { INGREDIENTS, MEAL_TEMPLATES, type Meal, type DailyPlan, type Track, type Nutrition, type IngredientAmount } from "./meal-data";

function calculateNutrition(ingredients: IngredientAmount[]): Nutrition {
    const total: Nutrition = { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 };

    for (const item of ingredients) {
        const ing = INGREDIENTS.find((i) => i.id === item.ingredientId);
        if (!ing) continue;
        const grams = item.amount * ing.gramsPerUnit;
        const ratio = grams / 100;
        total.calories += ing.nutritionPer100g.calories * ratio;
        total.protein += ing.nutritionPer100g.protein * ratio;
        total.carbs += ing.nutritionPer100g.carbs * ratio;
        total.fiber += ing.nutritionPer100g.fiber * ratio;
        total.fat += ing.nutritionPer100g.fat * ratio;
    }

    return {
        calories: Math.round(total.calories),
        protein: Math.round(total.protein),
        carbs: Math.round(total.carbs),
        fiber: Math.round(total.fiber),
        fat: Math.round(total.fat),
    };
}

const ANIMAL_PROTEIN_CATEGORIES = new Set(["fish", "poultry", "meat", "egg", "dairy"]);
const PROTEIN_SOURCE_CATEGORIES = new Set(["legume", "fish", "poultry", "meat", "egg", "dairy"]);

function isProteinSource(ingredientId: string): boolean {
    const data = INGREDIENTS.find((i) => i.id === ingredientId);
    if (!data) return false;
    return PROTEIN_SOURCE_CATEGORIES.has(data.category) || ["seitan", "tofu_firm"].includes(data.id);
}

function templateHasAnimalProtein(template: (typeof MEAL_TEMPLATES)[0]): boolean {
    return template.ingredients.some((item) => {
        const ing = INGREDIENTS.find((i) => i.id === item.ingredientId);
        return ing != null && ANIMAL_PROTEIN_CATEGORIES.has(ing.category);
    });
}

function isTemplateAllowed(template: (typeof MEAL_TEMPLATES)[0], strictness: Track): boolean {
    for (const item of template.ingredients) {
        const ing = INGREDIENTS.find((i) => i.id === item.ingredientId);
        if (!ing) continue;
        if (strictness === "straight_vegan") {
            if (!ing.allowedIn.includes("strict") && !ing.allowedIn.includes("vegan_oil_restricted")) return false;
        } else if (strictness === "vegan_fish") {
            if (!ing.allowedIn.includes("vegan_fish") && !ing.allowedIn.includes("strict")) return false;
        }
        // unrestricted: every ingredient is allowed
    }
    return true;
}

// Higher score = better protein adequacy + leaner macros relative to the target.
function scoreTemplate(template: (typeof MEAL_TEMPLATES)[0], targetProtein: number): number {
    const n = calculateNutrition(template.ingredients);
    const proteinAdequacy = Math.min(n.protein / Math.max(targetProtein, 1), 1.5);
    const leanness = n.calories > 0 ? n.protein / n.calories : 0;
    return proteinAdequacy * 2 + leanness * 120;
}

function generateLocalMeal(strictness: Track, targetProtein?: number): Meal {
    let allowed = MEAL_TEMPLATES.filter((t) => isTemplateAllowed(t, strictness));

    // Unrestricted should lead with real animal-protein, macro-friendly meals,
    // not fall back to the larger pool of vegan templates.
    if (strictness === "unrestricted") {
        const withAnimalProtein = allowed.filter(templateHasAnimalProtein);
        if (withAnimalProtein.length > 0) allowed = withAnimalProtein;
    }

    if (allowed.length === 0) allowed = MEAL_TEMPLATES;

    let template: (typeof MEAL_TEMPLATES)[0];
    if (targetProtein) {
        // Rank by macro quality and pick from the top few for variety.
        const ranked = [...allowed].sort((a, b) => scoreTemplate(b, targetProtein) - scoreTemplate(a, targetProtein));
        const topPool = ranked.slice(0, Math.min(4, ranked.length));
        template = topPool[Math.floor(Math.random() * topPool.length)];
    } else {
        template = allowed[Math.floor(Math.random() * allowed.length)];
    }

    const adjustedIngredients = template.ingredients.map((ing) => ({ ...ing }));

    // Boost the strongest protein source if the meal falls short of target.
    if (targetProtein) {
        const current = calculateNutrition(adjustedIngredients);
        if (current.protein < targetProtein) {
            const proteinItem = adjustedIngredients
                .filter((item) => isProteinSource(item.ingredientId))
                .sort((a, b) => {
                    const pa = INGREDIENTS.find((i) => i.id === a.ingredientId)!.nutritionPer100g.protein;
                    const pb = INGREDIENTS.find((i) => i.id === b.ingredientId)!.nutritionPer100g.protein;
                    return pb - pa;
                })[0];
            if (proteinItem) {
                const data = INGREDIENTS.find((i) => i.id === proteinItem.ingredientId)!;
                const deficit = targetProtein - current.protein;
                if (data.nutritionPer100g.protein > 0) {
                    const extraGrams = (deficit / data.nutritionPer100g.protein) * 100;
                    const extraUnits = extraGrams / data.gramsPerUnit;
                    proteinItem.amount = Math.round((proteinItem.amount + extraUnits) * 100) / 100;
                }
            }
        }
    }

    return {
        ...template,
        ingredients: adjustedIngredients,
        id: Math.random().toString(36).slice(2, 10),
        totalNutrition: calculateNutrition(adjustedIngredients),
        source: "Local Database",
    };
}

export function generateMeal(strictness: Track, targetProtein?: number): Meal {
    return generateLocalMeal(strictness, targetProtein);
}

function rawNutrition(ingredients: IngredientAmount[]): Nutrition {
    const total: Nutrition = { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 };
    for (const item of ingredients) {
        const ing = INGREDIENTS.find((i) => i.id === item.ingredientId);
        if (!ing) continue;
        const ratio = (item.amount * ing.gramsPerUnit) / 100;
        total.calories += ing.nutritionPer100g.calories * ratio;
        total.protein += ing.nutritionPer100g.protein * ratio;
        total.carbs += ing.nutritionPer100g.carbs * ratio;
        total.fiber += ing.nutritionPer100g.fiber * ratio;
        total.fat += ing.nutritionPer100g.fat * ratio;
    }
    return total;
}

const BALANCER_PROTEIN: Record<Track, string> = {
    straight_vegan: "seitan",
    vegan_fish: "tuna_canned",
    unrestricted: "chicken_breast",
};

// A light vegetable base + a track-appropriate lean protein + olive oil. The
// protein and oil amounts are solved so this meal's nutrition exactly equals
// the remaining protein/calories needed to hit the day's totals.
function buildBalancerMeal(strictness: Track, needProtein: number, needCalories: number): Meal {
    const proteinId = BALANCER_PROTEIN[strictness];
    const proteinIng = INGREDIENTS.find((i) => i.id === proteinId)!;
    const oilIng = INGREDIENTS.find((i) => i.id === "olive_oil")!;

    const base: IngredientAmount[] = [
        { ingredientId: "spinach", amount: 2, unit: "cup" },
        { ingredientId: "cucumber", amount: 1, unit: "medium" },
        { ingredientId: "tomato", amount: 1, unit: "medium" },
        { ingredientId: "lemon", amount: 1, unit: "tbsp" },
        { ingredientId: "garlic", amount: 1, unit: "clove" },
    ];
    const baseN = rawNutrition(base);

    const proPerG = proteinIng.nutritionPer100g.protein / 100;
    const calProteinPerG = proteinIng.nutritionPer100g.calories / 100;
    const calOilPerG = oilIng.nutritionPer100g.calories / 100;

    let proteinGrams = (needProtein - baseN.protein) / proPerG;
    if (proteinGrams < 0) proteinGrams = 0;
    let oilGrams = (needCalories - baseN.calories - calProteinPerG * proteinGrams) / calOilPerG;
    if (oilGrams < 0) oilGrams = 0;

    const ingredients: IngredientAmount[] = [
        ...base,
        { ingredientId: proteinId, amount: proteinGrams / proteinIng.gramsPerUnit, unit: proteinIng.defaultUnit },
        { ingredientId: "olive_oil", amount: oilGrams / oilIng.gramsPerUnit, unit: oilIng.defaultUnit },
    ];

    return {
        title: "Macro-Balanced Power Bowl",
        description: `Light greens with ${proteinIng.name.toLowerCase()} and olive oil, portioned to hit your exact daily protein and calorie targets.`,
        ingredients,
        instructions: [
            "Toss spinach, cucumber, tomato, and garlic in a bowl.",
            `Cook the ${proteinIng.name.toLowerCase()} and slice it over the greens.`,
            "Dress with olive oil and lemon juice, season with salt and pepper.",
        ],
        prepTime: 10,
        cookTime: 12,
        tags: ["Macro Balanced", "High Protein", "Exact Fit"],
        imageKeyword: "protein+power+bowl,salad",
        id: Math.random().toString(36).slice(2, 10),
        totalNutrition: calculateNutrition(ingredients),
        source: "Local Database",
    };
}

// Generates `count` meals whose summed (rounded) calories and protein equal the
// targets exactly. The first count-1 meals are normal recipes; the last is a
// portion-solved balancer that absorbs the remainder.
export function generateExactPlan(params: {
    protein: number;
    calories: number;
    strictness: Track;
    count: number;
}): Meal[] {
    const { protein, calories, strictness } = params;
    const count = Math.max(params.count, 1);
    const proteinPerMeal = protein / count;

    const meals: Meal[] = [];
    for (let i = 0; i < count - 1; i++) {
        meals.push(generateMeal(strictness, proteinPerMeal));
    }

    let fixedProtein = meals.reduce((s, m) => s + m.totalNutrition.protein, 0);
    let fixedCalories = meals.reduce((s, m) => s + m.totalNutrition.calories, 0);

    // The balancer can only add, never subtract, so keep the fixed meals at
    // ~70% of both targets — that guarantees a positive remainder to solve for.
    const cap = 0.7;
    const scale = Math.min(
        1,
        fixedProtein > 0 ? (cap * protein) / fixedProtein : 1,
        fixedCalories > 0 ? (cap * calories) / fixedCalories : 1,
    );
    if (scale < 1) {
        for (const m of meals) {
            for (const ing of m.ingredients) ing.amount *= scale;
            m.totalNutrition = calculateNutrition(m.ingredients);
        }
        fixedProtein = meals.reduce((s, m) => s + m.totalNutrition.protein, 0);
        fixedCalories = meals.reduce((s, m) => s + m.totalNutrition.calories, 0);
    }

    meals.push(buildBalancerMeal(strictness, protein - fixedProtein, calories - fixedCalories));
    return meals;
}

export function generateDailyPlan(params: {
    protein: number;
    calories: number;
    strictness: Track;
    mealsPerDay: number;
}): DailyPlan {
    const { protein, calories, strictness, mealsPerDay } = params;
    const proteinPerMeal = protein / Math.max(mealsPerDay, 1);

    const meals: Meal[] = [];
    for (let i = 0; i < mealsPerDay; i++) {
        meals.push(generateMeal(strictness, proteinPerMeal));
    }

    const totalNutrition: Nutrition = {
        calories: meals.reduce((s, m) => s + m.totalNutrition.calories, 0),
        protein: meals.reduce((s, m) => s + m.totalNutrition.protein, 0),
        carbs: meals.reduce((s, m) => s + m.totalNutrition.carbs, 0),
        fiber: meals.reduce((s, m) => s + m.totalNutrition.fiber, 0),
        fat: meals.reduce((s, m) => s + m.totalNutrition.fat, 0),
    };

    return { meals, totalNutrition, targets: { protein, calories, strictness, mealsPerDay } };
}

export function buildGroceryList(meals: Meal[]): Array<{ label: string; amount: number; unit: string }> {
    const totals = new Map<string, { label: string; amount: number; unit: string }>();

    for (const meal of meals) {
        for (const item of meal.ingredients) {
            const ing = INGREDIENTS.find((i) => i.id === item.ingredientId);
            const key = `${item.ingredientId}__${item.unit}`;
            if (totals.has(key)) {
                totals.get(key)!.amount += item.amount;
            } else {
                totals.set(key, {
                    label: ing?.name ?? item.ingredientId,
                    amount: item.amount,
                    unit: item.unit,
                });
            }
        }
    }

    return Array.from(totals.values()).map((v) => ({ ...v, amount: Math.round(v.amount * 100) / 100 }));
}
