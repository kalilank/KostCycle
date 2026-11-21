// Curated real photographs. Local assets only; uploads always take precedence.
// Full source pages and photographer credits are retained for reproducibility.
const entries = [
  [
    "wooden-chair",
    11112728,
    "a-brown-wooden-chair-on-a-white-surface",
    "Ksenia Chernaya",
  ],
  [
    "room-chair",
    7193628,
    "wooden-chair-in-a-room-with-white-walls",
    "Kaboompics",
  ],
  [
    "study-desk",
    28539226,
    "minimalist-wooden-desk-in-modern-interior",
    "Damm aaaa",
  ],
  [
    "bookshelf",
    16689597,
    "a-shelf-with-books-and-pictures-on-it",
    "Czapp Árpád",
  ],
  ["single-bed", 19878532, "small-bedroom-with-a-single-bed", "Lisa Anna"],
  ["wall-mirror", 19595923, "mirror-on-a-wall", "Aljona Ovtšinnikova"],
  [
    "desk-lamp",
    19240054,
    "black-and-white-photo-of-a-desk-lamp",
    "juliane Monari",
  ],
  ["study-lamp", 19844043, "glowing-desk-lamp", "Shan Nir"],
  [
    "orange-lamp",
    8872665,
    "a-lamp-beside-a-stack-of-documents-on-a-wooden-desk",
    "MART PRODUCTION",
  ],
  ["room-fan", 10973638, "an-electric-fan-in-a-room", "Fariborz MP"],
  ["window-fan", 6000678, "electric-fan-by-the-window", "Dương Nhân"],
  [
    "metal-fan",
    4102862,
    "close-up-shot-of-a-vintage-electric-fan",
    "Luke Yanko",
  ],
  [
    "laundry-basket",
    15336637,
    "basket-on-white-background",
    "William Camilo Agudelo Garzon",
  ],
  [
    "storage-boxes",
    13968287,
    "close-up-of-two-plastic-containers",
    "Ibrahim Plastic Industry (IPI)",
  ],
  [
    "fabric-storage",
    38774571,
    "flat-lay-of-wooden-hangers-and-storage-box",
    "Letícia Alvares",
  ],
  ["ceramic-mug", 6312133, "ceramic-mug-on-white-table", "KATRIN BOLOVTSOVA"],
  [
    "white-mug",
    6312237,
    "white-ceramic-mug-on-white-table",
    "KATRIN BOLOVTSOVA",
  ],
  [
    "electric-kettle",
    30319694,
    "modern-electric-kettle-with-glass-body-and-tea-infuser",
    "Mohammad abasi",
  ],
  [
    "rice-cooker",
    31479830,
    "cozy-rustic-kitchen-with-rice-cooker-and-flowers",
    "Pew Nguyen",
  ],
  ["cooking-pan", 6126978, "cooking-in-hot-black-pan", "Rachel Claire"],
  ["kitchen-utensils", 9475254, "wooden-kitchen-utensils", "Greta Hoffman"],
  [
    "headphones",
    30428610,
    "black-studio-headphones-on-white-background",
    "Vladislav Anchuk",
  ],
  [
    "wireless-mouse",
    13870516,
    "photograph-of-a-black-wireless-mouse",
    "Matheus Bertelli",
  ],
  [
    "keyboard",
    4088255,
    "white-computer-keyboard-in-close-up-shot",
    "Christian Naccarato",
  ],
  [
    "speaker",
    31341733,
    "portable-bluetooth-speaker-on-sandy-beach",
    "Juan Camilo Trujillo Botero",
  ],
  ["notebooks", 7718812, "a-stack-of-notebooks", "MART PRODUCTION"],
  [
    "calculator",
    36488453,
    "calculator-and-notebook-on-study-desk",
    "Jahra Tasfia Reza",
  ],
  ["hangers", 14560435, "wooden-hangers-in-wardrobe", "Herlina Widyastuti"],
  [
    "soft-furnishings",
    28536452,
    "cozy-living-room-interior-with-books-and-blanket",
    "Glow Club",
  ],
  [
    "tableware",
    6739695,
    "overhead-shot-of-ceramic-plates-and-bowls",
    "cottonbro studio",
  ],
  ["cables", 4219868, "close-up-photo-of-usb-cable", "Kaboompics"],
  [
    "umbrella",
    15976643,
    "a-white-and-yellow-umbrella-lying-on-the-ground",
    "Beyzaa Yurtkuran",
  ],
  ["woven-rug", 15291102, "pattern-on-texture", "Valeria Boltneva"],
  ["curtains", 10961672, "a-white-window-curtain", "Nicole Queiroz"],
  [
    "laptop-stand",
    34502067,
    "modern-workspace-with-laptop-and-notebook",
    "Karina Finger",
  ],
  [
    "water-bottle",
    34140882,
    "stainless-steel-water-bottle-on-picnic-table-in-autumn",
    "Ninety Seven Years",
  ],
];
export const productPhotos = entries.map(([key, id, slug, photographer]) => ({
  key,
  id,
  src: `/products/${key}.jpg`,
  source: `https://www.pexels.com/photo/${slug}-${id}/`,
  download: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&fm=jpg&w=960&h=960&fit=crop&q=78`,
  photographer,
  license: "https://www.pexels.com/license/",
}));
const photos = Object.fromEntries(
  productPhotos.map((photo) => [photo.key, photo]),
);
const defaults = {
  Furniture: ["study-desk", "room-chair", "wooden-chair", "bookshelf"],
  Lamps: ["desk-lamp", "study-lamp", "orange-lamp"],
  Fans: ["room-fan", "window-fan", "metal-fan"],
  Storage: ["storage-boxes", "fabric-storage", "laundry-basket"],
  Kitchen: ["kitchen-utensils", "ceramic-mug", "white-mug"],
  Electronics: ["laptop-stand"],
  "Other Essentials": ["notebooks", "soft-furnishings", "hangers"],
};
const types = [
  [/whiteboard|notice board|ruler|stationery|binder|notebook/i, ["notebooks"]],
  [/lamp|light/i, ["desk-lamp", "study-lamp", "orange-lamp"]],
  [/fan/i, ["room-fan", "window-fan", "metal-fan"]],
  [/rice cooker/i, ["rice-cooker"]],
  [/kettle/i, ["electric-kettle"]],
  [/mug|cup/i, ["ceramic-mug", "white-mug"]],
  [/bowl|plate/i, ["tableware"]],
  [/water bottle/i, ["water-bottle"]],
  [/cable|hub|power strip/i, ["cables"], "Electronics"],
  [/laptop|phone stand|webcam|clock/i, ["laptop-stand"], "Electronics"],
  [/umbrella/i, ["umbrella"]],
  [/rug|\bmat\b/i, ["woven-rug"]],
  [/curtain/i, ["curtains"]],
  [/pan|pot\b/i, ["cooking-pan"]],
  [
    /spatula|utensil|cutlery|knife|board|rack.*dish|dish.*rack/i,
    ["kitchen-utensils"],
  ],
  [/headphone|headset/i, ["headphones"]],
  [/mouse/i, ["wireless-mouse"]],
  [/keyboard/i, ["keyboard"]],
  [/speaker/i, ["speaker"]],
  [/calculator/i, ["calculator"]],
  [/mirror/i, ["wall-mirror"]],
  [/bed frame/i, ["single-bed"]],
  [/bookshelf|shelf|shelves|bookend|cart/i, ["bookshelf"]],
  [/chair|stool|bench/i, ["wooden-chair", "room-chair"]],
  [/desk|table/i, ["study-desk"], "Furniture"],
  [/hanger|clothes rack|drying rack/i, ["hangers"]],
  [/laundry|basket|pegs/i, ["laundry-basket"]],
  [/fabric|under-bed|organizer|drawer/i, ["fabric-storage", "storage-boxes"]],
  [/box|container|bin/i, ["storage-boxes"]],
  [/pillow|sleeve|bag/i, ["soft-furnishings"]],
  [/book|binder|ruler|board|stationery/i, ["notebooks"]],
];
function stableIndex(value, length) {
  let hash = 0;
  for (const char of String(value || ""))
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % length;
}
export function illustrativePhoto(item) {
  const options = types.find(
    ([pattern, , category]) =>
      (!category || category === item.category) &&
      pattern.test(item.name || ""),
  )?.[1] ||
    defaults[item.category] || ["notebooks"];
  return photos[
    options[stableIndex(item.seed_key || item.id || item.name, options.length)]
  ];
}
export function productPhoto(item) {
  const upload = item.image || item.image_data;
  return upload
    ? { src: upload, illustrative: false, label: "Seller photo" }
    : {
        ...illustrativePhoto(item),
        illustrative: true,
        label: item.is_demo
          ? "Illustrative demo photo"
          : "Illustrative photo · ask seller for actual photos",
      };
}
