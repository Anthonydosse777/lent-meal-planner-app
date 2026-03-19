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

function isTemplateAllowed(template: (typeof MEAL_TEMPLATES)[0], strictness: Track): boolean {
    for (const item of template.ingredients) {
        const ing = INGREDIENTS.find((i) => i.id === item.ingredientId);
        if (!ing) continue;
        if (strictness === "straight_vegan") {
            if (!ing.allowedIn.includes("strict") && !ing.allowedIn.includes("vegan_oil_restricted")) return false;
        } else if (strictness === "vegan_fish") {
            if (!ing.allowedIn.includes("vegan_fish") && !ing.allowedIn.includes("strict")) return false;
        }
        // unrestricted: allow all
    }
    return true;
}

function generateLocalMeal(strictness: Track, targetProtein?: number): Meal {
    let allowed = MEAL_TEMPLATES.filter((t) => isTemplateAllowed(t, strictness));
    if (allowed.length === 0) allowed = MEAL_TEMPLATES;

    const template = allowed[Math.floor(Math.random() * allowed.length)];
    const adjustedIngredients = template.ingredients.map((ing) => ({ ...ing }));

    // Boost protein source if needed
    if (targetProtein) {
        const current = calculateNutrition(adjustedIngredients);
        if (current.protein < targetProtein) {
            const proteinItem = adjustedIngredients.find((item) => {
                const data = INGREDIENTS.find((i) => i.id === item.ingredientId);
                return data && (data.category === "legume" || data.category === "fish" || ["seitan", "tofu_firm"].includes(data.id));
            });
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
