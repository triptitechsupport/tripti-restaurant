/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("pdf_menu_settings");

    if (!collection.fields.getByName("imageMenuEnabled")) {
      collection.fields.add(
        new BoolField({
          name: "imageMenuEnabled",
        }),
      );
    }

    if (!collection.fields.getByName("menuImageDE")) {
      collection.fields.add(
        new FileField({
          name: "menuImageDE",
          maxSelect: 1,
          maxSize: 20971520,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          thumbs: [],
        }),
      );
    }

    if (!collection.fields.getByName("menuImageEN")) {
      collection.fields.add(
        new FileField({
          name: "menuImageEN",
          maxSelect: 1,
          maxSize: 20971520,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          thumbs: [],
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("pdf_menu_settings");
    collection.fields.removeByName("imageMenuEnabled");
    collection.fields.removeByName("menuImageDE");
    collection.fields.removeByName("menuImageEN");
    app.save(collection);
  },
);
