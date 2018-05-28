/**
 * Data Model
 */

class Model extends Observable {

  /**
   * collectionName
   */
  constructor (collectionName, database) {
    super();
    this._ids        = new Set();
    this._groups     = new Map();
    this._database   = database || _default_database_id;
    this._collection = _Collection .getInstanceForModel (collectionName, this._database);
    this._observer   = this._collection .addObserver (this, this._handleCollectionEvent);
  }

  static setDatabase (database) {
    _default_database_id = database;
    _Collection._resetUndo();
  }

  static addRemoteDatabaseObserver (thisArg, observer) {
    _Collection .addRemoteDatabaseObserver (thisArg, observer);
  }

  static databaseConnect() {
    if (_db && _default_database_id && ! _default_database_id .endsWith (Model_LOCAL_COLLECTION))
      _db .connect();
  }

  static async databaseDisconnect() {
    if (_db && _default_database_id && ! _default_database_id .endsWith (Model_LOCAL_COLLECTION))
      _db .disconnect();
  }

  getDatabase() {
    return this._database;
  }

  static newUndoGroup() {
    _Collection .newUndoGroup();
  }

  /**
   * Returns true iff doc matches most recent find call to model
   */
  _contains (doc, remoteUpdate) {
    if (this._options && this._options .groupBy)
      var docs = this._groups .get (doc [this._options .groupBy])
    for (let d of docs || [doc]) {
      let containsDoc = (! remoteUpdate && this._options && this._options .updateDoesNotRemove && this._ids .has (d._id)) ||
        _query_ismatch (this._query, d) || (this._isObserver && _query_ismatch (this._observerQuery, d));
      if (containsDoc)
        return true;
    }
    return false;
  }

  /**
   * Send COPY of document to each observer.
   */
  async _notifyObserversAsync (eventType, doc, arg, source) {
    await super._notifyObserversAsync (eventType, Object .keys (doc) .reduce ((o,k) => {o [k] = doc [k]; return o}, {}), arg, source);
  }

  async _addGroupToModel (doc) {
    if (this._options && this._options .groupBy && doc [this._options .groupBy]) {
      var group = this._groups .get (doc [this._options .groupBy]);
      if (!group) {
        group = [];
        this._groups .set (doc [this._options .groupBy], group)
      }
      group .push (doc);
      var query = {}
      query [this._options .groupBy] = doc [this._options .groupBy];
      for (let g of await this._collection .find (query)) {
        if (!this._ids .has (g._id)) {
          this._ids .add (g._id);
          group .push (g);
          await this._notifyObserversAsync (ModelEvent .INSERT, g, null, null);
        }
      }
    }
  }

  _removeGroupFromModel (doc) {
    if (this._options && this._options .groupBy && doc [this._options .groupBy]) {
      var group = this._groups .get (doc [this._options .groupBy]) || [];
      var idx = group .indexOf (doc);
      if (idx >= 0)
        group .splice (idx, 1);
      if (group .length == 0)
        this._groups .delete (doc [this._options .groupBy]);
    }
  }

  /**
   * Called by Collection when state changes.  Calls model callbacks.
   *    Updates that changed model membership yield INSERT or REMOVE callbacks
   *    Callbacks are sent to all models.
   */
  async _handleCollectionEvent (eventType, doc, arg, fromModel, source) {
    let remoteUpdate = source == _COLLECTION_REMOTE_SOURCE;
    switch (eventType) {
      case ModelEvent .UPDATE:
        if (doc) {
          if (this._ids .has (doc._id) || this._isObserver) {
            if (this._contains (doc, remoteUpdate) || (this._options && this._options .updateDoesNotRemove && ! remoteUpdate)) {
              if (this._options && this._options .groupBy && arg [this._options .groupBy] != null)
                await this._addGroupToModel (doc);
              await this._notifyObserversAsync (ModelEvent .UPDATE, doc, arg, source);
            } else if (!this._options || !this._options .updateDoesNotRemove || remoteUpdate) {
              this._ids .delete (doc._id);
              await this._notifyObserversAsync (ModelEvent .REMOVE, doc, doc._id, source);
              this._removeGroupFromModel (doc);
            }
          } else if (this._contains (doc, remoteUpdate)) {
            await this._notifyObserversAsync (ModelEvent .INSERT, doc, arg, source);
            this._ids .add (doc._id);
            await this._addGroupToModel (doc);
          }
        }
        break;
      case ModelEvent .INSERT:
        if (doc && this._contains (doc)) {
          await this._notifyObserversAsync (ModelEvent .INSERT, doc, arg, source);
          this._ids .add (doc._id);
          await this._addGroupToModel (doc);
        }
        break;
      case ModelEvent .REMOVE:
        if ((doc && this._ids .has (doc._id)) || this._isObserver) {
          await this._notifyObserversAsync (ModelEvent .REMOVE, doc, arg, source);
          this._ids .delete (doc._id);
          this._removeGroupFromModel (doc);
        }
        break;
    }
  }

