class LocalDBAdaptor extends DBAdaptor {

  constructor() {
    super();
    this._dbCache = new Map();
  }

  async perform (operation, data) {
    data._database = this._getDB (data .database);
    if (data .collection) {
      let r = data .collection .indexOf ('$RAW');
      if (r != -1)
        data .collection = data .collection .slice (0, r);
      data._collection = data._database .collection (data .collection);
    }
    switch (operation) {
      case DatabaseOperation .FIND:
        return await this._find (data);
      case DatabaseOperation .HAS:
        return await this._has (data);
      case DatabaseOperation .UPDATE_ONE:
        return await this._updateOne (data);
      case DatabaseOperation .UPDATE_LIST:
        return await this._updateList (data);
      case DatabaseOperation .INSERT_ONE:
        return await this._insertOne (data);
      case DatabaseOperation .INSERT_LIST:
        return await this._insertList (data);
      case DatabaseOperation .REMOVE_ONE:
        return await this._removeOne (data);
      case DatabaseOperation .REMOVE_LIST:
        return await this._removeList (data);
      case DatabaseOperation .LOGIN:
        return await this._login (data);
      case DatabaseOperation .SIGNUP:
        return await this._signup (data);
      case DatabaseOperation .UPDATE_USER:
        return await this._updateUser (data);
      case DatabaseOperation .COPY_DATABASE:
        return await this._copyDatabase (data);
      case DatabaseOperation .COPY_BUDGET:
        return await this._copyBudget (data);
      case DatabaseOperation .REMOVE_BUDGET:
        return await this._removeBudget (data);
      case DatabaseOperation .REMOVE_CONFIGURATION:
        return await this._removeConfiguration (data);
    }
  }

  _createDB (name) {
    let collections = LocalDBAdaptor_COLLECTIONS [name .split ('_') [0]];
    assert (collections);
    return new zango .Db (name, collections);
  }

  _createObjectID() {
    return new Date() .getTime() .toString (16) + (Math .floor (Math .random() * 1000000000000000)) .toString (16)
  }

  _getDB (name) {
    return this._dbCache .get (name) || (this._dbCache .set (name, this._createDB (name)) .get (name));
  }

  async _find (data) {
    return await data._collection .find (data .query) .toArray();
  }

  async _has (data) {
    return (await this._find (data)) .length > 0;
  }

  async _updateOne (data) {
    await data._collection .update ({_id: data .id}, {$set: data .update});
    return true;
  }

  async _updateList (data) {
    let async = []
    for (let item of data .list)
      async .push (this._updateOne ({_collection: data._collection, id: item .id, update: item .update}));
    await Promise .all (async);
    return data .list .map (_ => {return true});
  }

  async _insertOne (data) {
    if (! data .insert ._id)
      data .insert._id = this._createObjectID();
    await data._collection .insert (data .insert);
    return data .insert;
  }

  async _insertList (data) {
    let async = []
    for (let insert of data .list)
      async .push (this._insertOne ({_collection: data._collection, insert: insert}));
    await Promise .all (async);
    return data .list .map (_ => {return true})
  }

  async _removeOne (data) {
    await data._collection .remove ({_id: data .id});
  }

  async _removeList (data) {
    let async = [];
    for (let id of data .list)
      async .push (this._removeOne ({_collection: data._collection, id: id}));
    await Promise .all (async);
    return data .list .map (_ => {return true});
  }

  _login (data) {
    console.log('login');
  }

  _signup (data) {
    console.log('signup');
  }

  _updateUser (data) {
    console.log('updateUser');
  }

  _copyDatabase (data) {
    console.log('copyDatabase');
  }

  _copyBudget (data) {
    console.log('copyBudget');
  }

  async _removeBudget (data) {
    console.log('removeBudget');
  }

  async _removeConfiguration (data) {
    console.log(data._database);
    await data._database .dropDatabase();
  }
}

const LocalDBAdaptor_COLLECTIONS = {
  'config': {
    accounts: ['_id'],
    actuals: ['_id'],
    actualsMeta: ['_id'],
    balanceHistory: ['_id'],
    budgets: ['_id'],
    categories: ['_id'],
    counters: ['_id'],
    importRules: ['_id'],
    parameters: ['_id'],
    rateFuture: ['_id'],
    schedules: ['_id'],
    taxParameters: ['_id'],
    transactions: ['_id', 'date']
  },
  'user': {
    configurations: ['_id']
  }
}