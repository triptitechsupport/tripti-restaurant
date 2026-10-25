/// <reference path="../pb_data/types.d.ts" />
// Voice calls between staff: one person, several people, or whole roles.
// call_rooms   - one call; targets = who should ring ([{type:'user',id} | {type:'role',role}])
// call_members - who joined / left / declined (each person writes only their own row)
// call_signals - WebRTC offer/answer between two people (only they can read it)
const STAFF = [
  '@request.auth.collectionName = "admin_users"',
  '@request.auth.collectionName = "waiter_users"',
  '@request.auth.collectionName = "kds_users"',
  '@request.auth.collectionName = "stock_users"',
  '@request.auth.collectionName = "auditor_users"',
].join(' || ');
const staff = `(${STAFF})`;

migrate((app) => {
  const rooms = new Collection({
    type: 'base',
    name: 'call_rooms',
    listRule: staff,
    viewRule: staff,
    createRule: `${staff} && @request.body.createdById = @request.auth.id`,
    updateRule: staff,
    deleteRule: null,
    fields: [
      { name: 'createdById', type: 'text', max: 40, required: true },
      { name: 'createdByName', type: 'text', max: 120 },
      { name: 'createdByRole', type: 'text', max: 40 },
      { name: 'title', type: 'text', max: 200 },
      { name: 'targets', type: 'json', maxSize: 20000 },
      { name: 'status', type: 'select', values: ['ringing', 'active', 'ended'], maxSelect: 1, required: true },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_call_rooms_created ON call_rooms (created)'],
  });
  app.save(rooms);

  const members = new Collection({
    type: 'base',
    name: 'call_members',
    listRule: staff,
    viewRule: staff,
    createRule: `${staff} && @request.body.userId = @request.auth.id`,
    updateRule: `${staff} && userId = @request.auth.id && @request.body.userId:isset = false`,
    deleteRule: null,
    fields: [
      { name: 'room', type: 'relation', collectionId: rooms.id, cascadeDelete: true, maxSelect: 1, required: true },
      { name: 'userId', type: 'text', max: 40, required: true },
      { name: 'name', type: 'text', max: 120 },
      { name: 'role', type: 'text', max: 40 },
      { name: 'state', type: 'select', values: ['joined', 'left', 'declined'], maxSelect: 1, required: true },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: ['CREATE INDEX idx_call_members_room ON call_members (room)'],
  });
  app.save(members);

  const signals = new Collection({
    type: 'base',
    name: 'call_signals',
    listRule: 'fromId = @request.auth.id || toId = @request.auth.id',
    viewRule: 'fromId = @request.auth.id || toId = @request.auth.id',
    createRule: `${staff} && @request.body.fromId = @request.auth.id`,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'room', type: 'relation', collectionId: rooms.id, cascadeDelete: true, maxSelect: 1, required: true },
      { name: 'fromId', type: 'text', max: 40, required: true },
      { name: 'toId', type: 'text', max: 40, required: true },
      { name: 'kind', type: 'select', values: ['offer', 'answer'], maxSelect: 1, required: true },
      { name: 'data', type: 'json', maxSize: 200000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: ['CREATE INDEX idx_call_signals_to ON call_signals (toId, room)'],
  });
  app.save(signals);
}, (app) => {
  for (const name of ['call_signals', 'call_members', 'call_rooms']) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* gone */ }
  }
});
