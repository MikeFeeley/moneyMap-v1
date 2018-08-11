'use strict';

const ObjectID = require ('mongodb') .ObjectID;
const tranMeta = require ('../browser/js/TransactionDBMeta');

class TransDBMeta_pseudoTran {
  constructor (db, req) {
    this._db  = db;
    this._req = req;
    const finders  = ['findOne', 'findOneAndDelete'];
    const updaters = ['insert', 'updateOne', ];
    const deleters = ['deleteOne', 'deleteMany'];
    for (const fn of finders)
      this [fn] = async function() {
        const args = [... arguments];
        const docs = this._db .collection (args [0]) [fn] (... args .slice (1));
        return this._req
          ? docs .then (docs =>
            fn == 'findOneAndDelete'
              ? {value: this._req .decrypt (docs .value, args[0])}
              : this._req .decrypt (docs, args [0])
            )
          : docs;
      }
    for (const fn of updaters) {
      this [fn] = function() {
        const args = [... arguments];
        if (this._req)
          args [args .length - 1] = this._req .encrypt (args [args .length - 1], args [0]);
        return this._db .collection (args [0]) [fn] (... args .slice (1));
      }
    }
    for (const fn of deleters)
      this [fn] = function () {
        const args = [... arguments];
        return this._db .collection (args [0]) [fn] (... args .slice (1));
      }
  }
  findArray (collection, query) {
    return this._db .collection (collection) .find (query) .toArray() .then (docs => this._req? this._req .decrypt (docs, collection): docs);
  }

  find (collection, query) {
    const result = this._db .collection (collection) .find (query);
    return {
      toArray: () => result .then (docs => this._req? this._req .decrypt (docs, collection): docs),
      hasNext: () => result .hasNext(),
      next:    () => result .next() .then (doc => this._req? this._req .decrypt (doc, collection): doc),
    }
  }

  findOneAndUpdate (collection, query, update, options = {}) {
    if (this._req)
      update = this._req .encrypt (update, collection);
    const result = this._db .collection (collection) .findOneAndUpdate (query, update, options);
    return result .then (result => this._req? {value: this._req .decrypt (result .value, collection)}: result);
  }

  getDatabaseName() {
    return this._db .databaseName;
  }

  hasCommitted() {}
}

for (const fn of ['insert', 'update', 'remove', 'findAccountAndRollForward', 'getActuals'])
  exports [fn] = function () {
    const args = [... arguments];
    return tranMeta [fn] (new TransDBMeta_pseudoTran (args [0], args .slice (-1) [0]), ... args .slice (1, -1));
  }

tranMeta .init(
  () => new ObjectID() .toString()
)
