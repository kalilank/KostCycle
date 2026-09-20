// Reference options and estimates only. Marketplace records live in Supabase.
export const locations = [
  {
    id: "binus",
    name: "BINUS University",
    campuses: [
      {
        id: "alsut",
        name: "Alam Sutera",
        residences: [
          "Newton Kost",
          "Silkwood Residence",
          "Rukita Alam Sutera",
          "The Prominence",
          "Other",
        ],
      },
    ],
  },
];
export const residences = locations[0].campuses[0].residences;
export const categories = [
  "Fans",
  "Lamps",
  "Storage",
  "Furniture",
  "Kitchen",
  "Electronics",
  "Other Essentials",
];
export const weights = {
  Fans: 2.5,
  Lamps: 1,
  Storage: 1.2,
  Furniture: 5,
  Kitchen: 1,
  Electronics: 1.5,
  "Other Essentials": 1,
};
export const periods = ["Today", "Tomorrow", "This weekend"];
export const estimatedDistance = (residence) =>
  ({
    "Newton Kost": 150,
    "Silkwood Residence": 380,
    "Rukita Alam Sutera": 620,
    "The Prominence": 800,
    Other: 950,
  })[residence] ?? 950;
