/// <reference path="../pb_data/types.d.ts" />
onRecordEnrich((e) => {
  // This hook ensures that when menu items are read, the new fields are populated
  // from the old fields if they're empty
  const record = e.record;
  
  // If nameEN is empty, populate from name
  if (!record.get("nameEN") && record.get("name")) {
    record.set("nameEN", record.get("name"));
  }
  
  // If nameDE is empty, populate from name
  if (!record.get("nameDE") && record.get("name")) {
    record.set("nameDE", record.get("name"));
  }
  
  // If descriptionEN is empty, populate from description
  if (!record.get("descriptionEN") && record.get("description")) {
    record.set("descriptionEN", record.get("description"));
  }
  
  // If descriptionDE is empty, populate from description
  if (!record.get("descriptionDE") && record.get("description")) {
    record.set("descriptionDE", record.get("description"));
  }
  
  e.next();
}, "menu_items");

// Hook to populate allergies based on category when creating/updating
onRecordCreate((e) => {
  const category = e.record.get("category");
  const name = e.record.get("name") || e.record.get("nameEN") || "";
  
  // Default allergy mappings by category
  const allergyMap = {
    "Breakfast": "May contain: dairy, eggs, gluten, nuts",
    "Appetizers": "May contain: shellfish, dairy, gluten, nuts",
    "Beverages": "May contain: dairy, nuts",
    "Main Courses": "May contain: dairy, gluten, nuts, shellfish",
    "Snacks": "May contain: dairy, gluten, nuts, peanuts",
    "Desserts": "May contain: dairy, eggs, gluten, nuts, peanuts",
    "Sides & Accompaniments": "May contain: dairy, gluten, nuts",
    "Kids Menu": "May contain: dairy, eggs, gluten, nuts, peanuts"
  };
  
  // Set default allergies if not already set
  if (!e.record.get("allergies") && category) {
    e.record.set("allergies", allergyMap[category] || "Please inquire about allergens");
  }
  
  e.next();
}, "menu_items");

onRecordUpdate((e) => {
  const category = e.record.get("category");
  
  // Default allergy mappings by category
  const allergyMap = {
    "Breakfast": "May contain: dairy, eggs, gluten, nuts",
    "Appetizers": "May contain: shellfish, dairy, gluten, nuts",
    "Beverages": "May contain: dairy, nuts",
    "Main Courses": "May contain: dairy, gluten, nuts, shellfish",
    "Snacks": "May contain: dairy, gluten, nuts, peanuts",
    "Desserts": "May contain: dairy, eggs, gluten, nuts, peanuts",
    "Sides & Accompaniments": "May contain: dairy, gluten, nuts",
    "Kids Menu": "May contain: dairy, eggs, gluten, nuts, peanuts"
  };
  
  // Set default allergies if not already set
  if (!e.record.get("allergies") && category) {
    e.record.set("allergies", allergyMap[category] || "Please inquire about allergens");
  }
  
  e.next();
}, "menu_items");