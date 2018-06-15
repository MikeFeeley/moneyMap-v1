TransactionDBMeta_init (
  () => LocalDBAdaptor .createObjectID()
);

class LocalDBAdaptor extends DBAdaptor {

  constructor() {
    super();
    this._dbCache = new Map();
  }

  async perform (operation, data) {
    let raw;
    if (data .database) {
      data._db = await this._getDB (data .database, 1);
      if (data .collection) {
        raw = data .collection .indexOf ('$RAW');
        if (raw != -1)
          data .collection = data .collection .slice (0, raw);
      }
    }
    data._isTran = raw == -1 && (data .collection == 'actuals' || data .collection == 'transactions');
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

  static createObjectID() {
    return new Date() .getTime() .toString (16) + (Math .floor (Math .random() * 1000000000000000)) .toString (16)
  }

  async _getDB (name, version) {
    const key = name + '$' + version;
    return this._dbCache .get (key) || (this._dbCache .set (key, await this._createDB (name, version)) .get (key));
  }

  async _find (data) {
    if (data .collection == 'actuals')
      return await TransactionDBMeta_getActuals (this._getTDBMTransaction (data), data .query);
    else if (data .collection == 'accounts')
      return await TransactionDBMeta_findAccountAndRollForward (this._getTDBMTransaction (data), data .query);
    else {
      const t = data._db .transactionReadOnly ([data .collection]);
      return await t .findArray (data .collection, data .query);
    }
  }

  async _has (data) {
    return this._find (data) .length > 0;
  }

  _getTDBMTransaction (data) {
    return data._db .transactionReadWrite (['transactions', 'accounts', 'counters', 'actuals', 'actualsMeta']);
  }

  async _updateOne (data) {
    if (data._isTran) {
      const t = this._getTDBMTransaction (data);
      TransactionDBMeta_update (t, data .id, data .update);
      await t .hasCommitted();
    } else  {
      const t = data._db .transactionReadWrite ([data .collection]);
      t .update (data .collection, {_id: data .id}, {$set: data .update});
      await t .hasCommitted();
    }
    return true;
  }

  async _updateList (data) {
    if (data._isTran) {
      const t = this._getTDBMTransaction (data)
      for (let item of data .list)
        TransactionDBMeta_update (t, item .id, item .update);
      await t .hasCommitted();
    } else {
      const t = await data._db .transactionReadWrite ([data .collection]);
      for (const item of data .list)
        t .update (data .collection, {_id: item .id}, {$set: item .update});
      await t .hasCommitted();
    }
    return data .list .map (_ => true);
   }

  async _insertOne (data) {
    if (data._isTran) {
      const t = this._getTDBMTransaction (data);
      data .insert = await TransactionDBMeta_insert (t, data .insert);
      await t .hasCommitted();
    } else {
      if (! data .insert._id)
        data .insert._id = LocalDBAdaptor .createObjectID();
      const t = data._db .transactionReadWrite ([data .collection] .concat (data .insert._seq !== undefined && ! data .insert._seq? 'counters': []));
      if (data .insert._seq !== undefined && ! data .insert._seq)
        data .insert._seq = (await t .findOneAndUpdate ('counters', {_id: data .collection}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})) .value .seq;
      const result = await t .insert (data .collection, data .insert);
      await t .hasCommitted();
    }
    return data .insert;
  }

  async _insertList (data) {
    if (data._isTran) {
      const t = this._getTDBMTransaction (data);
      for (const item of data .list)
        TransactionDBMeta_insert (t, item);
      await t .hasCommitted();
    } else {
      const t = data._db .transactionReadWrite ([data .collection] .concat (true || data .list .find (i => i._seq !== undefined && ! i._seq)? 'counters': []));
      const needSeqCount = data .list .filter (item => item._seq !== undefined && ! item._seq) ;
      let   seq = needSeqCount &&
        (await t .findOneAndUpdate (
          'counters', {_id: data .collection}, {$inc: {seq: needSeqCount}}, {upsert: true, returnOriginal: true}
        )) .value .seq;
      for (const item of data .list) {
        if (! item._id)
          item._id = LocalDBAdaptor .createObjectID();
        if (item._seq !== undefined && ! item._seq)
          item._seq = ++ seq;
        t .insert (data .collection, item);
      }
      await t .hasCommitted();
    }
    return data .list .map (_ => true);
  }

