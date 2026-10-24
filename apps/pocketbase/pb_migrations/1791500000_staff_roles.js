/// <reference path="../pb_data/types.d.ts" />

// Two more staff roles, created by the admin:
// - Kitchen Manager: a kitchen (kds_users) login with role "kitchen_manager"
// - Cashier: a service (waiter_users) login with role "cashier"
// Staff can still change their own name or password, but never their role.
const ADMIN = '@request.auth.collectionName = "admin_users"';

migrate(
  (app) => {
    const addRole = (name, values) => {
      const c = app.findCollectionByNameOrId(name);
      if (!c.fields.getByName('role')) c.fields.add(new SelectField({ name: 'role', maxSelect: 1, values }));
      return c;
    };

    const waiters = addRole('waiter_users', ['waiter', 'cashier']);
    waiters.updateRule = `(id = @request.auth.id && @request.body.role:isset = false) || ${ADMIN}`;
    app.save(waiters);

    const kitchen = addRole('kds_users', ['kitchen', 'kitchen_manager']);
    kitchen.listRule = `id = @request.auth.id || ${ADMIN}`;
    kitchen.viewRule = `id = @request.auth.id || ${ADMIN}`;
    kitchen.createRule = ADMIN;
    kitchen.updateRule = `(id = @request.auth.id && @request.body.role:isset = false) || ${ADMIN}`;
    kitchen.deleteRule = ADMIN;
    app.save(kitchen);
  },
  (app) => {
    const waiters = app.findCollectionByNameOrId('waiter_users');
    waiters.updateRule = `id = @request.auth.id || ${ADMIN}`;
    waiters.fields.removeByName('role');
    app.save(waiters);

    const kitchen = app.findCollectionByNameOrId('kds_users');
    kitchen.listRule = 'id = @request.auth.id';
    kitchen.viewRule = 'id = @request.auth.id';
    kitchen.createRule = null;
    kitchen.updateRule = 'id = @request.auth.id';
    kitchen.deleteRule = null;
    kitchen.fields.removeByName('role');
    app.save(kitchen);
  },
);
