class LocalDB {
   constructor (name) {
     this._name = name;
   }

  async open (version, upgradeCallback) {
    this._db = new Promise ((resolve, reject) => {
      const request = indexedDB .open (this._name, version);
      request .onsuccess       = () => resolve (request .result);
      request .onerror         = () => reject  (request .error);
      request .onupgradeneeded = e => {
        for (let upgrade of upgradeCallback (e .oldVersion, e .newVersion)) {
          const db = e .target .result;
          let store;
          if (upgrade .delete)
            db .deleteObjectStore (upgrade .delete);
          else {
            if (upgrade .create)
              store = db .createObjectStore (upgrade .create, {keyPath: upgrade .key || '_id', autoIncrement: upgrade .autoIncrement})
            else if (upgrade .update)
              store = e .target .transaction .objectStore (upgrade .update);
            if (store) {
              for (let index of upgrade .createIndexes|| []) {
                const simple = typeof index == 'string';
                store .createIndex (simple? index: index .name, simple? index: index .property, simple? undefined: index .options)
              }
              for (let index of upgrade .deleteIndexes || [])
                store .deleteIndex (index);
            }
          }
        }
      }
    })
    this._db = await this._db;
  }

  getObjectStoreNames() {
     return [... this._db .objectStoreNames];
  }

  delete() {
    this .close();
    return new Promise ((resolve, reject) => {
      const request = indexedDB .deleteDatabase (this._name);
      request .onsuccess = () => resolve (true);
      request .onerror   = () => reject (request .error);
    });
  }

  transactionReadWrite (stores) {
    return new LocalTransaction (this._db, stores, 'readwrite');
  }

  transactionReadOnly (stores) {
    return new LocalTransaction (this._db, stores, 'readonly');
  }

  transactionReadWriteFlush (stores) {
    return new LocalTransaction (this._db, stores, 'readwriteflush');
  }

  close() {
     this._db .close();
  }
}

class LocalTransaction {
  constructor (db, stores, mode) {
    this._transaction = db .transaction (stores, mode);
    this._complete    = new Promise ((resolve, reject) => {
      this._transaction .oncomplete = e => resolve (e);
      this._transaction .onabort    = e => reject  (e);
      this._transaction .onerror    = e => reject  (e);
    })
  }

  findOneAndDelete (objectStoreName, query) {
    return this .delete (objectStoreName, query, {returnOriginal: true, oneOnly: true}) .then (result => result && result .length == 1 && result [0]);
  }

  findOneAndUpdate (objectStoreName, query, update, options = {}) {
    if (options .returnOriginal == undefined)
      options .returnOriginal = true;
    options .onlyOne = true;
    return this .update (objectStoreName, query, update, options) .then (result => result && result .length == 1 && result [0]);
  }

  insert (objectStoreName, value) {
    return new Promise ((resolve, reject) => {
      const objectStore  = this._transaction .objectStore (objectStoreName);
      const request      = objectStore .add (value);
      request .onsuccess = () => resolve (request .result);
      request .onerror   = () => reject  (request .error);
    });
  }

  async delete (objectStoreName, query, options = {}) {
    const objectStore   = this._transaction .objectStore (objectStoreName);
    if (! options .returnOriginal) {
      const [_, keyRange] = this._extractKeyRange (objectStore, query, false);
      if (Object .keys (query || {}) .length == 0)
        return new Promise ((resolve, reject) => {
          const request      = keyRange? objectStore .delete (keyRange): objectStore .clear();
          request .onsuccess = () => resolve (true);
          request .onerror   = () => reject  (request .error);
        })
    }
    const cursor   = this .findCursor (objectStoreName, query);
    const promises = [];
    while (await cursor .hasNext()) {
      const object = await cursor .next();
      if (Model_query_ismatch (query, object)) {
        promises .push (new Promise ((resolve, reject) => {
          const request      = cursor .delete();
          request .onsuccess = () => {resolve (options .returnOriginal? {value: object}: true)};
          request .onerror   = () => {reject  (request .error)};
        }));
        if (options .oneOnly)
          break;
      }
    }
    return Promise .all (promises);
  }