  async _removeOne (data) {
    if (data._isTran) {
      const t = this._getTDBMTransaction (data);
      TransactionDBMeta_remove (t, data .id);
      await t .hasCommitted();
    } else {
      const t = data._db .transactionReadWrite ([data .collection]);
      await t .delete (data .collection, {_id: data .id});
      await t .hasCommitted();
    }
    return true;
  }

  async _removeList (data) {
    if (data._isTran) {
      const t = this._getTDBMTransaction (data);
      for (const id of data .list)
        TransactionDBMeta_remove (t, data .id);
      await t .hasCommitted();
    } else {
      const t = data._db .transactionReadWrite ([data .collection]);
      for (const id of data .list)
        t .delete (data .collection, {_id: id});
      await t .hasCommitted();
    }
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
    const t = data._db .transactionReadWrite (['budgets', 'categories', 'schedules']);
    const budget = await t .findOne ('budgets', {_id: data .from});
    if (budget) {
      budget .name = 'Copy of ' + budget .name;
      budget._id   = LocalDBAdaptor .createObjectID();
      t .insert ('budgets', budget);
      t .update ('categories', {budgets: data .from}, {$addToSet: {budgets: budget._id}});
      const cur = t .findCursor ('schedules', {budget: data .from});
      while (await cur .hasNext()) {
        const schedule   = await cur .next();
        schedule._id     = LocalDBAdaptor .createObjectID();
        schedule .budget = budget._id;
        t .insert ('schedules', schedule);
      }
      await t .hasCommitted();
    }
    return budget;
  }

  async _removeBudget (data) {
    const t = data._db .transactionReadWrite (['budgets', 'categories', 'schedules', 'transactions']);
    t .delete ('budgets', {_id: data .id});
    const delCandidates = (await t .findArray ('categories', {budgets: [data .id]})) .map (c => c._id);
    const inUseList = (await Promise .all (delCandidates .map (dc => t .findOne ('transactions', {category: dc}))))
      .filter (tran => tran)
      .map    (tran => tran .category);
    const inUse = inUseList .reduce ((set, c) => set .add (c), new Set());
    let cids    = inUseList;
    while (cids .length) {
      cids = (await t .findArray ('categories', {_id: {$in: cids}})) .map (c => c .parent) .filter (p => p);
      cids .forEach (c => inUse .add (c));
    }
    const del = delCandidates .filter (c => ! inUse .has (c));
    t .delete ('categories', {_id: {$in: del}});
    t .update ('categories', {budgets: data .id}, {$pull: {budgets: data .id}});
    t .delete ('schedules',  {budget: data .id});
    await t .hasCommitted();
  }

  async _removeConfiguration (data) {
    await data._db .delete();
  }

}

const LocalDBAdaptor_SCHEMA_UPGRADER = {
  _0_1: {
    'config': [
      {create: 'accounts'},
      {create: 'actuals', createIndexes: ['month']},
      {create: 'actualsMeta', key: 'type'},
      {create: 'balanceHistory', createIndexes: ['account']},
      {create: 'budgets'},
      {create: 'categories'},
      {create: 'counters'},
      {create: 'importRules'},
      {create: 'parameters'},
      {create: 'rateFuture', createIndexes: ['account']},
      {create: 'schedules', createIndexes: ['budget']},
      {create: 'taxParameters'},
      {create: 'transactions', createIndexes: ['date', 'importTime', 'category', 'account']}
    ],
    'user': [
      {create: 'configurations'}
    ]
  }
}