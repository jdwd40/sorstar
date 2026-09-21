migrate((app) => {
  const collection = new Collection({
    type: 'base',
    name: 'saves',
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: 'user = @request.auth.id',
    updateRule: 'user = @request.auth.id',
    deleteRule: 'user = @request.auth.id',
    fields: [
      {
        name: 'user',
        type: 'text',
        required: true,
        max: 255,
      },
      {
        name: 'game',
        type: 'json',
      },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_saves_user ON saves (user)'],
  })

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId('saves')
    app.delete(collection)
  } catch {
    // already removed
  }
})