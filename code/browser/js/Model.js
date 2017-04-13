/**
 * Data Model
 */

class Model extends Observable {

  /**
   * collectionName
   */
  constructor (collectionName) {
    super()
    this._ids        = new Set();
    this._groups     = new Map();
    this._collection = _Collection .getInstanceForModel (collectionName, this);
    this._observer   = this._collection .addObserver (this, this._handleCollectionEvent);
  }

  static setDatabase (database) {
    _db .setDatabase (database);
  }

  static getDatabase() {
    return _db .getDatabase();
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

  *_addGroupToModel (doc) {
    if (this._options && this._options .groupBy && doc [this._options .groupBy]) {
      var group = this._groups .get (doc [this._options .groupBy]);
      if (!group) {
        group = [];
        this._groups .set (doc [this._options .groupBy], group)
      }
      group .push (doc);
      var query = {}
      query [this._options .groupBy] = doc [this._options .groupBy];
      for (let g of yield* this._collection .find (query)) {
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
  *_handleCollectionEvent (eventType, doc, arg, fromModel, source) {
    switch (eventType) {
      case ModelEvent .UPDATE:
        if (doc) {
          if (this._ids .has (doc._id) || this._isObserver) {
            if (this._contains (doc) || (this._options && this._options .updateDoesNotRemove)) {
              if (this._options && this._options .groupBy && arg [this._options .groupBy] != null)
                yield* this._addGroupToModel (doc);
              this._notifyObservers (ModelEvent .UPDATE, doc, arg, source);
            } else if (!this._options || !this._options .updateDoesNotRemove) {
              this._ids .delete (doc._id);
              this._notifyObservers (ModelEvent .REMOVE, doc, doc._id);
              this._removeGroupFromModel (doc);
            }
          } else if (this._contains (doc)) {
            this._notifyObservers (ModelEvent .INSERT, doc, arg);
            this._ids .add (doc._id);
            yield* this._addGroupToModel (doc);
          }
        }
        break;
      case ModelEvent .INSERT:
        if (doc && this._contains (doc)) {
          this._notifyObservers (ModelEvent .INSERT, doc, arg, source);
          this._ids .add (doc._id);
          yield* this._addGroupToModel (doc);
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
  *find (query) {
    this._options = query && query .$options;
    if (query && query .$options)
      query = Object .keys (query) .reduce ((o,k) => {if (k != '$options') o [k] = query [k]; return o}, {});
    this._query = query;
    var docs    = yield* this._collection .find (this._query);
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
      var groupDocs = (yield* this._collection .find (query));
      docs = docs .concat (groupDocs);
      this._groups = groups .reduce ((map,group) => {
        map .set (group, groupDocs .filter (d => {return d [this._options .groupBy] == group}));
        return map;
      }, new Map());
    }
    if (docs) {
      this._ids = docs .reduce ((set, doc) => {set .add (doc._id); return set}, new Set());
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
   * Query local cache of all requests to collection (all previous find from any model)
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
  *update (id, update, source) {
    return yield* this._collection .update (id, update, source);
  }

  /**
   * Update list
   */
  *updateList (list, source) {
    return yield* this._collection .updateList (list, source);
  }

  /**
   * Check update list
   */
  *checkUpdateList (list, source) {
    return yield* this._collection .checkUpdateList (list, source);
  }

  /**
   * Insert document
   *    returns inserted doc if successful, falsy otherwise
   */
  *insert (insert, source) {
    var result = yield* this._collection .insert (insert, source);
    if (result)
      this._ids .add (result._id);
    return result;
  }

  /**
   * Insert list of documents
   *    returns an array of inserted docs or falsy for each insert (in order)
   */
   *insertList (list, source) {
     var results = yield* this._collection .insertList (list, source);
     for (let result of results)
       if (result)
         this._ids .add (result._id);
     return results;
   }

  /**
   * Remove docuement with specified id
   *    returns true iff successful
   */
  *remove (id, source) {
    var ok = yield* this._collection .remove (id, source);
    if (ok)
      this._ids .delete (id);
    return ok;
  }

  /**
   * Remove list of docuement with specified ids
   *    returns true iff successful
   */
  *removeList (list, source) {
    var ok = yield* this._collection .removeList (list, source);
    if (ok)
      for (let id of list)
        this._ids .delete (id);
    return ok;
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
var _tid;
var _undoLog;
var _redoLog;

/**
 * Database collection
 * Cashes union of all requests for refine and update.
 */
class _Collection extends Observable {

  constructor (name) {
    super();
    this._name = name;
    this._docs = new Map();
    if (! _tid) {
      _tid     = 1;
      _undoLog = [];
      _redoLog = [];
      $('body') .keydown (e => {
        if (e .keyCode == 90 && e .metaKey) {
          async (null, e.shiftKey? _Collection._redo: _Collection._undo) ();
          e .preventDefault();
          return false;
        }
      })
    }
  }

  static getInstanceForModel (name, model) {
    var c = _collections.get (name);
    if (!c) {
      c = new _Collection (name);
      _collections.set (name, c);
    }
    return c;
  }

  *find (query) {
    var docs = yield* _db .perform (DatabaseOperation .FIND, {collection: this._name, query: query});
    if (docs)
      for (let doc of docs)
        this._docs .set (doc._id, doc);
    return docs;
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

  *update (id, update, source, isUndo, tid) {
    var doc  = this._docs .get (id);
    if (doc) {
      var orig = {}
      for (let f in update)
        orig [f] = doc [f];
      var ok  = yield* _db .perform (DatabaseOperation .UPDATE_ONE, {collection: this._name, id: id, update: update})
      if (ok) {
        var undo = Object .keys (update) .reduce ((o,f) => {o [f] = doc [f] || ''; return o}, {})
        _Collection._logUndo (this, this .update, [id, undo], isUndo, tid);
        for (let f in update) {
          doc [f]                   = update [f];
          update ['_original_' + f] = orig   [f];
        }
        yield* this._notifyObserversGenerator (ModelEvent.UPDATE, doc, update, this, source);
      }
      return ok;
    }
  }

  *updateList (list, source, isUndo, tid) {
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
    var ok  = yield* _db .perform (DatabaseOperation .UPDATE_LIST, {collection: this._name, list: list});
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
        yield* this._notifyObserversGenerator (ModelEvent.UPDATE, doc, item .update, this, source);
      }
      _Collection._logUndo (this, this .updateList, [undo], isUndo, tid);
    }
    return ok;
  }

  *checkUpdateList (list, source, isUndo, tid) {
    if (list .length == 0)
      return true;
    return yield* _db .perform (DatabaseOperation .CHECK_UPDATE_LIST, {collection: this._name, list: list});
  }

  *insert (insert, source, isUndo, tid) {
    var result = yield* _db .perform (DatabaseOperation .INSERT_ONE, {collection: this._name, insert: insert});
    if (result) {
      _Collection._logUndo (this, this .remove, [result._id], isUndo, tid);
      for (let f of Object .keys (result) .filter (f => {return f .startsWith ('_')}))
        insert [f] = result [f];
      this._docs .set (insert._id, insert);
      yield* this._notifyObserversGenerator (ModelEvent.INSERT, insert, undefined, this, source);
      return insert;
    }
  }

  *insertList (list, source, isUndo, tid) {
    var results = yield* _db .perform (DatabaseOperation .INSERT_LIST, {collection: this._name, list: list})
    var undo    = [];
    for (let i = 0; i < list .length; i++)
      if (results [i]) {
        undo .push (results [i]._id);
        for (let f of Object .keys (results [i]) .filter (f => {return f .startsWith ('_')}))
          list [i] [f] = results [i] [f];
        this._docs .set (list [i]._id, list [i]);
        yield* this._notifyObserversGenerator (ModelEvent.INSERT, list [i], undefined, this, source);
        results [i] = list [i];
      }
      if (undo .length)
        _Collection._logUndo (this,this .removeList, [undo], isUndo, tid);
    return results;
  }

  *remove (id, source, isUndo, tid) {
    var ok  = yield* _db .perform (DatabaseOperation .REMOVE_ONE, {collection: this._name, id: id});
    if (ok) {
      var doc = this._docs .get (id);
      _Collection._logUndo (this, this .insert, [doc], isUndo, tid);
      this._docs .delete (id);
      yield* this._notifyObserversGenerator (ModelEvent.REMOVE, doc, undefined, this, source);
    }
    return ok;
  }

  *removeList (list, source, isUndo, tid) {
    var results = yield* _db .perform (DatabaseOperation .REMOVE_LIST, {collection: this._name, list: list})
    var undo    = [];
    for (let i = 0; i < list .length; i++)
      if (results [i]) {
        var doc = this._docs .get (list [i]);
        undo .push (doc);
        this._docs .delete (list [i]);
        yield* this._notifyObserversGenerator (ModelEvent.REMOVE, doc, undefined, this, source);
      }
      if (undo .length)
        _Collection._logUndo (this, this .insertList, [undo], isUndo, tid);
    return results;
  }

  static newUndoGroup() {
    _tid ++;
  }

  static _logUndo (collection, op, args, isUndo, tid) {
    var log = isUndo? _redoLog: _undoLog;
    log .push ({tid: tid || _tid, collection: collection, op: op, args: args});
  }

  static *_processLog (isUndo) {
    var log = isUndo? _undoLog: _redoLog;
    while (log .length && (!tid || log [log .length - 1] .tid == tid)) {
      var le  = log .pop();
      var tid = le .tid || -1;
      yield* le .op .apply (le .collection, le .args .concat ([null, isUndo, tid]));
    }
  }

  static *_undo() {
    yield* _Collection ._processLog (true);
  }

  static *_redo() {
    yield* _Collection ._processLog (false);
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


