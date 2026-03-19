// ─── Types ────────────────────────────────────────────────────────────────────

export type Track = "straight_vegan" | "vegan_fish" | "unrestricted";

export interface Nutrition {
    calories: number;
    protein: number;
    carbs: number;
    fiber: number;
    fat: number;
}

export interface Ingredient {
    id: string;
    name: string;
    category: string;
    nutritionPer100g: Nutrition;
    defaultUnit: string;
    gramsPerUnit: number;
    allowedIn: string[];
    priceLevel: "low" | "medium" | "high";
}

export interface IngredientAmount {
    ingredientId: string;
    amount: number;
    unit: string;
}

export interface MealTemplate {
    title: string;
    description: string;
    ingredients: IngredientAmount[];
    instructions: string[];
    prepTime: number;
    cookTime: number;
    tags: string[];
    imageKeyword: string;
}

export interface Meal extends MealTemplate {
    id: string;
    totalNutrition: Nutrition;
    source: string;
}

export interface DailyPlan {
    meals: Meal[];
    totalNutrition: Nutrition;
    targets: {
        protein: number;
        calories: number;
        strictness: Track;
        mealsPerDay: number;
    };
}

// ─── Ingredients ──────────────────────────────────────────────────────────────

export const INGREDIENTS: Ingredient[] = [
    // Legumes
    { id: "fava_beans", name: "Fava Beans (Ful)", category: "legume", nutritionPer100g: { calories: 110, protein: 7.6, carbs: 19.6, fiber: 5.4, fat: 0.4 }, defaultUnit: "cup", gramsPerUnit: 170, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "lentils_brown", name: "Brown Lentils", category: "legume", nutritionPer100g: { calories: 116, protein: 9, carbs: 20, fiber: 7.9, fat: 0.4 }, defaultUnit: "cup", gramsPerUnit: 198, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "chickpeas", name: "Chickpeas", category: "legume", nutritionPer100g: { calories: 164, protein: 8.9, carbs: 27.4, fiber: 7.6, fat: 2.6 }, defaultUnit: "cup", gramsPerUnit: 164, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "red_lentils", name: "Red Lentils", category: "legume", nutritionPer100g: { calories: 116, protein: 9, carbs: 20, fiber: 7.9, fat: 0.4 }, defaultUnit: "cup", gramsPerUnit: 198, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "black_beans", name: "Black Beans", category: "legume", nutritionPer100g: { calories: 132, protein: 8.9, carbs: 23.7, fiber: 8.7, fat: 0.5 }, defaultUnit: "cup", gramsPerUnit: 172, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "kidney_beans", name: "Kidney Beans", category: "legume", nutritionPer100g: { calories: 127, protein: 8.7, carbs: 22.8, fiber: 6.4, fat: 0.5 }, defaultUnit: "cup", gramsPerUnit: 177, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "tofu_firm", name: "Firm Tofu", category: "other", nutritionPer100g: { calories: 83, protein: 10, carbs: 2, fiber: 1, fat: 5 }, defaultUnit: "oz", gramsPerUnit: 28, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    { id: "seitan", name: "Seitan", category: "other", nutritionPer100g: { calories: 104, protein: 21, carbs: 4, fiber: 0.5, fat: 0.5 }, defaultUnit: "oz", gramsPerUnit: 28, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    // Grains
    { id: "rice_white", name: "White Rice", category: "grain", nutritionPer100g: { calories: 130, protein: 2.7, carbs: 28, fiber: 0.4, fat: 0.3 }, defaultUnit: "cup", gramsPerUnit: 158, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "quinoa", name: "Quinoa", category: "grain", nutritionPer100g: { calories: 120, protein: 4.4, carbs: 21, fiber: 2.8, fat: 1.9 }, defaultUnit: "cup", gramsPerUnit: 185, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    { id: "pita_bread", name: "Pita Bread", category: "grain", nutritionPer100g: { calories: 275, protein: 9, carbs: 56, fiber: 2.2, fat: 1.2 }, defaultUnit: "piece", gramsPerUnit: 60, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "bulgur", name: "Bulgur", category: "grain", nutritionPer100g: { calories: 83, protein: 3, carbs: 18, fiber: 4.5, fat: 0.2 }, defaultUnit: "cup", gramsPerUnit: 182, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "oats", name: "Oats", category: "grain", nutritionPer100g: { calories: 389, protein: 16.9, carbs: 66, fiber: 10.6, fat: 6.9 }, defaultUnit: "cup", gramsPerUnit: 81, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    // Produce
    { id: "spinach", name: "Spinach", category: "produce", nutritionPer100g: { calories: 23, protein: 2.9, carbs: 3.6, fiber: 2.2, fat: 0.4 }, defaultUnit: "cup", gramsPerUnit: 30, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "tomato", name: "Tomato", category: "produce", nutritionPer100g: { calories: 18, protein: 0.9, carbs: 3.9, fiber: 1.2, fat: 0.2 }, defaultUnit: "medium", gramsPerUnit: 123, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "onion", name: "Onion", category: "produce", nutritionPer100g: { calories: 40, protein: 1.1, carbs: 9.3, fiber: 1.7, fat: 0.1 }, defaultUnit: "medium", gramsPerUnit: 110, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "garlic", name: "Garlic", category: "produce", nutritionPer100g: { calories: 149, protein: 6.4, carbs: 33, fiber: 2.1, fat: 0.5 }, defaultUnit: "clove", gramsPerUnit: 3, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "carrot", name: "Carrot", category: "produce", nutritionPer100g: { calories: 41, protein: 0.9, carbs: 9.6, fiber: 2.8, fat: 0.2 }, defaultUnit: "medium", gramsPerUnit: 61, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "parsley", name: "Parsley", category: "produce", nutritionPer100g: { calories: 36, protein: 3, carbs: 6.3, fiber: 3.3, fat: 0.8 }, defaultUnit: "cup", gramsPerUnit: 60, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "lemon", name: "Lemon Juice", category: "produce", nutritionPer100g: { calories: 22, protein: 0.4, carbs: 6.9, fiber: 0.3, fat: 0.2 }, defaultUnit: "tbsp", gramsPerUnit: 15, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "eggplant", name: "Eggplant", category: "produce", nutritionPer100g: { calories: 25, protein: 1, carbs: 6, fiber: 3, fat: 0.2 }, defaultUnit: "medium", gramsPerUnit: 548, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "okra", name: "Okra", category: "produce", nutritionPer100g: { calories: 33, protein: 1.9, carbs: 7.5, fiber: 3.2, fat: 0.2 }, defaultUnit: "cup", gramsPerUnit: 100, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    { id: "potato", name: "Potato", category: "produce", nutritionPer100g: { calories: 77, protein: 2, carbs: 17, fiber: 2.2, fat: 0.1 }, defaultUnit: "medium", gramsPerUnit: 173, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "bell_pepper", name: "Bell Pepper", category: "produce", nutritionPer100g: { calories: 20, protein: 0.9, carbs: 4.6, fiber: 1.7, fat: 0.2 }, defaultUnit: "medium", gramsPerUnit: 119, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    { id: "cucumber", name: "Cucumber", category: "produce", nutritionPer100g: { calories: 15, protein: 0.7, carbs: 3.6, fiber: 0.5, fat: 0.1 }, defaultUnit: "medium", gramsPerUnit: 200, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "broccoli", name: "Broccoli", category: "produce", nutritionPer100g: { calories: 34, protein: 2.8, carbs: 7, fiber: 2.6, fat: 0.4 }, defaultUnit: "cup", gramsPerUnit: 91, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    { id: "zucchini", name: "Zucchini", category: "produce", nutritionPer100g: { calories: 17, protein: 1.2, carbs: 3.1, fiber: 1, fat: 0.3 }, defaultUnit: "medium", gramsPerUnit: 196, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "cauliflower", name: "Cauliflower", category: "produce", nutritionPer100g: { calories: 25, protein: 1.9, carbs: 5, fiber: 2, fat: 0.3 }, defaultUnit: "cup", gramsPerUnit: 100, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    // Oils & Fats
    { id: "olive_oil", name: "Olive Oil", category: "oil", nutritionPer100g: { calories: 884, protein: 0, carbs: 0, fiber: 0, fat: 100 }, defaultUnit: "tbsp", gramsPerUnit: 14, allowedIn: ["strict", "vegan_fish"], priceLevel: "medium" },
    { id: "tahini", name: "Tahini", category: "oil", nutritionPer100g: { calories: 595, protein: 17, carbs: 21, fiber: 9.3, fat: 54 }, defaultUnit: "tbsp", gramsPerUnit: 15, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
    { id: "vegetable_oil", name: "Vegetable Oil", category: "oil", nutritionPer100g: { calories: 884, protein: 0, carbs: 0, fiber: 0, fat: 100 }, defaultUnit: "tbsp", gramsPerUnit: 14, allowedIn: ["strict", "vegan_fish"], priceLevel: "low" },
    // Fish
    { id: "tilapia", name: "Tilapia / White Fish", category: "fish", nutritionPer100g: { calories: 96, protein: 20, carbs: 0, fiber: 0, fat: 1.7 }, defaultUnit: "fillet", gramsPerUnit: 87, allowedIn: ["vegan_fish"], priceLevel: "medium" },
    { id: "salmon", name: "Salmon", category: "fish", nutritionPer100g: { calories: 208, protein: 20, carbs: 0, fiber: 0, fat: 13 }, defaultUnit: "fillet", gramsPerUnit: 100, allowedIn: ["vegan_fish"], priceLevel: "high" },
    { id: "shrimp", name: "Shrimp", category: "fish", nutritionPer100g: { calories: 99, protein: 24, carbs: 0.2, fiber: 0, fat: 0.3 }, defaultUnit: "oz", gramsPerUnit: 28, allowedIn: ["vegan_fish"], priceLevel: "high" },
    { id: "tuna_canned", name: "Canned Tuna (Water)", category: "fish", nutritionPer100g: { calories: 116, protein: 26, carbs: 0, fiber: 0, fat: 1 }, defaultUnit: "can", gramsPerUnit: 142, allowedIn: ["vegan_fish"], priceLevel: "low" },
    // Spices & Other
    { id: "cumin", name: "Cumin", category: "spice", nutritionPer100g: { calories: 375, protein: 18, carbs: 44, fiber: 10, fat: 22 }, defaultUnit: "tsp", gramsPerUnit: 2, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "coriander", name: "Coriander", category: "spice", nutritionPer100g: { calories: 298, protein: 12, carbs: 55, fiber: 41, fat: 18 }, defaultUnit: "tsp", gramsPerUnit: 2, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "salt", name: "Salt", category: "spice", nutritionPer100g: { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 }, defaultUnit: "tsp", gramsPerUnit: 6, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "pepper", name: "Black Pepper", category: "spice", nutritionPer100g: { calories: 251, protein: 10, carbs: 64, fiber: 25, fat: 3.3 }, defaultUnit: "tsp", gramsPerUnit: 2, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "cinnamon", name: "Cinnamon", category: "spice", nutritionPer100g: { calories: 247, protein: 4, carbs: 80, fiber: 53, fat: 1.2 }, defaultUnit: "tsp", gramsPerUnit: 2, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "turmeric", name: "Turmeric", category: "spice", nutritionPer100g: { calories: 354, protein: 7.8, carbs: 65, fiber: 21, fat: 9.9 }, defaultUnit: "tsp", gramsPerUnit: 2, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "vegetable_broth", name: "Vegetable Broth", category: "other", nutritionPer100g: { calories: 7, protein: 0.3, carbs: 1.4, fiber: 0.1, fat: 0 }, defaultUnit: "cup", gramsPerUnit: 240, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "low" },
    { id: "walnuts", name: "Walnuts", category: "other", nutritionPer100g: { calories: 654, protein: 15, carbs: 14, fiber: 6.7, fat: 65 }, defaultUnit: "oz", gramsPerUnit: 28, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "high" },
    { id: "almonds", name: "Almonds", category: "other", nutritionPer100g: { calories: 579, protein: 21, carbs: 22, fiber: 12.5, fat: 50 }, defaultUnit: "oz", gramsPerUnit: 28, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "high" },
    { id: "flax_seed", name: "Flax Seed", category: "other", nutritionPer100g: { calories: 534, protein: 18, carbs: 29, fiber: 27, fat: 42 }, defaultUnit: "tbsp", gramsPerUnit: 10, allowedIn: ["strict", "vegan_fish", "vegan_oil_restricted"], priceLevel: "medium" },
];

// ─── Meal Templates ───────────────────────────────────────────────────────────

export const MEAL_TEMPLATES: MealTemplate[] = [
    {
        title: "Classic Ful Medames",
        description: "Traditional Egyptian fava bean stew with olive oil, lemon, and cumin.",
        ingredients: [
            { ingredientId: "fava_beans", amount: 1.5, unit: "cup" },
            { ingredientId: "olive_oil", amount: 1, unit: "tbsp" },
            { ingredientId: "lemon", amount: 1, unit: "tbsp" },
            { ingredientId: "parsley", amount: 0.25, unit: "cup" },
            { ingredientId: "pita_bread", amount: 2, unit: "piece" },
            { ingredientId: "cumin", amount: 0.5, unit: "tsp" },
        ],
        instructions: [
            "Heat fava beans in a pot with a splash of water.",
            "Mash slightly with a fork or potato masher.",
            "Stir in olive oil, lemon juice, salt, and cumin.",
            "Serve warm topped with chopped parsley and warm pita bread.",
        ],
        prepTime: 5,
        cookTime: 10,
        tags: ["Egyptian", "Breakfast", "High Protein", "Vegan"],
        imageKeyword: "fava+beans,egyptian+food",
    },
    {
        title: "Lentil Soup (Shorbet Ads)",
        description: "Hearty red lentil soup with cumin and onions.",
        ingredients: [
            { ingredientId: "red_lentils", amount: 1.25, unit: "cup" },
            { ingredientId: "onion", amount: 1, unit: "medium" },
            { ingredientId: "carrot", amount: 1, unit: "medium" },
            { ingredientId: "olive_oil", amount: 1, unit: "tbsp" },
            { ingredientId: "lemon", amount: 0.5, unit: "tbsp" },
            { ingredientId: "cumin", amount: 1, unit: "tsp" },
        ],
        instructions: [
            "Saute chopped onion in olive oil until translucent.",
            "Add washed red lentils and 4 cups of water/vegetable broth.",
            "Simmer for 20 minutes until lentils are soft.",
            "Blend if smooth texture desired, season with cumin and salt.",
            "Serve with a squeeze of lemon.",
        ],
        prepTime: 10,
        cookTime: 25,
        tags: ["Middle Eastern", "Soup", "Lunch", "Vegan"],
        imageKeyword: "lentil+soup,bowl",
    },
    {
        title: "Mujadara",
        description: "Lentils and rice with caramelized onions.",
        ingredients: [
            { ingredientId: "lentils_brown", amount: 1, unit: "cup" },
            { ingredientId: "rice_white", amount: 1, unit: "cup" },
            { ingredientId: "onion", amount: 2, unit: "medium" },
            { ingredientId: "olive_oil", amount: 2, unit: "tbsp" },
            { ingredientId: "cumin", amount: 0.5, unit: "tsp" },
        ],
        instructions: [
            "Cook lentils in water until half-done (about 10 mins).",
            "Add rice to the lentils and continue cooking until both are tender.",
            "Meanwhile, slice onions thinly and fry in olive oil until dark brown and crispy.",
            "Mix half the onions into the rice/lentils and top with the rest.",
        ],
        prepTime: 15,
        cookTime: 30,
        tags: ["Middle Eastern", "Dinner", "High Protein", "Vegan"],
        imageKeyword: "lentils+rice,mujadara",
    },
    {
        title: "Egyptian Okra (Bamya)",
        description: "Okra stewed in a rich tomato and garlic sauce.",
        ingredients: [
            { ingredientId: "okra", amount: 2, unit: "cup" },
            { ingredientId: "tomato", amount: 2, unit: "medium" },
            { ingredientId: "garlic", amount: 3, unit: "clove" },
            { ingredientId: "onion", amount: 1, unit: "medium" },
            { ingredientId: "olive_oil", amount: 1.5, unit: "tbsp" },
            { ingredientId: "rice_white", amount: 1, unit: "cup" },
        ],
        instructions: [
            "Saute onions and garlic in olive oil.",
            "Add tomatoes and cook until soft.",
            "Add okra and a bit of water/broth, simmer for 15-20 mins.",
            "Serve with white rice.",
        ],
        prepTime: 10,
        cookTime: 25,
        tags: ["Egyptian", "Dinner", "Vegan"],
        imageKeyword: "okra+stew,vegetable+curry",
    },
    {
        title: "Seitan Shawarma Style",
        description: "High-protein seitan strips with Middle Eastern spices.",
        ingredients: [
            { ingredientId: "seitan", amount: 6, unit: "oz" },
            { ingredientId: "bell_pepper", amount: 1, unit: "medium" },
            { ingredientId: "onion", amount: 0.5, unit: "medium" },
            { ingredientId: "tahini", amount: 2, unit: "tbsp" },
            { ingredientId: "pita_bread", amount: 1, unit: "piece" },
            { ingredientId: "cumin", amount: 1, unit: "tsp" },
        ],
        instructions: [
            "Slice seitan and veggies into thin strips.",
            "Saute in a pan until browned and veggies are tender.",
            "Season with cumin, salt, and pepper.",
            "Serve in pita with a drizzle of tahini sauce.",
        ],
        prepTime: 10,
        cookTime: 15,
        tags: ["High Protein", "Middle Eastern", "Vegan"],
        imageKeyword: "shawarma+wrap,middle+eastern+food",
    },
    {
        title: "Grilled Salmon with Quinoa",
        description: "Fast-friendly fish option with nutrient-dense quinoa.",
        ingredients: [
            { ingredientId: "salmon", amount: 1.5, unit: "fillet" },
            { ingredientId: "quinoa", amount: 1, unit: "cup" },
            { ingredientId: "spinach", amount: 2, unit: "cup" },
            { ingredientId: "lemon", amount: 1, unit: "tbsp" },
            { ingredientId: "olive_oil", amount: 1, unit: "tbsp" },
        ],
        instructions: [
            "Cook quinoa according to package instructions.",
            "Season salmon with salt, pepper, and lemon, then grill or pan-sear.",
            "Saute spinach lightly in olive oil.",
            "Serve salmon over quinoa with spinach on the side.",
        ],
        prepTime: 10,
        cookTime: 20,
        tags: ["Fish Allowed", "High Protein", "Dinner"],
        imageKeyword: "grilled+salmon,quinoa+bowl",
    },
    {
        title: "Mediterranean Chickpea Salad",
        description: "Refreshing salad with chickpeas, cucumbers, and tomatoes.",
        ingredients: [
            { ingredientId: "chickpeas", amount: 1.5, unit: "cup" },
            { ingredientId: "cucumber", amount: 1, unit: "medium" },
            { ingredientId: "tomato", amount: 1, unit: "medium" },
            { ingredientId: "parsley", amount: 0.5, unit: "cup" },
            { ingredientId: "tahini", amount: 1.5, unit: "tbsp" },
            { ingredientId: "lemon", amount: 1, unit: "tbsp" },
        ],
        instructions: [
            "Dice cucumber and tomato.",
            "Combine chickpeas and vegetables in a bowl.",
            "Whisk tahini and lemon juice with a splash of water for dressing.",
            "Toss everything together with chopped parsley.",
        ],
        prepTime: 15,
        cookTime: 0,
        tags: ["Quick", "No Cook", "Vegan", "Mediterranean"],
        imageKeyword: "chickpea+salad,mediterranean+bowl",
    },
    {
        title: "Spiced Cauliflower & Chickpea Bowl",
        description: "Roasted cauliflower and chickpeas over bulgur with tahini drizzle.",
        ingredients: [
            { ingredientId: "cauliflower", amount: 2, unit: "cup" },
            { ingredientId: "chickpeas", amount: 1, unit: "cup" },
            { ingredientId: "bulgur", amount: 1, unit: "cup" },
            { ingredientId: "tahini", amount: 2, unit: "tbsp" },
            { ingredientId: "turmeric", amount: 1, unit: "tsp" },
            { ingredientId: "cumin", amount: 0.5, unit: "tsp" },
            { ingredientId: "olive_oil", amount: 1.5, unit: "tbsp" },
        ],
        instructions: [
            "Toss cauliflower and chickpeas in olive oil, turmeric, and cumin.",
            "Roast at 425F for 25 minutes until golden.",
            "Cook bulgur per package instructions.",
            "Serve roasted veggies over bulgur, drizzle with tahini.",
        ],
        prepTime: 10,
        cookTime: 30,
        tags: ["Vegan", "Bowl", "High Fiber", "Mediterranean"],
        imageKeyword: "roasted+cauliflower,grain+bowl",
    },
    {
        title: "Tuna & White Bean Bowl",
        description: "Protein-packed tuna with creamy white beans and lemon.",
        ingredients: [
            { ingredientId: "tuna_canned", amount: 1, unit: "can" },
            { ingredientId: "kidney_beans", amount: 1, unit: "cup" },
            { ingredientId: "cucumber", amount: 1, unit: "medium" },
            { ingredientId: "lemon", amount: 2, unit: "tbsp" },
            { ingredientId: "parsley", amount: 0.25, unit: "cup" },
            { ingredientId: "olive_oil", amount: 1, unit: "tbsp" },
        ],
        instructions: [
            "Drain and rinse tuna and beans.",
            "Dice cucumber and chop parsley.",
            "Combine all ingredients in a bowl.",
            "Dress with lemon juice, olive oil, salt, and pepper.",
        ],
        prepTime: 10,
        cookTime: 0,
        tags: ["Fish Allowed", "High Protein", "Quick", "No Cook"],
        imageKeyword: "tuna+bowl,protein+bowl",
    },
];