  async update (objectStoreName, query, update, options = {}) {
    const objectStore = this._transaction .objectStore (objectStoreName);
    const singleton   = query && query [objectStore .keyPath] && (typeof query [objectStore .keyPath] != 'object' || query [objectStore .keyPath] .$eq !== undefined);
    if (singleton) {
      let object = await this .findOne (objectStoreName, query);
      let original;
      if (options .returnOriginal)
        original = JSON .parse (JSON .stringify (object));
      if (object)
        object = this._applyUpdate (object, update, objectStore .keyPath);
      else if (options .upsert)
        object = this._applyUpsert (query, update);
      if (object)
        return new Promise ((resolve, reject) => {
          const request = objectStore .put (object);
          request .onsuccess = () => resolve ([options .returnOriginal !== undefined? {value: options .returnOriginal? original: object}: request .result]);
          request .onerror   = () => reject  (request .error);
        })
    } else {
      const cursor = this .findCursor (objectStoreName, query);
      if (! (await cursor .hasNext()) && options .upsert) {
        const object = this._applyUpsert (query, update);
        if (object)
          return new Promise ((resolve, reject) => {
            const request = objectStore .put (object);
            request .onsuccess = () => resolve (options .returnOriginal !== undefined? {value: options .returnOriginal? original: object}: request .result);
            request .onerror   = () => reject  (request .error);
          })
      } else {
        const promises = [];
        while (await cursor .hasNext()) {
          const object = await cursor .next();
          let   original;
          if (options .returnOriginal)
            original = JSON .parse (JSON .stringify (object));
          if (Model_query_ismatch (query, object)) {
            promises .push (new Promise ((resolve, reject) => {
              const request      = cursor .update (this._applyUpdate (object, update, objectStore .keyPath));
              request .onsuccess = () => resolve (options .returnOriginal !== undefined? {value: options .returnOriginal? original: object}: request .result);
              request .onerror   = () => {reject  (request .error)};
            }));
            if (options .onlyOne)
              break;
          }
        }
        return Promise .all (promises);
      }
    }
  }

  findArray (objectStoreName, query, count) {
    query = query && JSON .parse (JSON .stringify (query));
    return new Promise ((resolve, reject) => {
      const objectStore       = this._transaction .objectStore (objectStoreName);
      const [index, keyRange] = this._extractKeyRange (objectStore, query);
      const needFilter        = query &&  Object .keys (query) .length > 0;
      const request           = index? index .getAll (keyRange, needFilter? 0: count): objectStore .getAll (keyRange, needFilter? 0: count);
      request .onsuccess      = () => resolve (needFilter? request .result .filter (r => Model_query_ismatch (query, r)): request .result);
      request .onerror        = () => reject  (request .error);
    });
  }

  findOne (objectStoreName, query) {
    return new Promise ((resolve, reject) => {
      this .findArray (objectStoreName, query, 1)
        .then  (result => resolve  (result && result [0]))
        .catch (error => reject(error))
    })
  }

  findCursor (objectStoreName, query) {
    query                   = query && JSON .parse (JSON .stringify (query));
    const objectStore       = this._transaction .objectStore (objectStoreName);
    const [index, keyRange] = this._extractKeyRange (objectStore, query);
    const needFilter        = query && Object .keys (query) .length > 0;
    let   request, current, cursorAdvanced;

    const getNext = () =>
      new Promise ((resolve, reject) => {
        if (! request)
          request = index? index .openCursor (keyRange): objectStore .openCursor (keyRange);
        else
          request .result .continue();
        request .onsuccess = () => {
          if (request .result && needFilter && ! Model_query_ismatch (query, request .result .value))
            request .result .continue();
          else
            resolve (request .result);
        }
        request .onerror = () => reject (request .error);
      });

    current = getNext();
    return {
      next: () => {
        cursorAdvanced = true;
        return current .then (result => result && result .value)
      },
      hasNext: () => {
        if (cursorAdvanced) {
         current        = getNext();
         cursorAdvanced = false;
        }
        return current .then (result => !! result);
      },
      delete: ()     => request .result .delete(),
      update: update => request .result .update (update),
    }
  }

  hasCommitted() {
    return this._complete;
  }

  _extractKeyRange (objectStore, query, useIndex = true) {
    const queryProperties = Object .keys (query || {});
    for (let property of queryProperties)
      if (objectStore .keyPath == property) {
        const keyRange = this._selectorToKeyRange (query [property]);
        delete query [property];
        return [undefined, keyRange];
      }
    if (useIndex) {
      const indexes       = [... objectStore .indexNames] .map (indexName => objectStore .index (indexName));
      const indexKeyPaths = indexes .map (index => index .keyPath);
      for (let property of queryProperties) {
        const i = indexKeyPaths .findIndex (indexKeyPath => indexKeyPath == property);
        if (i != -1) {
          const keyRange = this._selectorToKeyRange (query [property]);
          delete query [property];
          return [indexes [i], keyRange];
        }
      }
    }
    if (queryProperties .includes ('$and'))
      for (const subQuery of query ['$and']) {
        const subResult = this._extractKeyRange (objectStore, subQuery, useIndex);
        if (subResult)
          return subResult;
      }
    return [undefined, undefined];
  }

