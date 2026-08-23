/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("closed_dates");

    // Remove old 'date' field
    col.fields.removeByName("date");

    // Add start_date field
    col.fields.add(new DateField({
      name: "start_date",
      required: true,
    }));

    // Add end_date field
    col.fields.add(new DateField({
      name: "end_date",
      required: true,
    }));

    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("closed_dates");
    col.fields.removeByName("start_date");
    col.fields.removeByName("end_date");
    col.fields.add(new DateField({
      name: "date",
      required: true,
    }));
    app.save(col);
  }
);
