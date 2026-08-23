/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("menu_items");

  const record0 = new Record(collection);
    record0.set("name", "Idly");
    record0.set("description", "Steamed rice and lentil cakes, soft and fluffy. Traditional South Indian breakfast staple served with sambar and coconut chutney.");
    record0.set("category", "Breakfast");
    record0.set("price", 1);
    record0.set("availability", true);
    record0.set("isVegetarian", true);
  try {
    app.save(record0);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record1 = new Record(collection);
    record1.set("name", "Puttu");
    record1.set("description", "Cylindrical steamed cake made with rice flour and jaggery. Served with chickpea curry and banana. A Kerala specialty.");
    record1.set("category", "Breakfast");
    record1.set("price", 1);
    record1.set("availability", true);
    record1.set("isVegetarian", true);
  try {
    app.save(record1);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record2 = new Record(collection);
    record2.set("name", "Appam");
    record2.set("description", "Soft, fluffy rice pancakes with crispy edges. Made from fermented rice batter. Served with vegetable stew or chicken stew.");
    record2.set("category", "Breakfast");
    record2.set("price", 1);
    record2.set("availability", true);
    record2.set("isVegetarian", true);
  try {
    app.save(record2);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record3 = new Record(collection);
    record3.set("name", "Idiyappam");
    record3.set("description", "String hoppers made from rice flour and coconut milk. Steamed and served with sambar and chutney. Light and delicious.");
    record3.set("category", "Breakfast");
    record3.set("price", 1);
    record3.set("availability", true);
    record3.set("isVegetarian", true);
  try {
    app.save(record3);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record4 = new Record(collection);
    record4.set("name", "Masala Dosa");
    record4.set("description", "Crispy rice crepe filled with spiced potato and onion mixture. Served with sambar and coconut chutney. A breakfast favorite.");
    record4.set("category", "Breakfast");
    record4.set("price", 1);
    record4.set("availability", true);
    record4.set("isVegetarian", true);
  try {
    app.save(record4);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record5 = new Record(collection);
    record5.set("name", "Plain Ghee Roast Dosa");
    record5.set("description", "Thin, crispy dosa roasted with ghee. Golden and aromatic. Served with sambar and chutney.");
    record5.set("category", "Breakfast");
    record5.set("price", 1);
    record5.set("availability", true);
    record5.set("isVegetarian", true);
  try {
    app.save(record5);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record6 = new Record(collection);
    record6.set("name", "Paper Dosa");
    record6.set("description", "Ultra-thin, paper-like crispy dosa. Delicate and flavorful. Served with sambar and coconut chutney.");
    record6.set("category", "Breakfast");
    record6.set("price", 1);
    record6.set("availability", true);
    record6.set("isVegetarian", true);
  try {
    app.save(record6);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record7 = new Record(collection);
    record7.set("name", "Thattu Dosa");
    record7.set("description", "Thick, soft dosa cooked on a griddle. Served with sambar and chutney. A comfort breakfast choice.");
    record7.set("category", "Breakfast");
    record7.set("price", 1);
    record7.set("availability", true);
    record7.set("isVegetarian", true);
  try {
    app.save(record7);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record8 = new Record(collection);
    record8.set("name", "Vada (Meda Vada)");
    record8.set("description", "Deep-fried lentil donuts with a crispy exterior and soft interior. Spiced with cumin and black pepper. Served with sambar and chutney.");
    record8.set("category", "Breakfast");
    record8.set("price", 1);
    record8.set("availability", true);
    record8.set("isVegetarian", true);
  try {
    app.save(record8);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record9 = new Record(collection);
    record9.set("name", "Pongal");
    record9.set("description", "Savory rice and lentil dish cooked with ghee, cashews, and black pepper. A traditional South Indian breakfast delicacy.");
    record9.set("category", "Breakfast");
    record9.set("price", 1);
    record9.set("availability", true);
    record9.set("isVegetarian", true);
  try {
    app.save(record9);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record10 = new Record(collection);
    record10.set("name", "Paneer 65");
    record10.set("description", "Crispy fried paneer cubes tossed in spicy Indo-Chinese sauce with peppers and onions. Served hot and crunchy.");
    record10.set("category", "Appetizers");
    record10.set("price", 1);
    record10.set("availability", true);
    record10.set("isVegetarian", true);
  try {
    app.save(record10);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record11 = new Record(collection);
    record11.set("name", "Veg Manchurian");
    record11.set("description", "Vegetable fritters in a tangy and spicy Indo-Chinese sauce. Coated with sesame seeds and served with fried rice.");
    record11.set("category", "Appetizers");
    record11.set("price", 1);
    record11.set("availability", true);
    record11.set("isVegetarian", true);
  try {
    app.save(record11);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record12 = new Record(collection);
    record12.set("name", "Gobi Manchurian");
    record12.set("description", "Crispy cauliflower florets in a savory Indo-Chinese sauce with peppers and onions. A vegetarian favorite.");
    record12.set("category", "Appetizers");
    record12.set("price", 1);
    record12.set("availability", true);
    record12.set("isVegetarian", true);
  try {
    app.save(record12);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record13 = new Record(collection);
    record13.set("name", "Pakodi (Pakora)");
    record13.set("description", "Vegetable fritters made with gram flour batter. Crispy on the outside, soft inside. Served with tamarind chutney.");
    record13.set("category", "Appetizers");
    record13.set("price", 1);
    record13.set("availability", true);
    record13.set("isVegetarian", true);
  try {
    app.save(record13);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record14 = new Record(collection);
    record14.set("name", "Andhra Chilli Chicken");
    record14.set("description", "Tender chicken pieces cooked with green and red chilies, onions, and Andhra spices. Fiery and flavorful.");
    record14.set("category", "Appetizers");
    record14.set("price", 1);
    record14.set("availability", true);
    record14.set("isVegetarian", false);
  try {
    app.save(record14);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record15 = new Record(collection);
    record15.set("name", "Chicken Kebab Empire");
    record15.set("description", "Marinated chicken kebabs grilled to perfection. Served with mint chutney and lemon. Aromatic and succulent.");
    record15.set("category", "Appetizers");
    record15.set("price", 1);
    record15.set("availability", true);
    record15.set("isVegetarian", false);
  try {
    app.save(record15);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record16 = new Record(collection);
    record16.set("name", "Mutton Pepper Fry");
    record16.set("description", "Tender mutton pieces fried with black pepper, curry leaves, and onions. A spicy non-vegetarian appetizer.");
    record16.set("category", "Appetizers");
    record16.set("price", 1);
    record16.set("availability", true);
    record16.set("isVegetarian", false);
  try {
    app.save(record16);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record17 = new Record(collection);
    record17.set("name", "Mussel Fry");
    record17.set("description", "Fresh mussels marinated and deep-fried until crispy. Served with lemon and mint chutney. A seafood delicacy.");
    record17.set("category", "Appetizers");
    record17.set("price", 1);
    record17.set("availability", true);
    record17.set("isVegetarian", false);
  try {
    app.save(record17);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record18 = new Record(collection);
    record18.set("name", "Traditional Chicken Fry");
    record18.set("description", "Chicken pieces marinated in spices and deep-fried until golden. Crispy exterior with juicy meat inside.");
    record18.set("category", "Appetizers");
    record18.set("price", 1);
    record18.set("availability", true);
    record18.set("isVegetarian", false);
  try {
    app.save(record18);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record19 = new Record(collection);
    record19.set("name", "Indian Chai");
    record19.set("description", "Aromatic black tea brewed with milk, ginger, cardamom, and spices. Served hot. A comforting Indian beverage.");
    record19.set("category", "Beverages");
    record19.set("price", 1);
    record19.set("availability", true);
    record19.set("isVegetarian", true);
  try {
    app.save(record19);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record20 = new Record(collection);
    record20.set("name", "South Indian Filter Coffee");
    record20.set("description", "Strong, aromatic coffee made with a traditional metal filter. Served with hot milk and froth. A South Indian classic.");
    record20.set("category", "Beverages");
    record20.set("price", 1);
    record20.set("availability", true);
    record20.set("isVegetarian", true);
  try {
    app.save(record20);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record21 = new Record(collection);
    record21.set("name", "Mango Lassi");
    record21.set("description", "Creamy yogurt-based drink blended with fresh mango pulp and a touch of cardamom. Refreshing and sweet.");
    record21.set("category", "Beverages");
    record21.set("price", 1);
    record21.set("availability", true);
    record21.set("isVegetarian", true);
  try {
    app.save(record21);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record22 = new Record(collection);
    record22.set("name", "Buttermilk (Chaach)");
    record22.set("description", "Tangy buttermilk seasoned with cumin, ginger, and green chilies. A cooling and digestive drink.");
    record22.set("category", "Beverages");
    record22.set("price", 1);
    record22.set("availability", true);
    record22.set("isVegetarian", true);
  try {
    app.save(record22);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record23 = new Record(collection);
    record23.set("name", "Fresh Lime Soda");
    record23.set("description", "Freshly squeezed lime juice mixed with soda water, sugar, and a pinch of salt. Refreshing and zesty.");
    record23.set("category", "Beverages");
    record23.set("price", 1);
    record23.set("availability", true);
    record23.set("isVegetarian", true);
  try {
    app.save(record23);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record24 = new Record(collection);
    record24.set("name", "Malabar Biryani (Chicken)");
    record24.set("description", "Fragrant basmati rice cooked with tender chicken, coconut milk, and Malabar spices. A weekend special from Kerala.");
    record24.set("category", "Main Courses");
    record24.set("price", 1);
    record24.set("availability", true);
    record24.set("isVegetarian", false);
  try {
    app.save(record24);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record25 = new Record(collection);
    record25.set("name", "Nadan Beef Roast");
    record25.set("description", "Slow-cooked beef with coconut, spices, and curry leaves. A traditional Kerala weekend specialty. Rich and aromatic.");
    record25.set("category", "Main Courses");
    record25.set("price", 1);
    record25.set("availability", true);
    record25.set("isVegetarian", false);
  try {
    app.save(record25);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record26 = new Record(collection);
    record26.set("name", "Paal Payasam");
    record26.set("description", "Creamy rice pudding made with milk, jaggery, and cardamom. Garnished with cashews and raisins. A festive dessert.");
    record26.set("category", "Desserts");
    record26.set("price", 1);
    record26.set("availability", true);
    record26.set("isVegetarian", true);
  try {
    app.save(record26);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record27 = new Record(collection);
    record27.set("name", "Hyderabadi Chicken Biryani");
    record27.set("description", "Fragrant basmati rice layered with marinated chicken, yogurt, and Hyderabadi spices. Cooked in a sealed pot. A royal dish.");
    record27.set("category", "Main Courses");
    record27.set("price", 1);
    record27.set("availability", true);
    record27.set("isVegetarian", false);
  try {
    app.save(record27);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record28 = new Record(collection);
    record28.set("name", "Hyderabadi Mutton Biryani");
    record28.set("description", "Tender mutton cooked with basmati rice, yogurt, and aromatic spices. A traditional Hyderabadi delicacy.");
    record28.set("category", "Main Courses");
    record28.set("price", 1);
    record28.set("availability", true);
    record28.set("isVegetarian", false);
  try {
    app.save(record28);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record29 = new Record(collection);
    record29.set("name", "Kappa and Fish Curry");
    record29.set("description", "Cassava root cooked with fresh fish in a coconut-based curry. A Kerala coastal specialty. Authentic and flavorful.");
    record29.set("category", "Main Courses");
    record29.set("price", 1);
    record29.set("availability", true);
    record29.set("isVegetarian", false);
  try {
    app.save(record29);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record30 = new Record(collection);
    record30.set("name", "Chicken Curry with Coconut Milk");
    record30.set("description", "Tender chicken pieces in a creamy coconut milk-based curry with spices and curry leaves. Served with rice or bread.");
    record30.set("category", "Main Courses");
    record30.set("price", 1);
    record30.set("availability", true);
    record30.set("isVegetarian", false);
  try {
    app.save(record30);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record31 = new Record(collection);
    record31.set("name", "Chicken Ghee Roast");
    record31.set("description", "Chicken cooked with ghee, spices, and curry leaves until golden and aromatic. A rich and flavorful main course.");
    record31.set("category", "Main Courses");
    record31.set("price", 1);
    record31.set("availability", true);
    record31.set("isVegetarian", false);
  try {
    app.save(record31);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record32 = new Record(collection);
    record32.set("name", "Kerala Prawn Curry");
    record32.set("description", "Fresh prawns cooked in a tangy coconut curry with spices and curry leaves. A seafood delicacy from Kerala.");
    record32.set("category", "Main Courses");
    record32.set("price", 1);
    record32.set("availability", true);
    record32.set("isVegetarian", false);
  try {
    app.save(record32);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record33 = new Record(collection);
    record33.set("name", "Mutton Stew");
    record33.set("description", "Tender mutton pieces in a mild, creamy stew with potatoes and onions. Served with appam or bread.");
    record33.set("category", "Main Courses");
    record33.set("price", 1);
    record33.set("availability", true);
    record33.set("isVegetarian", false);
  try {
    app.save(record33);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record34 = new Record(collection);
    record34.set("name", "Veg Stew");
    record34.set("description", "Mixed vegetables in a creamy coconut-based stew with mild spices. Served with appam or bread. A vegetarian comfort dish.");
    record34.set("category", "Main Courses");
    record34.set("price", 1);
    record34.set("availability", true);
    record34.set("isVegetarian", true);
  try {
    app.save(record34);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record35 = new Record(collection);
    record35.set("name", "Egg Masala");
    record35.set("description", "Hard-boiled eggs in a spiced tomato-based curry. Cooked with onions, ginger, and aromatic spices.");
    record35.set("category", "Main Courses");
    record35.set("price", 1);
    record35.set("availability", true);
    record35.set("isVegetarian", true);
  try {
    app.save(record35);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record36 = new Record(collection);
    record36.set("name", "Kadala Curry");
    record36.set("description", "Black chickpeas cooked in a spiced coconut curry with onions and ginger. A traditional vegetarian main course.");
    record36.set("category", "Main Courses");
    record36.set("price", 1);
    record36.set("availability", true);
    record36.set("isVegetarian", true);
  try {
    app.save(record36);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record37 = new Record(collection);
    record37.set("name", "Banana Fritters");
    record37.set("description", "Ripe banana slices dipped in gram flour batter and deep-fried until golden. Served with jaggery syrup. A sweet snack.");
    record37.set("category", "Snacks");
    record37.set("price", 1);
    record37.set("availability", true);
    record37.set("isVegetarian", true);
  try {
    app.save(record37);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record38 = new Record(collection);
    record38.set("name", "Chicken Cutlet");
    record38.set("description", "Minced chicken mixed with spices and breadcrumbs, shaped into patties and fried. Crispy and flavorful.");
    record38.set("category", "Snacks");
    record38.set("price", 1);
    record38.set("availability", true);
    record38.set("isVegetarian", false);
  try {
    app.save(record38);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record39 = new Record(collection);
    record39.set("name", "Parippu Vada");
    record39.set("description", "Lentil fritters made with gram flour and spices. Deep-fried until crispy. Served with chutney.");
    record39.set("category", "Snacks");
    record39.set("price", 1);
    record39.set("availability", true);
    record39.set("isVegetarian", true);
  try {
    app.save(record39);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record40 = new Record(collection);
    record40.set("name", "Ushunnu Vada");
    record40.set("description", "Black gram fritters with a crispy exterior and soft interior. Spiced with cumin and black pepper. A traditional snack.");
    record40.set("category", "Snacks");
    record40.set("price", 1);
    record40.set("availability", true);
    record40.set("isVegetarian", true);
  try {
    app.save(record40);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record41 = new Record(collection);
    record41.set("name", "Ada Pradhanam");
    record41.set("description", "Rice cake filled with jaggery and ghee. Steamed and served warm. A traditional Kerala dessert.");
    record41.set("category", "Desserts");
    record41.set("price", 1);
    record41.set("availability", true);
    record41.set("isVegetarian", true);
  try {
    app.save(record41);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record42 = new Record(collection);
    record42.set("name", "Palada Payasam");
    record42.set("description", "Creamy dessert made with thin rice flakes, jaggery, and ghee. Garnished with cashews and raisins. Rich and indulgent.");
    record42.set("category", "Desserts");
    record42.set("price", 1);
    record42.set("availability", true);
    record42.set("isVegetarian", true);
  try {
    app.save(record42);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record43 = new Record(collection);
    record43.set("name", "Gulab Jamun");
    record43.set("description", "Soft milk solids dumplings soaked in sugar syrup flavored with cardamom and rose water. A classic Indian dessert.");
    record43.set("category", "Desserts");
    record43.set("price", 1);
    record43.set("availability", true);
    record43.set("isVegetarian", true);
  try {
    app.save(record43);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record44 = new Record(collection);
    record44.set("name", "Chatti Pathiri");
    record44.set("description", "Layered rice cake with jaggery and ghee filling. Baked until golden. A traditional Kerala sweet.");
    record44.set("category", "Desserts");
    record44.set("price", 1);
    record44.set("availability", true);
    record44.set("isVegetarian", true);
  try {
    app.save(record44);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record45 = new Record(collection);
    record45.set("name", "Semiya Payasam");
    record45.set("description", "Vermicelli roasted in ghee and cooked with milk, jaggery, and cardamom. Garnished with nuts. A festive dessert.");
    record45.set("category", "Desserts");
    record45.set("price", 1);
    record45.set("availability", true);
    record45.set("isVegetarian", true);
  try {
    app.save(record45);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record46 = new Record(collection);
    record46.set("name", "Elaneer Payasam");
    record46.set("description", "Tender coconut pudding made with coconut water and jaggery. Light and refreshing. A seasonal specialty.");
    record46.set("category", "Desserts");
    record46.set("price", 1);
    record46.set("availability", true);
    record46.set("isVegetarian", true);
  try {
    app.save(record46);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record47 = new Record(collection);
    record47.set("name", "Kesari (Sooji Halwa)");
    record47.set("description", "Semolina halwa made with ghee, jaggery, and cardamom. Garnished with cashews and raisins. A sweet and aromatic dessert.");
    record47.set("category", "Desserts");
    record47.set("price", 1);
    record47.set("availability", true);
    record47.set("isVegetarian", true);
  try {
    app.save(record47);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record48 = new Record(collection);
    record48.set("name", "Malabar Porotta");
    record48.set("description", "Flaky, layered flatbread made with maida and ghee. Crispy and buttery. Served with curry or stew.");
    record48.set("category", "Sides & Accompaniments");
    record48.set("price", 1);
    record48.set("availability", true);
    record48.set("isVegetarian", true);
  try {
    app.save(record48);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record49 = new Record(collection);
    record49.set("name", "Pathiri");
    record49.set("description", "Soft, fluffy rice bread made with rice flour and coconut milk. Served with curry or stew. A Kerala specialty.");
    record49.set("category", "Sides & Accompaniments");
    record49.set("price", 1);
    record49.set("availability", true);
    record49.set("isVegetarian", true);
  try {
    app.save(record49);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record50 = new Record(collection);
    record50.set("name", "Ghee Rice");
    record50.set("description", "Fragrant basmati rice cooked with ghee, cashews, and raisins. Aromatic and buttery. A perfect side dish.");
    record50.set("category", "Sides & Accompaniments");
    record50.set("price", 1);
    record50.set("availability", true);
    record50.set("isVegetarian", true);
  try {
    app.save(record50);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record51 = new Record(collection);
    record51.set("name", "Coconut Chutney");
    record51.set("description", "Fresh coconut ground with green chilies, ginger, and cumin. Served with dosa, idly, and other breakfast items.");
    record51.set("category", "Sides & Accompaniments");
    record51.set("price", 1);
    record51.set("availability", true);
    record51.set("isVegetarian", true);
  try {
    app.save(record51);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record52 = new Record(collection);
    record52.set("name", "Sambar");
    record52.set("description", "Tangy lentil-based vegetable stew with tamarind and spices. Served with dosa, idly, and other South Indian dishes.");
    record52.set("category", "Sides & Accompaniments");
    record52.set("price", 1);
    record52.set("availability", true);
    record52.set("isVegetarian", true);
  try {
    app.save(record52);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record53 = new Record(collection);
    record53.set("name", "Rasam");
    record53.set("description", "Spiced tamarind and lentil soup with pepper and cumin. A light and aromatic South Indian accompaniment.");
    record53.set("category", "Sides & Accompaniments");
    record53.set("price", 1);
    record53.set("availability", true);
    record53.set("isVegetarian", true);
  try {
    app.save(record53);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record54 = new Record(collection);
    record54.set("name", "Ariyal");
    record54.set("description", "Stir-fried vegetables with coconut, spices, and curry leaves. A simple and flavorful side dish.");
    record54.set("category", "Sides & Accompaniments");
    record54.set("price", 1);
    record54.set("availability", true);
    record54.set("isVegetarian", true);
  try {
    app.save(record54);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record55 = new Record(collection);
    record55.set("name", "Chicken Stew");
    record55.set("description", "Tender chicken pieces in a creamy coconut-based stew with potatoes and onions. Served with appam or bread.");
    record55.set("category", "Sides & Accompaniments");
    record55.set("price", 1);
    record55.set("availability", true);
    record55.set("isVegetarian", false);
  try {
    app.save(record55);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record56 = new Record(collection);
    record56.set("name", "Parippu Vada (2 pcs)");
    record56.set("description", "Two pieces of lentil fritters made with gram flour and spices. Deep-fried until crispy. Served with chutney.");
    record56.set("category", "Sides & Accompaniments");
    record56.set("price", 1);
    record56.set("availability", true);
    record56.set("isVegetarian", true);
  try {
    app.save(record56);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record57 = new Record(collection);
    record57.set("name", "Ushunnu Vada (2 pcs)");
    record57.set("description", "Two pieces of black gram fritters with a crispy exterior and soft interior. Spiced with cumin and black pepper.");
    record57.set("category", "Sides & Accompaniments");
    record57.set("price", 1);
    record57.set("availability", true);
    record57.set("isVegetarian", true);
  try {
    app.save(record57);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record58 = new Record(collection);
    record58.set("name", "Mini Idly");
    record58.set("description", "Small steamed rice and lentil cakes. Soft and fluffy. Perfect for kids. Served with sambar and chutney.");
    record58.set("category", "Kids Menu");
    record58.set("price", 1);
    record58.set("availability", true);
    record58.set("isVegetarian", true);
  try {
    app.save(record58);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record59 = new Record(collection);
    record59.set("name", "Masala Dosa (Mini)");
    record59.set("description", "Small crispy rice crepe filled with spiced potato and onion mixture. Perfect portion for kids.");
    record59.set("category", "Kids Menu");
    record59.set("price", 1);
    record59.set("availability", true);
    record59.set("isVegetarian", true);
  try {
    app.save(record59);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record60 = new Record(collection);
    record60.set("name", "Cheese Dosa");
    record60.set("description", "Crispy dosa filled with melted cheese and spiced potato. A kid-friendly favorite.");
    record60.set("category", "Kids Menu");
    record60.set("price", 1);
    record60.set("availability", true);
    record60.set("isVegetarian", true);
  try {
    app.save(record60);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record61 = new Record(collection);
    record61.set("name", "French Fries");
    record61.set("description", "Crispy golden potato fries seasoned with salt and spices. A classic kids' favorite.");
    record61.set("category", "Kids Menu");
    record61.set("price", 1);
    record61.set("availability", true);
    record61.set("isVegetarian", true);
  try {
    app.save(record61);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }

  const record62 = new Record(collection);
    record62.set("name", "Chocolate Pancake");
    record62.set("description", "Soft, fluffy pancakes with chocolate chips. Served with maple syrup and butter. A sweet treat for kids.");
    record62.set("category", "Kids Menu");
    record62.set("price", 1);
    record62.set("availability", true);
    record62.set("isVegetarian", true);
  try {
    app.save(record62);
  } catch (e) {
    if (e.message.includes("Value must be unique")) {
      console.log("Record with unique value already exists, skipping");
    } else {
      throw e;
    }
  }
}, (app) => {
  // Rollback: record IDs not known, manual cleanup needed
})