  _selectorToKeyRange (sel) {
    if (! sel || typeof sel != 'object')
      sel = {$eq: sel};
    let keyRange;
    for (let op of Object .keys (sel)) {
      if (typeof sel [op] != 'object')
        switch (op) {
          case '$eq':
            if (! keyRange) {
              keyRange = IDBKeyRange .only (sel [op]);
              delete sel [op];
              return keyRange;
            }
          case '$gt':
            if (! keyRange) {
              keyRange = IDBKeyRange .lowerBound (sel [op], true);
              delete sel [op];
            } else if (keyRange .upper && ! keyRange .lower) {
              keyRange = IDBKeyRange .bound (sel [op], keyRange .upper, false, keyRange .upperOpen);
              delete sel [op];
            }
            break;
          case '$gte':
            if (! keyRange) {
              keyRange = IDBKeyRange .lowerBound (sel [op], false);
              delete sel [op];
            } else if (keyRange .upper && ! keyRange .lower) {
              keyRange = IDBKeyRange .bound (sel [op], keyRange .upper, true, keyRange .upperOpen);
              delete sel [op];
            }
            break;
          case '$lt':
            if (! keyRange) {
              keyRange = IDBKeyRange .upperBound (sel [op], true);
              delete sel [op];
            } else if (keyRange .lower && ! keyRange .upper) {
              keyRange = IDBKeyRange .bound (keyRange .lower, sel [op], keyRange .lowerOpen, true);
              delete sel [op];
            }
            break;
          case '$lte':
            if (! keyRange) {
              keyRange = IDBKeyRange .upperBound (sel [op], false);
              delete sel [op];
            } else if (keyRange .lower && ! keyRange .upper) {
              keyRange = IDBKeyRange .bound (keyRange .lower, sel [op], keyRange .lowerOpen, false);
              delete sel [op];
            }
            break;
        }
    }
    return keyRange;
  }

  _applyUpdate (object, update, keyPath) {
    const updateProperties = Object .keys (update);
    if (! updateProperties .find (updateProperty => updateProperty .startsWith ('$')))
      object = Object .assign (keyPath? {[keyPath]: object [keyPath]}: {}, update);
    else
      for (const updateProperty of updateProperties)
        switch (updateProperty) {
          case '$set':
            Object .assign (object, update .$set);
            break;
          case '$inc':
            for (const part of Object .keys (update .$inc))
              object [part] = (object [part] || 0) + update .$inc [part]
            break;
          case '$push':
            for (const part of Object .keys (update .$push))
              object [part] = (object [part] ||[]) .concat (update .$push [part])
            break;
          case '$pull':
            for (const part of Object .keys (update .$pull)) {
              if (! object [part])
                object [part] = [];
              else {
                const i = (object [part] || []) .indexOf (update .$pull [part]);
                if (i != -1)
                  object [part] .splice (i, 1);
              }
            }
            break;
          default:
            console .log ('unsupported update property', updateProperty);
            assert (false);
        }
    return object;
  }

  _applyUpsert (query, update) {
    update = this._applyUpdate ({}, update);
    if (! Object .keys (update) .find (p => p .startsWith ('$'))) {
      const eqQueryProperties = Object .keys (query)
        .reduce ((o, p) =>
          typeof query [p] != 'object' || query [p] .$eq !== undefined? Object .assign (o, {[p]: query [p] .$eq || query [p]}): o,
        {})
      return Object .assign (eqQueryProperties, update);
    }
  }
}



