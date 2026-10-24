/// <reference path="../pb_data/types.d.ts" />
// Problems and ideas staff tell the assistant in the staff app. The API saves
// them (server-only: all rules null) and builds an improvement report for the
// admin from them.
migrate((app) => {
  const c = new Collection({
    type: 'base',
    name: 'staff_feedback',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'kind', type: 'select', values: ['problem', 'idea', 'missing', 'confusing'], maxSelect: 1, required: true },
      { name: 'role', type: 'text', max: 40 },
      { name: 'staffName', type: 'text', max: 120 },
      { name: 'staffId', type: 'text', max: 40 },
      { name: 'area', type: 'text', max: 120 },
      { name: 'summary', type: 'text', max: 300, required: true },
      { name: 'details', type: 'text', max: 4000 },
      { name: 'impact', type: 'select', values: ['low', 'medium', 'high'], maxSelect: 1 },
      { name: 'status', type: 'select', values: ['new', 'planned', 'done', 'dismissed'], maxSelect: 1 },
      { name: 'adminNote', type: 'text', max: 1000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_staff_feedback_created ON staff_feedback (created)'],
  });
  app.save(c);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('staff_feedback'));
});
