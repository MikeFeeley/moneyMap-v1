/**
 * Data Model
 */

class Model extends Observable {

  /**
   * collectionName
   */
  constructor (collectionName, database) {
    super()
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

  getDatabase() {
    return this._database;
  }

  static newUndoGroup() {
    _Collection .newUndoGroup();
  }

  /**
   * Returns true iff doc matches most recent find call to model
   */
  _contains (doc) {
    if (this._options && this._options .groupBy)
      var docs = this._groups .get (doc [this._options .groupBy])
    for (let d of docs || [doc])
      if ((this._options && this._options .updateDoesNotRemove && this._ids .has (d._id)) || _query_ismatch (this._query, d))
        return true;
    return false;
  }

  /**
   * Send COPY of document to each observer.
   */
  _notifyObservers (eventType, doc, arg, source) {
    super._notifyObservers (eventType, Object .keys (doc) .reduce ((o,k) => {o [k] = doc [k]; return o}, {}), arg, source);
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
          this._notifyObservers (ModelEvent .INSERT, g, null, null);
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
    switch (eventType) {
      case ModelEvent .UPDATE:
        if (doc) {
          if (this._ids .has (doc._id) || this._isObserver) {
            if (this._contains (doc) || (this._options && this._options .updateDoesNotRemove)) {
              if (this._options && this._options .groupBy && arg [this._options .groupBy] != null)
                await this._addGroupToModel (doc);
              this._notifyObservers (ModelEvent .UPDATE, doc, arg, source);
            } else if (!this._options || !this._options .updateDoesNotRemove) {
              this._ids .delete (doc._id);
              this._notifyObservers (ModelEvent .REMOVE, doc, doc._id);
              this._removeGroupFromModel (doc);
            }
          } else if (this._contains (doc)) {
            this._notifyObservers (ModelEvent .INSERT, doc, arg);
            this._ids .add (doc._id);
            await this._addGroupToModel (doc);
          }
        }
        break;
      case ModelEvent .INSERT:
        if (doc && this._contains (doc)) {
          this._notifyObservers (ModelEvent .INSERT, doc, arg, source);
          this._ids .add (doc._id);
          await this._addGroupToModel (doc);
        }
        break;
      case ModelEvent .REMOVE:
        if ((doc && this._ids .has (doc._id)) || this._isObserver) {
          this._notifyObservers (ModelEvent .REMOVE, doc, arg, source);
          this._ids .delete (doc._id);
          this._removeGroupFromModel (doc);
        }
        break;
    }
  }

  /**
   * Query server and return matching documents
   */
  async find (query, append = false, cacheOnly = false) {
    this._options = query && query .$options;
    if (query && query .$options)
      query = Object .keys (query) .reduce ((o,k) => {if (k != '$options') o [k] = query [k]; return o}, {});
    var docs = cacheOnly? this._collection .findFromCache (query): await this._collection .find (query);
    this._query = (this._query && append)? {$or: [this._query, query]}: query;
    if (this._options && this._options .groupBy) {
      var groups =
        docs
          .filter (d => {return d [this._options .groupBy]})
          .map    (d => {return d [this._options .groupBy]})
          .sort()
          .reduce ((a,e) => {if (a .length == 0 || a [a .length - 1] != e) a .push (e); return a}, [])
      docs = docs
        .filter (d => {return ! d [this._options .groupBy]})
      query = {};
      query [this._options .groupBy] = {$in: groups};
      var groupDocs = (await this._collection .find (query));
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
    this._query      = query;
    this._isObserver = true;
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
   * Check update list
   */
  async checkUpdateList (list, source) {
    return await this._collection .checkUpdateList (list, source);
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
   * Remove docuement with specified id
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

  static async login (username, password) {
    return await _Collection .login (username, password);
  }

  static async signup (data) {
    return await _Collection .signup (data);
  }

  static async updateUser (id, accessCap, update, password) {
    return await _Collection .updateUser (id, accessCap, update, password);
  }

  /**
   * Delete this model from collection; stops callbacks.
   */
  delete() {
    this._collection .deleteObserver (this._observer);
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


/******************
 * PRIVATE HELPERS
 ******************/


var _db          = new RemoteDBAdaptor();
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
      $('body') .keydown (e => {
        if (e .keyCode == 90 && e .metaKey) {
          (async () => {await (e.shiftKey? _Collection._redo: _Collection._undo) ()})();
          e .preventDefault();
          return false;
        }
      })
    }
  }

  static getInstanceForModel (name, database) {
    let cd = _collections .get (name)     || _collections .set (name,     new Map())                        .get (name);
    return   cd           .get (database) || cd           .set (database, new _Collection (name, database)) .get (database);
  }

  async find (query) {
    var docs = await _db .perform (DatabaseOperation .FIND, {database: this._database, collection: this._name, query: query});
    if (docs)
      for (let doc of docs)
        this._docs .set (doc._id, doc);
    return docs;
  }

  findFromCache (query) {
    return Array .from (this._docs .values()) .filter (d => {return _query_ismatch (query,d)})
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

  async update (id, update, source, isUndo, tid) {
    var doc  = this._docs .get (id);
    if (doc) {
      var orig = {}
      for (let f in update)
        orig [f] = doc [f];
      var ok  = await _db .perform (DatabaseOperation .UPDATE_ONE, {database: this._database, collection: this._name, id: id, update: update})
      if (ok) {
        var undo = Object .keys (update) .reduce ((o,f) => {o [f] = doc [f] || ''; return o}, {})
        _Collection._logUndo (this, this .update, [id, undo], isUndo, tid);
        for (let f in update) {
          doc [f]                   = update [f];
          update ['_original_' + f] = orig   [f];
        }
        await this._notifyObservers (ModelEvent.UPDATE, doc, update, this, source);
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
    var ok  = await _db .perform (DatabaseOperation .UPDATE_LIST, {database: this._database, collection: this._name, list: list});
    if (ok) {
      var undo = []
      for (let item of list) {
        var doc  = docs  .shift();
        var orig = origs .shift();
        undo .push ({id: item .id, update: Object .keys (item .update) .reduce ((o,f) => {o [f] = doc [f] || ''; return o}, {})});
        for (let f in item .update) {
          doc [f]                         = item .update [f];
          item .update ['_original_' + f] = orig         [f];
        }
        await this._notifyObservers (ModelEvent.UPDATE, doc, item .update, this, source);
      }
      _Collection._logUndo (this, this .updateList, [undo], isUndo, tid);
    }
    return ok;
  }

  async checkUpdateList (list, source, isUndo, tid) {
    if (list .length == 0)
      return true;
    return await _db .perform (DatabaseOperation .CHECK_UPDATE_LIST, {database: this._database, collection: this._name, list: list});
  }

  async insert (insert, source, isUndo, tid) {
    var result = await _db .perform (DatabaseOperation .INSERT_ONE, {database: this._database, collection: this._name, insert: insert});
    if (result) {
      _Collection._logUndo (this, this .remove, [result._id], isUndo, tid);
      for (let f of Object .keys (result) .filter (f => {return f .startsWith ('_')}))
        insert [f] = result [f];
      this._docs .set (insert._id, insert);
      await this._notifyObservers (ModelEvent.INSERT, insert, undefined, this, source);
      return insert;
    }
  }

  async insertList (list, source, isUndo, tid) {
    var results = await _db .perform (DatabaseOperation .INSERT_LIST, {database: this._database, collection: this._name, list: list})
    var undo    = [];
    for (let i = 0; i < list .length; i++)
      if (results [i]) {
        undo .push (results [i]._id);
        for (let f of Object .keys (results [i]) .filter (f => {return f .startsWith ('_')}))
          list [i] [f] = results [i] [f];
        this._docs .set (list [i]._id, list [i]);
        await this._notifyObservers (ModelEvent.INSERT, list [i], undefined, this, source);
        results [i] = list [i];
      }
      if (undo .length)
        _Collection._logUndo (this,this .removeList, [undo], isUndo, tid);
    return results;
  }

  async remove (id, source, isUndo, tid) {
    var ok  = await _db .perform (DatabaseOperation .REMOVE_ONE, {database: this._database, collection: this._name, id: id});
    if (ok) {
      var doc = this._docs .get (id);
      _Collection._logUndo (this, this .insert, [doc], isUndo, tid);
      this._docs .delete (id);
      await this._notifyObservers (ModelEvent.REMOVE, doc, undefined, this, source);
    }
    return ok;
  }

  async removeList (list, source, isUndo, tid) {
    var results = await _db .perform (DatabaseOperation .REMOVE_LIST, {database: this._database, collection: this._name, list: list})
    var undo    = [];
    for (let i = 0; i < list .length; i++)
      if (results [i]) {
        var doc = this._docs .get (list [i]);
        undo .push (doc);
        this._docs .delete (list [i]);
        await this._notifyObservers (ModelEvent.REMOVE, doc, undefined, this, source);
      }
      if (undo .length)
        _Collection._logUndo (this, this .insertList, [undo], isUndo, tid);
    return results;
  }

  static async login (username, password) {
    return await _db .perform (DatabaseOperation .LOGIN, {username: username, password: password});
  }

  static async signup (data) {
    return await _db .perform (DatabaseOperation .SIGNUP, data);
  }

  static async updateUser (id, accessCap, update, password) {
    return await _db .perform (DatabaseOperation .UPDATE_USER, {id: id, accessCap: accessCap, update: update, password: password});
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
        return doc [field] && doc [field] .match (new RegExp (val))
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


