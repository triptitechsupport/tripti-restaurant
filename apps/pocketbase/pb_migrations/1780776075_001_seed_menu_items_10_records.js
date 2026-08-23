/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("menu_items");

  const record0 = new Record(collection);
    record0.set("name", "Butter Chicken");
    record0.set("description", "Tender chicken in creamy tomato sauce with aromatic spices");
    record0.set("category", "Main Courses");
    record0.set("price", 12.99);
    record0.set("isVegetarian", true);
    record0.set("availability", true);
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
    record1.set("name", "Samosa");
    record1.set("description", "Crispy pastry filled with spiced potatoes and peas");
    record1.set("category", "Appetizers");
    record1.set("price", 4.99);
    record1.set("isVegetarian", true);
    record1.set("availability", true);
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
    record2.set("name", "Naan");
    record2.set("description", "Soft Indian flatbread baked in tandoor oven");
    record2.set("category", "Breads");
    record2.set("price", 2.99);
    record2.set("isVegetarian", true);
    record2.set("availability", true);
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
    record3.set("name", "Paneer Tikka");
    record3.set("description", "Marinated cottage cheese grilled with bell peppers and onions");
    record3.set("category", "Appetizers");
    record3.set("price", 8.99);
    record3.set("isVegetarian", true);
    record3.set("availability", true);
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
    record4.set("name", "Biryani");
    record4.set("description", "Fragrant basmati rice cooked with meat and aromatic spices");
    record4.set("category", "Main Courses");
    record4.set("price", 13.99);
    record4.set("isVegetarian", true);
    record4.set("availability", true);
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
    record5.set("name", "Dal Makhani");
    record5.set("description", "Creamy lentil curry with butter and cream");
    record5.set("category", "Main Courses");
    record5.set("price", 9.99);
    record5.set("isVegetarian", true);
    record5.set("availability", true);
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
    record6.set("name", "Gulab Jamun");
    record6.set("description", "Soft milk solids in sugar syrup");
    record6.set("category", "Desserts");
    record6.set("price", 5.99);
    record6.set("isVegetarian", true);
    record6.set("availability", true);
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
    record7.set("name", "Mango Lassi");
    record7.set("description", "Yogurt-based mango drink");
    record7.set("category", "Beverages");
    record7.set("price", 3.99);
    record7.set("isVegetarian", true);
    record7.set("availability", true);
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
    record8.set("name", "Tandoori Chicken");
    record8.set("description", "Marinated chicken grilled in tandoor oven");
    record8.set("category", "Main Courses");
    record8.set("price", 11.99);
    record8.set("isVegetarian", true);
    record8.set("availability", true);
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
    record9.set("name", "Aloo Gobi");
    record9.set("description", "Potato and cauliflower curry with Indian spices");
    record9.set("category", "Main Courses");
    record9.set("price", 8.99);
    record9.set("isVegetarian", true);
    record9.set("availability", true);
  try {
    app.save(record9);
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