  /**
   * Query server to determine if any documents match query
   */
  async has (query, cacheOnly = false) {
    return this._collection .hasFromCache (query) || (! cacheOnly && this._collection .has (query));
  }

  /**
   * Query server and return matching documents
   */
  async find (query, append = false, cacheOnly = false) {
    this._options = query && query .$options;
    if (query && query .$options)
      query = Object .keys (query) .reduce ((o,k) => {if (k != '$options') o [k] = query [k]; return o}, {});
    cacheOnly = cacheOnly || (this._options && this._options .cacheOnly);
    let docs = cacheOnly? this._collection .findFromCache (query): await this._collection .find (query);
    this._query = (this._query && append)? {$or: [this._query, query]}: query;
    if (this._options && this._options .groupBy) {
      let groups =
        docs
          .filter (d => {return d [this._options .groupBy]})
          .map    (d => {return d [this._options .groupBy]})
          .sort()
          .reduce ((a,e) => {if (a .length == 0 || a [a .length - 1] != e) a .push (e); return a}, [])
      docs = docs
        .filter (d => {return ! d [this._options .groupBy]})
      query = {};
      query [this._options .groupBy] = {$in: groups};
      let groupDocs = cacheOnly? this._collection .findFromCache (query): (await this._collection .find (query));
      docs = docs .concat (groupDocs);
      this._groups = groups .reduce ((map,group) => {
        map .set (group, groupDocs .filter (d => {return d [this._options .groupBy] == group}));
        return map;
      }, new Map());
    }
    if (docs) {
      let ids = docs .reduce ((set, doc) => {set .add (doc._id); return set}, new Set());
      if (append)
        for (let id of ids)
          this._ids .add (id);
      else
        this._ids = ids;
      return docs .map (d => {
        return Object .keys (d) .reduce ((o,f) => {o[f] = d[f]; return o}, {});
      })
    }
  }

  /**
   * Observe model changes that match query
   */
  observe (query) {
    this._observerQuery = query;
    this._isObserver    = true;
  }

  /**
   * Query local cache of all requests to collection (all previous find from any model) using isMatch callback
   */
  refine (isMatch) {
    return this._collection .refine (isMatch) .map (d => {
      return Object .keys (d) .reduce ((o,f) => {o[f] = d[f]; return o}, {});
    })
  }

  get (id) {
    var doc = this._collection .get (id);
    return Object .keys (doc) .reduce ((o,f) => {o[f] = doc[f]; return o}, {});
  }

  /**
   * Update document with specified id
   *   returns true iff update succeeded
   */
  async update (id, update, source) {
    return await this._collection .update (id, update, source);
  }

  /**
   * Update list
   */
  async updateList (list, source) {
    return await this._collection .updateList (list, source);
  }

  /**
   * Insert document
   *    returns inserted doc if successful, falsy otherwise
   */
  async insert (insert, source) {
    var result = await this._collection .insert (insert, source);
    if (result)
      this._ids .add (result._id);
    return result;
  }

  /**
   * Insert list of documents
   *    returns an array of inserted docs or falsy for each insert (in order)
   */
   async insertList (list, source) {
     var results = await this._collection .insertList (list, source);
     for (let result of results)
       if (result)
         this._ids .add (result._id);
     return results;
   }

  /**
   * Remove document with specified id
   *    returns true iff successful
   */
  async remove (id, source) {
    var ok = await this._collection .remove (id, source);
    if (ok)
      this._ids .delete (id);
    return ok;
  }

  /**
   * Remove list of docuement with specified ids
   *    returns true iff successful
   */
  async removeList (list, source) {
    var ok = await this._collection .removeList (list, source);
    if (ok)
      for (let id of list)
        this._ids .delete (id);
    return ok;
  }

  static async copyDatabase (from, to) {
    return _Collection .copyDatabase (from, to);
  }

