class LocalDBAdaptor extends DBAdaptor {

  constructor() {
    super();
    this._dbCache = new Map();
    TransactionDBMeta_setGetCollectionFunction ((d, n) => this._getCollectionWithPolyfill (d, n));
    TransactionDBMeta_setGetObjectIDFunction   (()     => this._createObjectID());
  }

  async perform (operation, data) {
    if (data .database) {
      data._db = await this._getDB (data .database, 1);
      if (data .collection) {
        let r = data .collection .indexOf ('$RAW');
        if (r != -1)
          data .collection = data .collection .slice (0, r);
      }
    }
    data._isTran = data .collection == 'actuals' || data .collection == 'transactions';
    switch (operation) {
      case DatabaseOperation .FIND:
        return this._find (data);
      case DatabaseOperation .HAS:
        return this._has (data);
      case DatabaseOperation .UPDATE_ONE:
        return this._updateOne (data);
      case DatabaseOperation .UPDATE_LIST:
        return this._updateList (data);
      case DatabaseOperation .INSERT_ONE:
        return this._insertOne (data);
      case DatabaseOperation .INSERT_LIST:
        return this._insertList (data);
      case DatabaseOperation .REMOVE_ONE:
        return this._removeOne (data);
      case DatabaseOperation .REMOVE_LIST:
        return this._removeList (data);
      case DatabaseOperation .COPY_DATABASE:
        return this._copyDatabase (data);
      case DatabaseOperation .COPY_BUDGET:
        return this._copyBudget (data);
      case DatabaseOperation .REMOVE_BUDGET:
        return this._removeBudget (data);
      case DatabaseOperation .REMOVE_CONFIGURATION:
        return this._removeConfiguration (data);
      default:
        console.log ('Operation not supported for LocalDB', operation);
    }
  }

  async _createDB (name, version) {
    const db = new LocalDB (name);
    await db .open (version, (oldVersion, newVersion) => {
      const upgrader = LocalDBAdaptor_SCHEMA_UPGRADER ['_' + oldVersion + '_' + newVersion];
      assert (upgrader);
      return upgrader [name .split ('_') [0]];
    });
    return db;
  }

  _createObjectID() {
    return new Date() .getTime() .toString (16) + (Math .floor (Math .random() * 1000000000000000)) .toString (16)
  }

  async _getDB (name, version) {
    const key = name + '$' + version;
    return this._dbCache .get (key) || (this._dbCache .set (key, await this._createDB (name, version)) .get (key));
  }

  async _find (data) {
    // if (data .collection == 'actuals')
    //   return await TransactionDBMeta_getActuals (data._database, data .query);
    // else if (data .collection == 'accounts')
    //   return await TransactionDBMeta_findAccountAndRollForward (data._database, data .query);
    // else
    return await data._db .transactionReadOnly ([data .collection]) .findArray (data .collection, data .query);
  }

  async _has (data) {
    return this._find (data) .length > 0;
  }

  async _updateOne (data) {
    // if (data._isTran)
    //   await TransactionDBMeta_update (data._database, data .id, data .update);
    // else
    const t = data._db .transactionReadWrite ([data .collection]);
    const result = await t .update (data .collection, {_id: data .id}, {$set: data .update});
    await t .hasCommitted();
    return result;
  }

  async _updateList (data) {
    // let async = []
    // for (let item of data .list) {
    //   if (data._isTran)
    //     async .push (TransactionDBMeta_update (data._database, item .id, item .update));
    //   else
    const promises = [];
    const t = await data._db .transactionReadWrite ([data .collection]);
    for (const item of data .list)
      promises .push (t .update (data .collection, {_id: item .id}, {$set: item .update}));
    const result = await Promise .all (promises);
    await t .hasCommitted();
    return result;
  }

