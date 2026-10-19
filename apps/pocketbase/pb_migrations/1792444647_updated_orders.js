/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_9815392148")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.collectionName = \"admin_users\"",
    "viewRule": "(customerId != \"\" && customerId = @request.auth.id) || @request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_9815392148")

  // update collection data
  unmarshal({
    "updateRule": "@request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\"",
    "viewRule": "customerId = @request.auth.id || @request.auth.collectionName = \"admin_users\" || @request.auth.collectionName = \"kds_users\" || @request.auth.collectionName = \"waiter_users\""
  }, collection)

  return app.save(collection)
})
