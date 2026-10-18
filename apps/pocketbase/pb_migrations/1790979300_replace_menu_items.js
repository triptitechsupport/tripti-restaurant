/// <reference path="../pb_data/types.d.ts" />

// Replace the entire menu with the user-specified item list across 10 new
// categories. Historical orders / KOTs / billing are unaffected because they
// store item data as JSON snapshots, not relations. The only relation to
// menu_items is stock_items.menuItem (optional, cascadeDelete off) — those
// links are cleared first so deletion cannot fail on dangling references.
// Stock items themselves, accounts, permissions, and all other data are
// preserved.

migrate(
  (app) => {
    // 1. Unlink any stock_items.menuItem references so menu_items rows can be
    //    deleted without relation errors. The menuItem field is optional.
    const stockItemsCol = app.findCollectionByNameOrId("stock_items");
    let stockItems = [];
    try {
      stockItems = app.findAllRecords(stockItemsCol);
    } catch (_) {
      stockItems = [];
    }
    for (const si of stockItems) {
      if (si.get("menuItem")) {
        si.set("menuItem", "");
        app.save(si);
      }
    }

    // 2. Delete ALL existing menu_items records.
    const menuCol = app.findCollectionByNameOrId("menu_items");
    let existingItems = [];
    try {
      existingItems = app.findAllRecords(menuCol);
    } catch (_) {
      existingItems = [];
    }
    for (const mi of existingItems) {
      app.delete(mi);
    }

    // 3. Re-seed the categories collection with the new 10 categories.
    //    (Clear old category records first; the collection itself already
    //    exists, so we only swap its rows.)
    const catCol = app.findCollectionByNameOrId("categories");
    let oldCats = [];
    try {
      oldCats = app.findAllRecords(catCol);
    } catch (_) {
      oldCats = [];
    }
    for (const c of oldCats) {
      app.delete(c);
    }

    const newCats = [
      { name: "Appetizers", name_de: "Vorspeisen", display_order: 1, print_order: 1 },
      { name: "South Indian Classics", name_de: "Südindische Klassiker", display_order: 2, print_order: 2 },
      { name: "Biryani", name_de: "Biryani", display_order: 3, print_order: 3 },
      { name: "Curries", name_de: "Currys", display_order: 4, print_order: 4 },
      { name: "Thalis", name_de: "Thalis", display_order: 5, print_order: 5 },
      { name: "Soups", name_de: "Suppen", display_order: 6, print_order: 6 },
      { name: "Salads", name_de: "Salate", display_order: 7, print_order: 7 },
      { name: "Drinks", name_de: "Getränke", display_order: 8, print_order: 8 },
      { name: "Desserts", name_de: "Desserts", display_order: 9, print_order: 9 },
      { name: "One-pot rice specials", name_de: "Reis-Eintopf-Spezialitäten", display_order: 10, print_order: 10 },
    ];
    for (const data of newCats) {
      const r = new Record(catCol);
      r.set("name", data.name);
      r.set("name_de", data.name_de);
      r.set("display_order", data.display_order);
      r.set("print_order", data.print_order);
      app.save(r);
    }

    // 4. Seed the new menu items. nameEN/descriptionEN are the source of truth;
    //    name/description (legacy) mirror them. NV items are non-vegetarian;
    //    E (egg) items are treated as non-vegetarian. All others vegetarian.
    //    All items are created active (availability = true).
    const items = [
      // ── Appetizers (all served with mint chutney) ──
      { cat: "Appetizers", en: "Chicken Pakoda NV", de: "Chicken Pakoda NV", descEn: "Crispy spiced chicken fritters, served with mint chutney.", descDe: "Knusprige, gewürzte Hähnchenfrittier, serviert mit Minzchutney.", price: 8.50, veg: false },
      { cat: "Appetizers", en: "Onion Pakoda", de: "Onion Pakoda", descEn: "Golden fried onion fritters with herbs and spices, served with mint chutney.", descDe: "Goldbraun gebratene Zwiebelfrittier mit Kräutern und Gewürzen, serviert mit Minzchutney.", price: 5.90, veg: true },
      { cat: "Appetizers", en: "Sabji Pakoda", de: "Sabji Pakoda", descEn: "Assorted vegetable fritters in spiced gram flour, served with mint chutney.", descDe: "Gemischte Gemüsefrittier in gewürztem Kichererbsenmehl, serviert mit Minzchutney.", price: 5.90, veg: true },
      { cat: "Appetizers", en: "Paneer Bajji", de: "Paneer Bajji", descEn: "Indian cottage cheese slices in a spiced batter, served with mint chutney.", descDe: "Indischer Frischkäse in gewürztem Teig, serviert mit Minzchutney.", price: 6.90, veg: true },
      { cat: "Appetizers", en: "Aloo Bajji", de: "Aloo Bajji", descEn: "Spiced potato slices dipped in batter and fried, served with mint chutney.", descDe: "Gewürzte Kartoffelscheiben im Teig frittiert, serviert mit Minzchutney.", price: 5.50, veg: true },
      { cat: "Appetizers", en: "Mirchi Bajji", de: "Mirchi Bajji", descEn: "Green chilies stuffed and fried in a spiced batter, served with mint chutney.", descDe: "Gefüllte grüne Chilis in gewürztem Teig frittiert, serviert mit Minzchutney.", price: 5.90, veg: true },
      { cat: "Appetizers", en: "Egg Bajji E", de: "Egg Bajji E", descEn: "Hard-boiled eggs in spiced batter, fried golden, served with mint chutney.", descDe: "Hartgekochte Eier in gewürztem Teig goldbraun frittiert, serviert mit Minzchutney.", price: 6.50, veg: false },

      // ── South Indian Classics ──
      { cat: "South Indian Classics", en: "Idly", de: "Idly", descEn: "Steamed rice cakes served with sambar and peanut, coconut, ginger and tomato chutneys.", descDe: "Gedämpfte Reisküchlein, serviert mit Sambar und Erdnuss-, Kokos-, Ingwer- und Tomatenchutney.", price: 7.50, veg: true },
      { cat: "South Indian Classics", en: "Plain Dosa", de: "Plain Dosa", descEn: "Crispy rice and lentil crepe served with chutney and sambar.", descDe: "Knuspriger Reis-Linsen-Crêpe, serviert mit Chutney und Sambar.", price: 8.50, veg: true },
      { cat: "South Indian Classics", en: "Masala Dosa", de: "Masala Dosa", descEn: "Crispy dosa stuffed with spiced potato masala, served with chutney and sambar.", descDe: "Knusprige Dosa gefüllt mit gewürztem Kartoffelmasala, serviert mit Chutney und Sambar.", price: 9.90, veg: true },
      { cat: "South Indian Classics", en: "Pesarattu", de: "Pesarattu", descEn: "Green gram savoury pancake served with upma.", descDe: "Herzhafter Pfannkuchen aus Mungbohnen, serviert mit Upma.", price: 9.50, veg: true },
      { cat: "South Indian Classics", en: "Garelu", de: "Garelu", descEn: "Crispy lentil vadas served with chutney.", descDe: "Knusprige Linsen-Vadas, serviert mit Chutney.", price: 7.90, veg: true },
      { cat: "South Indian Classics", en: "Masala Vada", de: "Masala Vada", descEn: "Spiced chana dal vadas with onion and herbs.", descDe: "Gewürzte Chana-Dal-Vadas mit Zwiebeln und Kräutern.", price: 7.90, veg: true },
      { cat: "South Indian Classics", en: "Idiyappam", de: "Idiyappam", descEn: "Delicate rice flour string hoppers.", descDe: "Zarte Reisnudel-Nester aus Reismehl.", price: 8.50, veg: true },
      { cat: "South Indian Classics", en: "Appam", de: "Appam", descEn: "Lacy soft rice pancakes with a tender centre.", descDe: "Zarte Reispfannkuchen mit weicher Mitte.", price: 8.50, veg: true },
      { cat: "South Indian Classics", en: "Mini Tiffin", de: "Mini Tiffin", descEn: "Small portions of dosa, idly, vada, kesari and pongal.", descDe: "Kleine Portionen von Dosa, Idly, Vada, Kesari und Pongal.", price: 11.90, veg: true },

      // ── Biryani ──
      { cat: "Biryani", en: "Veg dum Biryani", de: "Veg dum Biryani", descEn: "Fragrant basmati rice layered with vegetables and spices, served with raita.", descDe: "Duftender Basmati-Reis mit Gemüse und Gewürzen, serviert mit Raita.", price: 14.50, veg: true },
      { cat: "Biryani", en: "Chicken dum Biryani NV", de: "Chicken dum Biryani NV", descEn: "Basmati rice layered with spiced chicken, cooked dum-style, served with raita.", descDe: "Basmati-Reis mit gewürztem Hähnchen, im Dum-Stil gegart, serviert mit Raita.", price: 16.90, veg: false },
      { cat: "Biryani", en: "Mutton dum Biryani NV", de: "Mutton dum Biryani NV", descEn: "Basmati rice layered with tender spiced mutton, served with raita.", descDe: "Basmati-Reis mit zartem gewürztem Lammfleisch, serviert mit Raita.", price: 18.50, veg: false },

      // ── Curries ──
      { cat: "Curries", en: "Butter Chicken NV", de: "Butter Chicken NV", descEn: "Tender chicken in a rich, creamy tomato sauce with aromatic spices.", descDe: "Zartes Hühnchen in einer reichhaltigen, cremigen Tomatensauce mit aromatischen Gewürzen.", price: 17.90, veg: false },
      { cat: "Curries", en: "Kadai Paneer", de: "Kadai Paneer", descEn: "Paneer and peppers cooked in a spicy kadai masala.", descDe: "Paneer und Paprika in würziger Kadai-Masala gegart.", price: 15.90, veg: true },
      { cat: "Curries", en: "Mutton Marag NV", de: "Mutton Marag NV", descEn: "Hyderabadi-style mutton stew, served with Idiyappam or Appam.", descDe: "Lamm-Eintopf nach Hyderabadi-Art, serviert mit Idiyappam oder Appam.", price: 19.50, veg: false },

      // ── Thalis ──
      { cat: "Thalis", en: "Veg Thali", de: "Veg Thali", descEn: "Dal with veg, a fry, white rice, sambar, sweet and pickle.", descDe: "Dal mit Gemüse, einer Beilage, weißem Reis, Sambar, Süßigkeit und Pickle.", price: 16.50, veg: true },
      { cat: "Thalis", en: "Non-Veg Thali NV", de: "Non-Veg Thali NV", descEn: "Curry, fry, white rice, rasam, sweet and pickle.", descDe: "Curry, Beilage, weißer Reis, Rasam, Süßigkeit und Pickle.", price: 18.90, veg: false },

      // ── Soups ──
      { cat: "Soups", en: "Dal Soup", de: "Dal-Suppe", descEn: "Light yellow lentil soup tempered with spices.", descDe: "Leichte gelbe Linsensuppe, mit Gewürzen abgeschmeckt.", price: 4.90, veg: true },
      { cat: "Soups", en: "Rasam", de: "Rasam", descEn: "Tangy spiced tamarind-pepper soup.", descDe: "Würzige Tamarinden-Pfeffer-Suppe.", price: 4.50, veg: true },
      { cat: "Soups", en: "Chicken Soup NV", de: "Chicken Soup NV", descEn: "Hearty chicken broth with aromatic spices.", descDe: "Herzhafte Hühnerbrühe mit aromatischen Gewürzen.", price: 5.90, veg: false },

      // ── Salads ──
      { cat: "Salads", en: "Tawa Chicken Salad NV", de: "Tawa Chicken Salad NV", descEn: "Grilled tawa chicken tossed with fresh salad greens.", descDe: "Gegrilltes Tawa-Hähnchen auf frischen Salatblättern.", price: 9.50, veg: false },
      { cat: "Salads", en: "Green Salad", de: "Green Salad", descEn: "Fresh seasonal greens with cucumber, tomato and onion.", descDe: "Frisches Saisongemüse mit Gurke, Tomate und Zwiebel.", price: 6.50, veg: true },

      // ── Drinks ──
      { cat: "Drinks", en: "Indian Tea", de: "Indischer Tee", descEn: "Spiced Indian tea brewed with milk.", descDe: "Gewürzter indischer Tee, mit Milch gebrüht.", price: 2.90, veg: true },
      { cat: "Drinks", en: "Sweet Lassi", de: "Sweet Lassi", descEn: "Chilled sweet yogurt drink.", descDe: "Gekühltes süßes Joghurtgetränk.", price: 3.90, veg: true },
      { cat: "Drinks", en: "Salt Lassi", de: "Salt Lassi", descEn: "Chilled salty yogurt drink with cumin.", descDe: "Gekühltes salziges Joghurtgetränk mit Kreuzkümmel.", price: 3.90, veg: true },
      { cat: "Drinks", en: "Mango Lassi", de: "Mango Lassi", descEn: "Chilled yogurt drink blended with sweet mango.", descDe: "Gekühltes Joghurtgetränk mit süßer Mango.", price: 4.50, veg: true },
      { cat: "Drinks", en: "Elderflower Juice (Holunder Saft)", de: "Elderflower Juice (Holunder Saft)", descEn: "Refreshing elderflower juice.", descDe: "Erfrischender Holundersaft.", price: 4.50, veg: true },

      // ── Desserts ──
      { cat: "Desserts", en: "Gulab Jamun", de: "Gulab Jamun", descEn: "Soft milk-solid dumplings soaked in rose-cardamom sugar syrup.", descDe: "Weiche Milchklöße in Rosen-Kardamom-Zuckersirup.", price: 5.90, veg: true },
      { cat: "Desserts", en: "Laddu", de: "Laddu", descEn: "Sweet gram flour balls with ghee and nuts.", descDe: "Süße Kichererbsenmehl-Kugeln mit Ghee und Nüssen.", price: 5.50, veg: true },
      { cat: "Desserts", en: "Rava Kesari", de: "Rava Kesari", descEn: "Semolina pudding with ghee, saffron and nuts.", descDe: "Grießpudding mit Ghee, Safran und Nüssen.", price: 5.90, veg: true },
      { cat: "Desserts", en: "Payasam", de: "Payasam", descEn: "Traditional rice and milk pudding with jaggery and nuts.", descDe: "Traditioneller Reis-Milch-Pudding mit Jaggery und Nüssen.", price: 6.50, veg: true },

      // ── One-pot rice specials ──
      { cat: "One-pot rice specials", en: "Dal Rice", de: "Dal Rice", descEn: "Rice cooked with spiced dal.", descDe: "Reis mit gewürztem Dal gekocht.", price: 9.90, veg: true },
      { cat: "One-pot rice specials", en: "Bisibelebath", de: "Bisibelebath", descEn: "Spicy rice and lentil dish with vegetables and tamarind.", descDe: "Würzige Reis-Linsen-Speise mit Gemüse und Tamarinde.", price: 10.90, veg: true },
      { cat: "One-pot rice specials", en: "Pongal", de: "Pongal", descEn: "Creamy rice and moong dal with pepper and ghee.", descDe: "Cremiger Reis mit Mungbohnen, Pfeffer und Ghee.", price: 9.50, veg: true },
      { cat: "One-pot rice specials", en: "Uppma & Kesari", de: "Uppma & Kesari", descEn: "Savoury semolina upma served with sweet rava kesari.", descDe: "Herzhaftes Grieß-Upma mit süßem Rava-Kesari.", price: 9.90, veg: true },
    ];

    for (const data of items) {
      const r = new Record(menuCol);
      r.set("nameEN", data.en);
      r.set("nameDE", data.de);
      r.set("name", data.en);
      r.set("descriptionEN", data.descEn);
      r.set("descriptionDE", data.descDe);
      r.set("description", data.descEn);
      r.set("price", data.price);
      r.set("category", data.cat);
      r.set("availability", true);
      r.set("isVegetarian", data.veg);
      app.save(r);
    }
  },
  (app) => {
    // Best-effort revert: the original menu items cannot be recreated from
    // here (their data was removed). Down only clears the newly seeded rows.
    const menuCol = app.findCollectionByNameOrId("menu_items");
    let rows = [];
    try {
      rows = app.findAllRecords(menuCol);
    } catch (_) {
      rows = [];
    }
    for (const r of rows) {
      app.delete(r);
    }
  },
);
