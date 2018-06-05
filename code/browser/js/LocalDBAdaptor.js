class LocalDBAdaptor extends DBAdaptor {

  constructor() {
    super();
    this._dbCache = new Map();
    TransactionDBMeta_setGetCollectionFunction ((d, n)             => this._getCollectionWithPolyfill (d, n));
    TransactionDBMeta_setGetObjectIDFunction   (()                 => this._createObjectID());
    TransactionDBMeta_setForEachFunction       (async (cursor, cb) => await cursor. forEach (cb));
  }

  async perform (operation, data) {
    if (data .database) {
      data._database = this._getDB (data .database);
      if (data .collection) {
        let r = data .collection .indexOf ('$RAW');
        if (r != -1)
          data .collection = data .collection .slice (0, r);
        data._collection = data._database .collection (data .collection);
      }
    }
    data._isTran = data .collection == 'actuals' || data .collection == 'transactions';
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
      case DatabaseOperation .COPY_DATABASE:
        return await this._copyDatabase (data);
      case DatabaseOperation .COPY_BUDGET:
        return await this._copyBudget (data);
      case DatabaseOperation .REMOVE_BUDGET:
        return await this._removeBudget (data);
      case DatabaseOperation .REMOVE_CONFIGURATION:
        return await this._removeConfiguration (data);
      default:
        console.log ('Operation not supported for LocalDB', operation);
    }
  }

  _createDB (name) {
    let collections = LocalDBAdaptor_COLLECTIONS [name .split ('_') [0]];
    assert (collections);
    return new zango .Db (name, 1, collections);
  }

  _createObjectID() {
    return new Date() .getTime() .toString (16) + (Math .floor (Math .random() * 1000000000000000)) .toString (16)
  }

  _getDB (name) {
    return this._dbCache .get (name) || (this._dbCache .set (name, this._createDB (name)) .get (name));
  }

  async _find (data) {
    if (data .collection == 'actuals')
      return await TransactionDBMeta_getActuals (data._database, data .query);
    else if (data .collection == 'accounts')
      return await TransactionDBMeta_findAccountAndRollForward (data._database, data .query);
    else
      return await data._collection .find (data .query) .toArray();
  }

  async _has (data) {
    return (await this._find (data)) .length > 0;
  }

  async _updateOne (data) {
    if (data._isTran)
      await TransactionDBMeta_update (data._database, data .id, data .update);
    else
      await data._collection .update ({_id: data .id}, {$set: data .update});
    return true;
  }

  async _updateList (data) {
    let async = []
    for (let item of data .list)
      if (data._isTran)
        async .push (TransactionDBMeta_update (data._database, item .id, item .update));
      else
        async .push (this._updateOne ({_collection: data._collection, id: item .id, update: item .update}));
    await Promise .all (async);
    return data .list .map (_ => {return true});
  }

  async _insertOne (data) {
    if (data._isTran)
      data .insert = await TransactionDBMeta_insert (data._database, data .insert);
    else {
      if (data .database .startsWith ('config_')) {
        let counters = data._database .collection ('counters');
        data .insert._seq = (await counters .update (
          {_id: data .collection}, {$inc: {seq: 1}}, undefined, {upsert: {_id: data .collection, seq: 1}}
        )) [0] .seq;
      }
      if (! data .insert ._id)
        data .insert._id = this._createObjectID();
      await data._collection .insert (data .insert);
    }
    return data .insert;
  }

  async _insertList (data) {
    let async = []
    for (let insert of data .list)
      if (data._isTran)
        async .push (TransactionDBMeta_insert (insert));
      else
        async .push (this._insertOne ({_collection: data._collection, database: data .database, insert: insert}));
    await Promise .all (async);
    return data .list .map (_ => {return true})
  }

  async _removeOne (data) {
    if (data._isTran)
      await TransactionDBMeta_remove (data._database, data .id);
    else
      await data._collection .remove ({_id: data .id});
    return true;
  }

  async _removeList (data) {
    let async = [];
    for (let id of data .list)
      if (data._isTran)
        async .push (TransactionDBMeta_remove (data._database, data .id));
      else
        async .push (this._removeOne ({_collection: data._collection, id: id}));
    await Promise .all (async);
    return data .list .map (_ => {return true});
  }

  async _copyDatabase (data) {
    let fromDB = this._getDB (data .from);
    let toDB   = this._getDB (data .to);
    for (let collectionName of Object .keys (LocalDBAdaptor_COLLECTIONS [data .from .split ('_') [0]])) {
      let fromCollection = await fromDB .collection (collectionName);
      let toCollection   = await toDB .collection (collectionName);
      let promises = [];
      await fromCollection .find() .forEach (doc => {promises .push (toCollection .insert (doc))});
      await Promise.all (promises);
    }
  }

  async _copyBudget (data) {
    let budget = await data._database .collection ('budgets') .findOne ({_id: data .from});
    if (budget) {
      budget .name = 'Copy of ' + budget .name;
      budget._id   = this._createObjectID();
      let ins = await data._database .collection ('budgets') .insert (budget);
      await data._database .collection ('categories') .update ({budgets: data .from}, {$addToSet: {budgets: budget._id}});
      let schedules = data._database .collection ('schedules');
      let promises = [];
      await schedules .find ({budget: data.from}) .forEach (sch => {
        sch._id     = this._createObjectID();
        sch .budget = budget._id;
        promises .push (schedules .insert (sch));
      })
      await Promise .all (promises);
    }
    return budget;
  }

  async _removeBudget (data) {
    let budgets      = data._database .collection ('budgets');
    let categories   = data._database .collection ('categories');
    let schedules    = data._database .collection ('schedules');
    let transactions = data._database .collection ('transactions');
    await budgets .remove ({_id: data .id});
    let noBudgetCats = (await categories .find ({budgets: [data .id]}) .toArray()) .map (c => {return c._id});
    await categories .update ({budgets: data .id}, {$pull: {budgets: data .id}});
    await schedules  .remove ({budget: data .id});
    let inUse = (await transactions .find ({category: {$in: noBudgetCats}}) .toArray()) .reduce ((s,t) => {
      s .add (t .category);
      return s;
    }, new Set());
    let cids = Array .from (inUse .keys());
    while (cids .length) {
      cids = (await categories .find ({_id: {$in: cids}}) .toArray())
        .map    (cat => {return cat .parent})
        .filter (cid => {return cid});
      cids .forEach (cid => {inUse .add (cid)})
    }
    let deleteCats = noBudgetCats .filter (c => {return ! inUse .has (c)});
    await categories .remove ({_id: {$in: deleteCats}});
    return {okay: true};
  }

  async _removeConfiguration (data) {
    await data._database .drop();
  }

  _getCollectionWithPolyfill (db, name) {
    let col = db .collection (name);

    let handleOptions = (query, update, options) => {
      if (options && options .upsert)
        options .upsert = Object .assign ({_id: query._id || this._createObjectID()}, update .$inc || update .$set || update);
      return options;
    }

    col .findOneAndUpdate = async (query, update, options = {}) => {
      options = handleOptions (query, update, options);
      if (options .returnOriginal === undefined)
        options .returnOriginal = true;
      let res = await col .update (query, update, undefined, options);
      return res && res [0] && {value: res [0]}
    };

    col .updateOne = async (query, update, options) => {
      options = handleOptions (query, update, options);
      await col. update (query, update, undefined, options);
    }
    col .findOneAndDelete = async query => {
      let res = await col .remove (query, undefined);
      return res && res [0] && {value: res [0]}
    }
    col .deleteOne  = async query => {
      let res = await col .remove (query, undefined);
      return {deletedCount: (res && res .length) || 0};
    }
    col .deleteMany = col .deleteOne;

    return col;
  }
}

const LocalDBAdaptor_COLLECTIONS = {
  'config': {
    accounts: ['_id'],
    actuals: ['_id'],
    actualsMeta: ['_id', 'type'],
    balanceHistory: ['_id'],
    budgets: ['_id'],
    categories: ['_id'],
    counters: ['_id'],
    importRules: ['_id'],
    parameters: ['_id'],
    rateFuture: ['_id'],
    schedules: ['_id'],
    taxParameters: ['_id'],
    transactions: ['_id', 'date', 'importTime', 'category', 'account']
  },
  'user': {
    configurations: ['_id']
  }
}