  static async copyBudget (from) {
    return _Collection .copyBudget (from);
  }

  static async removeBudget (id) {
    return _Collection .removeBudget (id);
  }

  static async removeConfiguration (database) {
    return _Collection .removeConfiguration (database);
  }

  static async login (username, password) {
    return _Collection .login (username, password);
  }

  static async signup (data) {
    return _Collection .signup (data);
  }

  static async updateUser (id, accessCap, update, password) {
    return _Collection .updateUser (id, accessCap, update, password);
  }

  /**
   * Delete this model from collection; stops callbacks.
   */
  delete() {
    this._collection .deleteObserver (this._observer);
    this .deleteObservers();
  }
}

/**
 * Event type for model change callback
 */
var ModelEvent = {
  UPDATE: 0,
  INSERT: 1,
  REMOVE: 2
}

var _COLLECTION_REMOTE_SOURCE = '_CRS_';
var Model_LOCAL_COLLECTION    = '_LOCAL';

/******************
 * PRIVATE HELPERS
 ******************/


var _db;
var _local_db;
var _collections = new Map();
var _default_database_id;
var _tid;
var _undoLog;
var _redoLog;


/**
 * Database collection
 * Cashes union of all requests for refine and update.
 */
class _Collection extends Observable {

  constructor (name, database) {
    super();
    this._name     = name;
    this._docs     = new Map();
    this._database = database;
    if (! _tid) {
      _tid     = 1;
      _undoLog = [];
      _redoLog = [];
      document .documentElement .addEventListener ('keydown', e => {
        if (e .keyCode == 90 && e .metaKey) {
          (async () => {await (e.shiftKey? _Collection._redo: _Collection._undo) ()})();
          e .preventDefault();
          e .stopPropagation();
          return false;
        }
      }, false);
     }
    _Collection .getDatabaseInstance (database) .addObserver (this, this .onDbChange);
  }

  static getInstanceForModel (name, database) {
    let dbType = database .split ('_') [0];
    let dbColl = _collections .get (dbType) || (_collections .set (dbType, new Map()) .get (dbType));
    if (!dbColl || ! dbColl .database || dbColl .database != database) {
      dbColl = {database: database, collections: new Map()}
      _collections .set (dbType, dbColl);
    }
    return dbColl .collections .get (name) || dbColl .collections .set (name, new _Collection (name, database)) .get (name);
  }

  static getDatabaseInstance (database) {
    let isLocal = database .endsWith (Model_LOCAL_COLLECTION);
    if (! _db) {
      _db       = new RemoteDBAdaptor();
      _local_db = new LocalDBAdaptor();
    }
    return isLocal? _local_db: _db;
  }

  static addRemoteDatabaseObserver (thisArg, observer) {
    _Collection .getDatabaseInstance ('') .addObserver (thisArg, observer);
  }

  _getDB() {
    return this._database .endsWith (Model_LOCAL_COLLECTION)? _local_db: _db;
  }

  async onDbChange (eventType, arg) {

    let processUpdate = async item => {
      let doc  = this._docs .get (item .id);
      if (doc) {
        let orig = Object .keys (item .update) .reduce ((o,f) => {o[f] = doc[f]; return o}, {});
        this._processUpdate (doc, orig, item .update, _COLLECTION_REMOTE_SOURCE);
      }
    }

    let processRemove = async id => {
      let doc = this._docs .get (id);
      if (doc)
        await this._processRemove (doc);
    }
    if (eventType == DBAdaptorEvent .UPCALL && arg .database == this._database) {
      for (let upcall of arg .upcalls)
        if (upcall .collection == this._name) {

          if (upcall .update)
            await processUpdate (upcall);

          if (upcall .updateList)
            for (let item of upcall .updateList)
              await processUpdate (item);

          if (upcall .insert)
            await this._processInsert (upcall .insert);

          if (upcall .insertList)
            for (let item of upcall .insertList)
              await this._processInsert (item);

          if (upcall .remove)
            await processRemove (upcall .remove);

          if (upcall .removeList)
            for (let id of upcall .removeList)
              await processRemove (id);
        }
    }
  }

  async has (query) {
    return this._getDB() .perform (DatabaseOperation .HAS, {database: this._database, collection: this._name, query: query});
  }

  async find (query) {
    var docs = await this._getDB() .perform (DatabaseOperation .FIND, {database: this._database, collection: this._name, query: query});
    if (docs)
      for (let doc of docs)
        this._docs .set (doc._id, doc);
    return docs;
  }