  async _insertOne (data) {
    // if (data._isTran)
    //   data .insert = await TransactionDBMeta_insert (data._database, data .insert);
    // else {
    //   if (data .database .startsWith ('config_')) {
    //     let counters = data._database .collection ('counters');
    //     data .insert._seq = (await counters .update (
    //       {_id: data .collection}, {$inc: {seq: 1}}, undefined, {upsert: {_id: data .collection, seq: 1}}
    //     )) [0] .seq;
    //   }
    //   if (! data .insert ._id)
    //     data .insert._id = this._createObjectID();
    //   await data._collection .insert (data .insert);
    // }
    // return data .insert;
    if (! data .insert._id)
      data .insert._id = this._createObjectID();
    const t = data._db .transactionReadWrite ([data .collection] .concat (data .insert._seq !== undefined && ! data .insert._seq? 'counters': []));
    if (data .insert._seq !== undefined && ! data .insert._seq)
      data .insert._seq = (await t .findOneAndUpdate ('counters', {_id: data .collection}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})) .value .seq;
    const result = await t .insert (data .collection, data .insert);
    await t .hasCommitted();
    return data .insert;
  }

  async _insertList (data) {
    // let async = []
    // for (let insert of data .list) {
    //   await data._collection .insert (insert);
    //
    //   // if (data._isTran)
    //   //   async .push (TransactionDBMeta_insert (data._database, insert));
    //   // else
    //   //   async .push (this._insertOne ({_collection: data._collection, database: data .database, _database: data._database, insert: insert}));
    //   // if (async .length > 2) {
    //   //   await Promise.all(async);
    //   //   async = [];
    //   // }
    // }
    //
    // // await Promise .all (async);
    // return data .list .map (_ => {return true}) // XXX
    const t = data._db .transactionReadWrite ([data .collection] .concat (true || data .list .find (i => i._seq !== undefined && ! i._seq)? 'counters': []));
    const promises = [];
    for (const item of data .list) {
      if (! item._id)
        item._id = this._createObjectID();
      if (item._seq !== undefined && ! item._seq)
        item._seq = (await t .findOneAndUpdate ('counters', {_id: data .collection}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})) .value .seq;
      promises .push (t .insert (data .collection, item));
    }
    await Promise .all (promises);
    await t .hasCommitted();
    return data .list;
  }

  async _removeOne (data) {
    // if (data._isTran)
    //   await TransactionDBMeta_remove (data._database, data .id);
    // else
    //   await data._collection .remove ({_id: data .id});
    // return true;
    const t = data._db .transactionReadWrite ([data .collection]);
    await t .delete (data .collection, {_id: data .id});
    await t .hasCommitted();
    return true;
  }

  async _removeList (data) {
    // let async = [];
    // for (let id of data .list) {
    //   if (data._isTran)
    //     async .push (TransactionDBMeta_remove (data._database, data .id));
    //   else
    //     async .push (this._removeOne ({_collection: data._collection, id: id}));
    //   if (async .length > 2) {
    //     await Promise.all(async);
    //     async = [];
    //   }
    // }
    // await Promise .all (async);
    // return data .list .map (_ => {return true});
    const t = data._db .transactionReadWrite ([data .collection]);
    const promises = [];
    for (const id of data .list)
      promises .push (data._db .delete (data .collection, {_id: id}))
    await Promise .all (promises);
    await t .hasCommitted();
    return data .list .map (id => true);
  }

  async _copyDatabase (data) {
    const fromDB = await this._getDB (data .from);
    const toDB   = await this._getDB (data .to);
    for (const objectStoreName of fromDB .getObjectStoreNames()) {
      const objects = await fromDB .transactionReadOnly ([objectStoreName]) .findArray (objectStoreName);
      const toT     = toDB   .transactionReadWrite ([objectStoreName]);
      for (const object of objects)
        toT .insert (objectStoreName, object);
      await toT .hasCommitted();
    }
  }

  async _copyBudget (data) {
    // let budget = await data._database .collection ('budgets') .findOne ({_id: data .from});
    // if (budget) {
    //   budget .name = 'Copy of ' + budget .name;
    //   budget._id   = this._createObjectID();
    //   let ins = await data._database .collection ('budgets') .insert (budget);
    //   await data._database .collection ('categories') .update ({budgets: data .from}, {$addToSet: {budgets: budget._id}});
    //   let schedules = data._database .collection ('schedules');
    //   let promises = [];
    //   await schedules .find ({budget: data.from}) .forEach (sch => {
    //     sch._id     = this._createObjectID();
    //     sch .budget = budget._id;
    //     promises .push (schedules .insert (sch));
    //   })
    //   await Promise .all (promises);
    // }
    // return budget;
  }

  async _removeBudget (data) {
    // let budgets      = data._database .collection ('budgets');
    // let categories   = data._database .collection ('categories');
    // let schedules    = data._database .collection ('schedules');
    // let transactions = data._database .collection ('transactions');
    // await budgets .remove ({_id: data .id});
    // let noBudgetCats = (await categories .find ({budgets: [data .id]}) .toArray()) .map (c => {return c._id});
    // await categories .update ({budgets: data .id}, {$pull: {budgets: data .id}});
    // await schedules  .remove ({budget: data .id});
    // let inUse = (await transactions .find ({category: {$in: noBudgetCats}}) .toArray()) .reduce ((s,t) => {
    //   s .add (t .category);
    //   return s;
    // }, new Set());
    // let cids = Array .from (inUse .keys());
    // while (cids .length) {
    //   cids = (await categories .find ({_id: {$in: cids}}) .toArray())
    //     .map    (cat => {return cat .parent})
    //     .filter (cid => {return cid});
    //   cids .forEach (cid => {inUse .add (cid)})
    // }
    // let deleteCats = noBudgetCats .filter (c => {return ! inUse .has (c)});
    // await categories .remove ({_id: {$in: deleteCats}});
    // return {okay: true};
  }

  async _removeConfiguration (data) {
    await data._db .delete();
  }

  _getCollectionWithPolyfill (db, name) {
  //   const properties = Object .getOwnPropertyNames (LocalTransaction) .filter (p => p != 'constructor' && ! p .startsWith ('_'));
  //   const collection = {
  //     _db:  db,
  //     _name: name
  //   };
  //   for (const p of Object .getOwnPropertyNames (LocalTransaction) .filter (p => p != 'constructor' && ! p .startsWith ('_')))
  //     collection [p] = function() {
  //
  //     }
  //
  //   let handleOptions = (query, update, options) => {
  //     if (options && options .upsert)
  //       options .upsert = Object .assign ({_id: query._id || this._createObjectID()}, update .$inc || update .$set || update);
  //     return options;
  //   }
  //
  //   col .findOneAndUpdate = async (query, update, options = {}) => {
  //     options = handleOptions (query, update, options);
  //     if (options .returnOriginal === undefined)
  //       options .returnOriginal = true;
  //     let res = await col .update (query, update, undefined, options);
  //     return res && res [0] && {value: res [0]}
  //   };
  //
  //   col .updateOne = async (query, update, options) => {
  //     options = handleOptions (query, update, options);
  //     await col. update (query, update, undefined, options);
  //   }
  //   col .findOneAndDelete = async query => {
  //     let res = await col .remove (query, undefined);
  //     return res && res [0] && {value: res [0]}
  //   }
  //   col .deleteOne  = async query => {
  //     let res = await col .remove (query, undefined);
  //     return {deletedCount: (res && res .length) || 0};
  //   }
  //   col .deleteMany = col .deleteOne;
  //
  //   return col;
  }
}

const LocalDBAdaptor_SCHEMA_UPGRADER = {
  _0_1: {
    'config': [
      {create: 'accounts'},
      {create: 'actuals'},
      {create: 'actualsMeta'},
      {create: 'balanceHistory'},
      {create: 'budgets'},
      {create: 'categories'},
      {create: 'counters'},
      {create: 'importRules'},
      {create: 'parameters'},
      {create: 'rateFuture'},
      {create: 'schedules'},
      {create: 'taxParameters'},
      {create: 'transactions', createIndexes: ['date', 'importTime', 'category', 'account']}
    ],
    'user': [
      {create: 'configurations'}
    ]
  }
 }