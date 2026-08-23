/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("translations");

  const record0 = new Record(collection);
    record0.set("key", "category_breakfast");
    record0.set("englishText", "Breakfast");
    record0.set("germanText", "Fr\u00fchst\u00fcck");
    record0.set("category", "menu");
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
    record1.set("key", "category_appetizers");
    record1.set("englishText", "Appetizers");
    record1.set("germanText", "Vorspeisen");
    record1.set("category", "menu");
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
    record2.set("key", "category_maincourses");
    record2.set("englishText", "Main Courses");
    record2.set("germanText", "Hauptg\u00e4nge");
    record2.set("category", "menu");
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
    record3.set("key", "category_snacks");
    record3.set("englishText", "Snacks");
    record3.set("germanText", "Snacks");
    record3.set("category", "menu");
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
    record4.set("key", "category_desserts");
    record4.set("englishText", "Desserts");
    record4.set("germanText", "Desserts");
    record4.set("category", "menu");
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
    record5.set("key", "category_sides");
    record5.set("englishText", "Sides & Accompaniments");
    record5.set("germanText", "Beilagen");
    record5.set("category", "menu");
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
    record6.set("key", "category_kidsmenu");
    record6.set("englishText", "Kids Menu");
    record6.set("germanText", "Kindermen\u00fc");
    record6.set("category", "menu");
  try {
    app.save(record6);
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