  findFromCache (query) {
    return Array .from (this._docs .values()) .filter (d => {return _query_ismatch (query,d)})
  }

  hasFromCache (query) {
    return Array .from (this._docs .values()) .find (d => {return _query_ismatch (query,d)}) != null;
  }

  refine (ismatch) {
    var docs = [];
    for (let entry of this._docs) {
      let doc = entry [1];
      if (ismatch (doc))
        docs .push (doc);
    }
    return docs;
  }

  get (id) {
    return this._docs .get (id);
  }

  async _processUpdate (doc, orig, update, source) {
    for (let f in update) {
      doc [f]                   = update [f];
      update ['_original_' + f] = orig   [f];
    }
    await this._notifyObserversAsync (ModelEvent.UPDATE, doc, update, this, source);
  }

  async update (id, update, source, isUndo, tid) {
    var doc  = this._docs .get (id);
    if (doc) {
      var orig = {}
      for (let f in update)
        orig [f] = doc [f];
      var ok  = await this._getDB() .perform (DatabaseOperation .UPDATE_ONE, {database: this._database, collection: this._name, id: id, update: update})
      if (ok) {
        let undo = Object .keys (update) .reduce ((o,f) => {o [f] = orig [f] || ''; return o}, {})
        _Collection._logUndo (this, this .update, [id, undo], isUndo, tid);
        await this._processUpdate (doc, orig, update, source);
      }
      return ok;
    }
  }

  async updateList (list, source, isUndo, tid) {
    if (list .length == 0)
      return true;
    var origs = []
    var docs  = []
    for (let item of list) {
      var doc = this._docs .get (item .id);
      var orig = {}
      for (let f in item .update)
        orig [f] = doc [f];
      origs .push (orig);
      docs  .push (doc);
    }
    var ok  = await this._getDB() .perform (DatabaseOperation .UPDATE_LIST, {database: this._database, collection: this._name, list: list});
    if (ok) {
      var undo = []
      for (let item of list) {
        var doc  = docs  .shift();
        var orig = origs .shift();
        undo .push ({id: item .id, update: Object .keys (item .update) .reduce ((o,f) => {o [f] = doc [f] || ''; return o}, {})});
        await this._processUpdate (doc, orig, item .update, source);
      }
      _Collection._logUndo (this, this .updateList, [undo], isUndo, tid);
    }
    return ok;
  }

  async _processInsert (insert, source) {
    this._docs .set (insert._id, insert);
    await this._notifyObserversAsync (ModelEvent.INSERT, insert, undefined, this, source);
  }

  async insert (insert, source, isUndo, tid) {
    var result = await this._getDB() .perform (DatabaseOperation .INSERT_ONE, {database: this._database, collection: this._name, insert: insert});
    if (result) {
      _Collection._logUndo (this, this .remove, [result._id], isUndo, tid);
      for (let f of Object .keys (result) .filter (f => {return f .startsWith ('_')}))
        insert [f] = result [f];
      await this._processInsert (insert, source);
      return insert;
    }
  }

  async insertList (list, source, isUndo, tid) {
    var results = await this._getDB() .perform (DatabaseOperation .INSERT_LIST, {database: this._database, collection: this._name, list: list})
    var undo    = [];
    for (let i = 0; i < list .length; i++)
      if (results [i]) {
        undo .push (results [i]._id);
        for (let f of Object .keys (results [i]) .filter (f => {return f .startsWith ('_')}))
          list [i] [f] = results [i] [f];
        await this._processInsert (list [i], source);
        results [i] = list [i];
      }
      if (undo .length)
        _Collection._logUndo (this,this .removeList, [undo], isUndo, tid);
    return results;
  }

  async _processRemove (doc, source) {
    this._docs .delete (doc._id);
    await this._notifyObserversAsync (ModelEvent.REMOVE, doc, undefined, this, source);
  }

  async remove (id, source, isUndo, tid) {
    let ok  = await this._getDB() .perform (DatabaseOperation .REMOVE_ONE, {database: this._database, collection: this._name, id: id});
    if (ok) {
      let doc = this._docs .get (id);
      if (doc) {
        _Collection._logUndo (this, this .insert, [doc], isUndo, tid);
        await this._processRemove (doc, source);
      }
    }
    return ok;
  }

