migrate(app => {
  const c = app.findCollectionByNameOrId('cash_registers');
  c.fields.add(new BoolField({name: 'enabledForBilling'}));
  c.fields.add(new BoolField({name: 'isDefault'}));
  c.fields.add(new TextField({name: 'scuStatus'}));
  c.fields.add(new TextField({name: 'initialValidation'}));
  c.fields.add(new TextField({name: 'setupError'}));
  c.fields.add(new TextField({name: 'checkedAt'}));
  c.indexes.push("CREATE UNIQUE INDEX idx_register_default_environment ON cash_registers (environment) WHERE isDefault = 1");
  app.save(c);
}, () => { throw new Error('Cash register configuration must be retained.'); });
