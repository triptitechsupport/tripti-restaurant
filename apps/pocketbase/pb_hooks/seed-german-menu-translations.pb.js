/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess((e) => {
  try {
    // Get all menu items from the database
    const menuItems = $app.findRecordsByFilter(
      "menu_items",
      "",
      "-created",
      500
    );

    // German translations mapping
    const translations = {
      // Breakfast
      "Pancakes": { nameDE: "Pfannkuchen", descriptionDE: "Fluffige Pfannkuchen mit Ahornsirup" },
      "French Toast": { nameDE: "Französischer Toast", descriptionDE: "Goldbraun geröstetes Brot mit Zimt" },
      "Omelette": { nameDE: "Omelett", descriptionDE: "Drei-Eier-Omelett mit Ihrer Wahl an Füllungen" },
      "Breakfast Burrito": { nameDE: "Frühstücks-Burrito", descriptionDE: "Gefüllt mit Eiern, Käse und Wurst" },
      
      // Appetizers
      "Spring Rolls": { nameDE: "Frühlingsrollen", descriptionDE: "Knusprige Gemüserollen mit süßer Chilisauce" },
      "Mozzarella Sticks": { nameDE: "Mozzarella-Sticks", descriptionDE: "Panierte Mozzarella-Sticks mit Marinara-Sauce" },
      "Chicken Wings": { nameDE: "Hähnchenflügel", descriptionDE: "Würzige Buffalo-Wings mit Ranch-Dressing" },
      "Nachos": { nameDE: "Nachos", descriptionDE: "Tortilla-Chips mit Käse, Jalapeños und Sauerrahm" },
      
      // Beverages
      "Coffee": { nameDE: "Kaffee", descriptionDE: "Frisch gebrühter Kaffee" },
      "Orange Juice": { nameDE: "Orangensaft", descriptionDE: "Frisch gepresster Orangensaft" },
      "Smoothie": { nameDE: "Smoothie", descriptionDE: "Gemischte Früchte-Smoothie" },
      "Iced Tea": { nameDE: "Eistee", descriptionDE: "Erfrischender Eistee mit Zitrone" },
      
      // Main Courses
      "Grilled Salmon": { nameDE: "Gegrillter Lachs", descriptionDE: "Atlantischer Lachs mit Zitronenbutter" },
      "Beef Steak": { nameDE: "Rindersteak", descriptionDE: "Premium-Rindersteak nach Ihrer Wahl gegart" },
      "Chicken Curry": { nameDE: "Hähnchen-Curry", descriptionDE: "Würziges Curry mit Basmatireis" },
      "Pasta Carbonara": { nameDE: "Pasta Carbonara", descriptionDE: "Cremige Carbonara mit Speck und Parmesan" },
      
      // Snacks
      "Fries": { nameDE: "Pommes Frites", descriptionDE: "Knusprige goldene Pommes" },
      "Onion Rings": { nameDE: "Zwiebelringe", descriptionDE: "Panierte Zwiebelringe" },
      "Popcorn": { nameDE: "Popcorn", descriptionDE: "Frisches Butter-Popcorn" },
      "Chips": { nameDE: "Chips", descriptionDE: "Verschiedene Kartoffelchips" },
      
      // Desserts
      "Chocolate Cake": { nameDE: "Schokoladenkuchen", descriptionDE: "Reichhaltiger Schokoladenkuchen" },
      "Ice Cream": { nameDE: "Eiscreme", descriptionDE: "Drei Kugeln Ihrer Wahl" },
      "Cheesecake": { nameDE: "Käsekuchen", descriptionDE: "New York Style Käsekuchen" },
      "Tiramisu": { nameDE: "Tiramisu", descriptionDE: "Klassisches italienisches Tiramisu" },
      
      // Sides & Accompaniments
      "Garlic Bread": { nameDE: "Knoblauchbrot", descriptionDE: "Geröstetes Brot mit Knoblauchbutter" },
      "Coleslaw": { nameDE: "Krautsalat", descriptionDE: "Frischer Krautsalat" },
      "Mashed Potatoes": { nameDE: "Kartoffelpüree", descriptionDE: "Cremiges Kartoffelpüree" },
      "Steamed Vegetables": { nameDE: "Gedämpftes Gemüse", descriptionDE: "Saisonales gedämpftes Gemüse" },
      
      // Kids Menu
      "Chicken Nuggets": { nameDE: "Hähnchen-Nuggets", descriptionDE: "Knusprige Hähnchen-Nuggets mit Pommes" },
      "Mini Pizza": { nameDE: "Mini-Pizza", descriptionDE: "Kleine Pizza mit Käse und Tomatensauce" },
      "Mac and Cheese": { nameDE: "Makkaroni mit Käse", descriptionDE: "Cremige Makkaroni mit Käse" },
      "Hot Dog": { nameDE: "Hot Dog", descriptionDE: "Klassischer Hot Dog mit Pommes" }
    };

    // Update each menu item with German translations
    menuItems.forEach((item) => {
      const itemName = item.getString("name");
      const translation = translations[itemName];
      
      if (translation) {
        item.set("nameDE", translation.nameDE);
        item.set("descriptionDE", translation.descriptionDE);
        $app.save(item);
      }
    });

    console.log("German translations seeded successfully for menu items");
  } catch (error) {
    console.error("Error seeding German translations:", error);
  }
  
  e.next();
}, "menu_items");