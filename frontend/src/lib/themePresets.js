// Category-based storefront theme presets. Presentation only — brand identity stays NEXORA.
export const THEME_PRESETS = {
  fashion_editorial: {
    name: "Fashion / Editorial",
    bg: "#FFFBF5",
    accent: "#17211B",
    headingFont: "font-display",
    aspect: "aspect-[3/4]",
    tone: "Editorial, tall imagery, runway elegance",
    tag: "Editorial",
  },
  cake_bakery_food: {
    name: "Cake & Bakery / Warm",
    bg: "#FFF8F0",
    accent: "#FF6B35",
    headingFont: "font-sans",
    aspect: "aspect-square",
    tone: "Warm & appetizing, artisanal highlights",
    tag: "Artisanal",
  },
  electronics_technical: {
    name: "Electronics / Technical",
    bg: "#F6FAF9",
    accent: "#10B981",
    headingFont: "font-mono",
    aspect: "aspect-square",
    tone: "Spec-forward, crisp technical grids",
    tag: "Tech",
  },
  beauty_elegant: {
    name: "Beauty / Elegant",
    bg: "#FDF8F6",
    accent: "#2DD4BF",
    headingFont: "font-sans",
    aspect: "aspect-[4/5]",
    tone: "Soft pastel, minimalist rituals",
    tag: "Elegant",
  },
  furniture_home: {
    name: "Furniture & Home / Interior",
    bg: "#F9F8F6",
    accent: "#17211B",
    headingFont: "font-sans",
    aspect: "aspect-[16/10]",
    tone: "Room-scale showcase, interior tones",
    tag: "Interior",
  },
  grocery_fresh: {
    name: "Grocery / Fresh",
    bg: "#ECFDF5",
    accent: "#10B981",
    headingFont: "font-sans",
    aspect: "aspect-square",
    tone: "Fresh & convenient, quick add",
    tag: "Fresh",
  },
  jewellery_luxury: {
    name: "Jewellery / Luxury",
    bg: "#FAF9F6",
    accent: "#F59E0B",
    headingFont: "font-display",
    aspect: "aspect-square",
    tone: "Luxury minimal, generous framing",
    tag: "Luxury",
  },
  sports_energetic: {
    name: "Sports / Energetic",
    bg: "#F3F6F5",
    accent: "#FF6B35",
    headingFont: "font-sans",
    aspect: "aspect-square",
    tone: "Bold, energetic, performance-forward",
    tag: "Performance",
  },
  books_editorial: {
    name: "Books / Editorial Catalog",
    bg: "#FFFDF9",
    accent: "#17211B",
    headingFont: "font-display",
    aspect: "aspect-[2/3]",
    tone: "Editorial catalog, author-forward",
    tag: "Catalog",
  },
};

export function getTheme(key) {
  return THEME_PRESETS[key] || THEME_PRESETS.fashion_editorial;
}

export const ALL_THEME_KEYS = Object.keys(THEME_PRESETS);

// Which presets are unlockable at each plan level (theme presentation is category-driven,
// but switching presets away from the default requires higher plans).
export const THEME_ACCESS = {
  essential: 1, // START: category default only
  all: 9, // GROW: all 9 presets
  premium: 9, // PRO: all + custom styling
};