class LocalDBTest {
  static async run() {
    try {
      const db = new LocalDB ('test');
      await db .open (1, (oldVersion, newVersion) => {
        if (oldVersion == 0 && newVersion == 1)
          return [{create: 'foo', key: '_id', createIndexes: ['value']}];
        else
          return [];
      });
      const t = db .transactionReadWrite ('foo');

      await t .delete ('foo');

      await t .insert ('foo', {_id: 1, value: 1, name: 'a', blah: []});
      await t .insert ('foo', {_id: 2, value: 2, name: 'a', blah: [1,2]});
      await t .insert ('foo', {_id: 3, value: 3, name: 'b', blah: [2,3]});
      await t .insert ('foo', {_id: 4, value: 4, name: 'c', blah: [1,2,3,4]});
      await t .insert ('foo', {_id: 5, value: 5, name: 'c', blah: [4]});
      await t .insert ('foo', {_id: 6, value: 6, name: 'c', blah: [4,6]});

      let result;

      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $inc: {counter: 5}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && result[0] .value .counter == 5);
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $inc: {counter: 3}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && result[0]  .value .counter == 8);
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $inc: {counter: 3}}, {returnOriginal: true});
      assert(Array.isArray (result) && result .length == 1 && result[0]  .value .counter == 8);
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $push: {list: 3}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && result[0] .value .list && result[0] .value .list .length == 1 && result[0] .value .list .includes (3));
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $push: {list: 7}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && Array .isArray (result[0] .value .list) && result[0] .value .list .length == 2 && result[0] .value .list .includes (3) && result[0] .value .list .includes (7));
      result = await t .findArray ('foo', {list: 3});
      assert(result .length == 1 && result[0] ._id == 4);
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $pull: {list: 9}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && Array .isArray (result[0] .value .list) && result[0] .value .list .length == 2 && result[0] .value .list .includes (3) && result[0] .value .list .includes (7));
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $pull: {list: 7}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && Array .isArray (result[0] .value .list) && result[0] .value .list .length == 1 && result[0] .value .list .includes (3));
      result = await t .findArray ('foo', {list: null});
      assert(result .length == 5);
      result = await t .findArray ('foo', {list: [3]});
      assert(result .length == 1);
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $pull: {list: 3}}, {returnOriginal: false});
      result = await t .findArray ('foo', {list: []});
      assert(result .length == 1);
      result = await t .findArray ('foo', {no: null});
      assert(result .length == 6);
      result = await t .update ('foo', {_id: 4}, {$set: {name: 'updated'}, $inc: {counter: 5}}, {returnOriginal: false});
      assert(Array.isArray (result) && result .length == 1 && result[0].value.name=='updated' && result[0].value.counter==16);
      result = await t .update ('foo', {_id: 5}, {foo: 'zot', blah: 'bot'}, {returnOriginal: false});
      assert(Array .isArray (result) && result .length == 1 && Object .keys (result[0].value) .length == 3 && result[0].value._id==5, result[0].value.foo='zot', result[0].value.blah=='bot');
      await t .update ('foo', {_id: 20}, {foo:'hi'}, {upsert: true});
      result = await t .findOne ('foo', {_id: 20});
      assert (result && result.foo == 'hi');
      await t .update ('foo', {_id: {$eq: 30}}, {foo:'hi'}, {upsert: true});
      result = await t .findOne ('foo', {_id: 30});
      assert (result && result.foo == 'hi');
      result = await t .update ('foo', {name: 'a'}, {$set: {zot: 1}}, {returnOriginal: false});
      assert (result .length == 2 && result[0].value.zot==1 && result[1].value.zot==1);
      result = await t .findOneAndDelete ('foo', {foo:'hi'});
      assert(result && result .value && [10,20] .includes (result .value._id));
      assert((await t .findArray ('foo', {foo:'hi'})).length == 1);

      result = await t .findOneAndUpdate ('foo', {name: 'a'}, {$set: {found: 1}});
      assert(result && result .value && ! result .value .found);
      result = await t .findOneAndUpdate ('foo', {name: 'a'}, {$inc: {found: 1}}, {returnOriginal: false});
      assert(result && result .value && result .value .found == 2);
      result = await t .findArray ('foo', {found: {$ne: null}});
      assert(result.length == 1, result[0].name=='a', result[0].found==2);

      result = await t .findOneAndUpdate ('foo', {_id: 1000}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      assert(result.value && result.value._id==1000 && result.value.seq==1);
      result = await t .findOneAndUpdate ('foo', {_id: 1001}, {$push: {pu: 1}}, {upsert: true, returnOriginal: false});
      assert(result.value && result.value._id==1001 && Array.isArray (result.value.pu) && result.value.pu.length==1);
      result = await t .findOneAndUpdate ('foo', {_id: 1002}, {$pull: {px: 1}}, {upsert: true, returnOriginal: false});
      assert(result.value && result.value._id==1002 && Array.isArray (result.value.px) && result.value.px.length==0);

      const cur = t .findCursor ('foo');
      while (await cur .hasNext())
        console.log (await cur .next());
      await t .hasCommitted();

    } catch (e) {
      console.log (e);
    }
  }
}

window.indexedDB          = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBKeyRange        = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
const LocalDB_isSupported = !! window.indexedDB;
