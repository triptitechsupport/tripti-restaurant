/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("restaurant_section");
    collection.fields.add(new TextField({ name: "description_en" }));
    collection.fields.add(new TextField({ name: "description_de" }));
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("restaurant_section");
    collection.fields.removeByName("description_en");
    collection.fields.removeByName("description_de");
    app.save(collection);
  },
);