  async removeList (list, source, isUndo, tid) {
    var results = await this._getDB() .perform (DatabaseOperation .REMOVE_LIST, {database: this._database, collection: this._name, list: list});
    var undo    = [];
    for (let i = 0; i < list .length; i++)
      if (results [i]) {
        var doc = this._docs .get (list [i]);
        if (doc) {
          undo .push (doc);
          await this._processRemove (doc, source);
        }
      }
      if (undo .length)
        _Collection._logUndo (this, this .insertList, [undo], isUndo, tid);
    return results;
  }

  static async copyDatabase (from, to) {
    return _Collection .getDatabaseInstance (from) .perform (DatabaseOperation .COPY_DATABASE, {from: from, to: to});
  }

  static async copyBudget (from) {
    return _Collection .getDatabaseInstance (_default_database_id) .perform (DatabaseOperation .COPY_BUDGET, {database: _default_database_id, from: from});
  }

  static async removeBudget (id) {
    return _Collection .getDatabaseInstance (_default_database_id) .perform (DatabaseOperation .REMOVE_BUDGET, {database: _default_database_id, id: id});
  }

  static async removeConfiguration (database) {
    return _Collection .getDatabaseInstance (database) .perform (DatabaseOperation .REMOVE_CONFIGURATION, {database: database});
  }

  static async login (username, password) {
    return _db .perform (DatabaseOperation .LOGIN, {username: username, password: password});
  }

  static async signup (data) {
    return _db .perform (DatabaseOperation .SIGNUP, data);
  }

  static async updateUser (id, accessCap, update, password) {
    return _db .perform (DatabaseOperation .UPDATE_USER, {id: id, accessCap: accessCap, update: update, password: password});
  }

  static newUndoGroup() {
    _tid ++;
  }

  static _logUndo (collection, op, args, isUndo, tid) {
    var log = isUndo? _redoLog: _undoLog;
    log .push ({tid: tid || _tid, collection: collection, op: op, args: args});
  }

  static async _processLog (isUndo) {
    var log = isUndo? _undoLog: _redoLog;
    while (log .length && (!tid || log [log .length - 1] .tid == tid)) {
      var le  = log .pop();
      var tid = le .tid || -1;
      await le .op .apply (le .collection, le .args .concat ([null, isUndo, tid]));
    }
  }

  static async _undo() {
    await _Collection ._processLog (true);
  }

  static async _redo() {
    await _Collection ._processLog (false);
  }

  static _resetUndo() {
    _redoLog = [];
    _undoLog = []
  }
}

function _query_ismatch (query, doc) {
  function matchField (field, op, val) {
    if (typeof doc [field] == 'undefined')
      return (op == '$eq' && ! val) || (op == '$ne' && val) || (op == '$notregex');
    switch (op) {
      case '$eq':
        return Array .isArray (doc [field])? doc [field] .includes (val) : doc [field] == val;
      case '$gt':
        return doc [field] >  val;
      case '$gte':
        return doc [field] >= val;
      case '$lt':
        return doc [field] <  val;
      case '$lte':
        return doc [field] <= val;
      case '$ne':
        return doc [field] != val;
      case '$in':
        return val .includes (doc [field]);
      case '$nin':
        return ! val .includes (doc [field]);
      case '$regex':
        return doc [field] && doc [field] .match (new RegExp (val));
      case '$regexi':
        return doc [field] && doc [field] .match (new RegExp (val, 'i'));
      case '$notregex':
        return ! doc [field] || ! doc [field] .match (new RegExp (val));
    }
  }
  if (!query)
    return true;
  var match = true;
  for (let k in query) {
    let v = query [k];
    switch (k) {
      case '$and':
        match = !v.length || (_query_ismatch (v[0], doc) && _query_ismatch ({'$and': v.slice(1)},doc));
        break;
      case '$or':
        match = !v.length || (_query_ismatch (v[0], doc) || (v.length > 1 && _query_ismatch ({'$or': v.slice(1)},doc)));
        break;
      case '$not':
        match = !v.length || (!_query_ismatch (v[0], doc));
        break;
      case '$nor':
        match = !v.length || (!_query_ismatch (v[0], doc) && _query_ismatch ({'$nor': v.slice(1)},doc));
        break;
      case '$limit': case '$sort':
        break;
      default:
        if (typeof v == 'object' && v != null) {
          for (let vk in v)
            if (! matchField (k, vk, v[vk])) {
              match = false;
              break;
            }
        } else
          match = matchField (k, '$eq', v);
    }
    if (! match)
      break;
  }
  return match;
}


