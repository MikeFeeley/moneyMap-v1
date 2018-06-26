// Jun 26 2018: Safari bug on index cursor:
// after calling update or delete on cursor, continue skips over records with same index key as updated/deleted record
// delete this (used in findCursor) when Safari bug is fixed.
const SAFARI_INDEX_CURSOR_UPDATE_DELETE_BUG = isSafari;

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
          if (upgrade .create)
            store = db .createObjectStore (upgrade .create, {keyPath: upgrade .key || '_id', autoIncrement: upgrade .autoIncrement})
          if (upgrade .update)
            store = e .target .transaction .objectStore (upgrade .update);
          if (store) {
            for (let index of upgrade .deleteIndexes || [])
              store .deleteIndex (index);
            for (let index of upgrade .createIndexes|| []) {
              const simple = typeof index == 'string';
              store .createIndex (simple? index: index .name, simple? index: index .property, simple? undefined: index .options)
            }
          }
        }
      }
    })
    this._db = await this._db;
  }

  getDB() {
     return this._db;
  }

  getName() {
     return this._name;
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
    return new LocalTransaction (this, stores, 'readwrite');
  }

  transactionReadOnly (stores) {
    return new LocalTransaction (this, stores, 'readonly');
  }

  transactionReadWriteFlush (stores) {
    return new LocalTransaction (this, stores, 'readwriteflush');
  }

  close() {
     this._db .close();
  }
}

class LocalTransaction {
  constructor (localDB, stores, mode) {
    this._localDB     = localDB;
    this._mode        = mode;
    this._transaction = this._localDB .getDB() .transaction (stores, mode);
    this._complete    = new Promise ((resolve, reject) => {
      this._transaction .oncomplete = e => resolve (e);
      this._transaction .onabort    = e => reject  (e);
      this._transaction .onerror    = e => reject  (e);
    });
  }

  getDatabaseName() {
    return this._localDB .getName();
  }

  findOneAndDelete (objectStoreName, query) {
    return this .delete (objectStoreName, query, {returnOriginal: true, onlyOne: true}) .then (result => result && result .length == 1 && result [0]);
  }

  findOneAndUpdate (objectStoreName, query, update, options = {}) {
    if (options .returnOriginal == undefined)
      options .returnOriginal = true;
    options .onlyOne = true;
    return this .update (objectStoreName, query, update, options) .then (result => result && result .length == 1 && result [0]);
  }

  updateOne (objectStoreName, query, update, options = {}) {
    options .onlyOne = true;
    return this .update (objectStoreName, query, update, options);
  }

  deleteOne (objectStoreName, query) {
    return this .delete (objectStoreName, query, {onlyOne: true});
  }

  deleteMany (objectStoreName, query) {
    return this .delete (objectStoreName, query);
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
      const keyRanges = this._extractKeyRanges (objectStore, query, false, options .onlyOne);
      if (Object .keys (query || {}) .length == 0)
        return Promise .all (keyRanges .map (([index, keyRange]) =>
          new Promise ((resolve, reject) => {
              const request      = keyRange? objectStore .delete (keyRange): objectStore .clear();
              request .onsuccess = () => resolve (true);
              request .onerror   = () => reject  (request .error);
          })
        ));
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
        if (options .onlyOne)
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
        original = JSON .parse (JSON .stringify (object || {}));
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
    const objectStore = this._transaction .objectStore (objectStoreName);
    const keyRanges   = this._extractKeyRanges (objectStore, query);
    const needFilter  = query &&  Object .keys (query) .length > 0;

    return Promise .all (keyRanges .map (([index, keyRange]) => {
      return new Promise ((resolve, reject) => {
        const request      = index? index .getAll (keyRange, needFilter? 0: count): objectStore .getAll (keyRange, needFilter? 0: count);
        request .onsuccess = () => resolve (needFilter? request .result .filter (r => Model_query_ismatch (query, r)): request .result);
        request .onerror   = () => reject  (request .error);
      })
    })) .then (results => results .reduce ((result, r) => result .concat (r)));
  }

  findOne (objectStoreName, query) {
    return new Promise ((resolve, reject) => {
      this .findArray (objectStoreName, query, 1)
        .then  (result => resolve  (result && result [0]))
        .catch (error => reject(error))
    })
  }

  find (ObjectStoreName, query) {
    return this .findCursor (ObjectStoreName, query);
  }

  findCursor (objectStoreName, query) {
    const originalQuery = query;
    query               = query && JSON .parse (JSON .stringify (query));
    const objectStore   = this._transaction .objectStore (objectStoreName);
    const keyRanges     = this._extractKeyRanges (objectStore, query);

    if (SAFARI_INDEX_CURSOR_UPDATE_DELETE_BUG && this._mode .startsWith ('readwrite') && keyRanges .length > 1 || keyRanges [0][0] !== undefined) {
      const resultsPromise = this .findArray (objectStoreName, originalQuery);
      let results;
      let cursor;

      return {
        next: ()  => {
          if (results)
            return results [++cursor]
          else
            return resultsPromise .then (r => {
              results = r;
              cursor  = 0;
              return results [0];
            });
        },
        hasNext: () => {
          if (results)
            return cursor < results .length - 1;
          else
            return resultsPromise .then (r => {
              results = r;
              cursor  = -1;
              return results .length > 0;
            });
        },
        delete: ()     => objectStore .delete (results [cursor] [objectStore .keyPath]),
        update: update => objectStore .put    (update)
      };

    } else {
      const needFilter   = query && Object .keys (query) .length > 0;
      let   request, current, cursorAdvanced, keyRangeCursor = 0;

      const getNext = () =>
        new Promise ((resolve, reject) => {
          const [index, keyRange] = keyRanges [keyRangeCursor];
          if (! request)
            request = index? index .openCursor (keyRange): objectStore .openCursor (keyRange);
          else
            request .result .continue();
          request .onsuccess = () => {
            if (! request .result && keyRangeCursor < keyRanges .length - 1) {
              keyRangeCursor += 1;
              request = null;
              getNext()
                .then  (result => resolve (result))
                .catch (error  => reject  (error));
            } else if (request .result && needFilter && ! Model_query_ismatch (query, request .result .value))
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
  }

  hasCommitted() {
    return this._complete;
  }

  _extractKeyRanges (objectStore, query, useIndex = true, onlyOneRange) {
    const indexes       = useIndex? [... objectStore .indexNames] .map (indexName => objectStore .index (indexName)): [];
    const indexKeyPaths = indexes .map (index => index .keyPath);

    const extractKeyRange = query => {
      const queryProperties = Object .keys (query || {});
      for (let property of queryProperties)
        if (objectStore .keyPath == property) {
          const keyRange = this._selectorToKeyRange (query [property], onlyOneRange);
          if (keyRange) {
            delete query [property];
            return Array .isArray (keyRange)? keyRange .map (k => [undefined, k]) : [[undefined, keyRange]];
          }
        }
      if (useIndex) {
        for (let property of queryProperties) {
          const i = indexKeyPaths .findIndex (indexKeyPath => indexKeyPath == property);
          if (i != -1) {
            const keyRange = this._selectorToKeyRange (query [property], onlyOneRange);
            if (keyRange) {
              delete query [property];
              return Array .isArray (keyRange)? keyRange .map (k => [indexes [i], k]): [[indexes [i], keyRange]];
            }
          }
        }
      }
      if (queryProperties .includes ('$and'))
        for (const subQuery of query .$and) {
          const subResult = extractKeyRange (subQuery);
          if (subResult .length)
            return subResult;
        }
      if (queryProperties .includes ('$or')) {
        const canUseKeyRange = ! onlyOneRange && ! query .$or .find (subQuery =>
          Object .keys (subQuery) .find (p => p != objectStore .keyPath && ! indexKeyPaths .includes (p))
        );
        if (canUseKeyRange) {
          const result = query .$or .map (subQuery => extractKeyRange (subQuery));
          query .$or = query .$or .filter (subQuery => Object .keys (subQuery) .length > 0);
          if (query .$or .length == 0)
            delete query .$or;
          const includesEmpty = !! result .find (e => e .length == 0);
          return result .reduce ((a,e) => a .concat(e)) .concat (includesEmpty? [[]]: []);
        }
      }
      return [];
    }

    const result = extractKeyRange (query);
    return result .length? result: [[undefined, undefined]];
  }

  _selectorToKeyRange (sel, onlyOneRange) {
    if (! sel || typeof sel != 'object')
      sel = {$eq: sel};
    let keyRange;
    for (let op of Object .keys (sel)) {
      if (typeof sel [op] != 'object' || Array .isArray (sel [op]))
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
          case '$in':
            if (! onlyOneRange && ! keyRange && Array .isArray (sel [op]) && sel [op] .length > 0) {
              keyRange = sel [op] .map (v => IDBKeyRange .only (v));
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
          case '$addToSet':
            for (const part of Object .keys (update .$addToSet))
              if (! object [part] || ! object [part] .includes (update .$addToSet [part]))
                object [part] = (object [part] ||[]) .concat (update .$addToSet [part])
            break;
          case '$pull':
            for (const part of Object .keys (update .$pull)) {
              if (! object [part])
                object [part] = [];
              else if (Array .isArray (object [part]))
                object [part] = object [part] .filter (objectPartElement =>
                  typeof objectPartElement == 'object'
                    ? ! Model_query_ismatch (update .$pull [part], objectPartElement)
                    : update .$pull [part] != objectPartElement
                )
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
          return [{create: 'foo', key: '_id', createIndexes: ['value', 'category']}];
        else
          return [];
      });
      const t = db .transactionReadWrite ('foo');
      let result, c;

      await t .delete ('foo');

      await t .insert ('foo', {_id: 1, value: 1, name: 'a', blah: []});
      await t .insert ('foo', {_id: 2, value: 2, name: 'a', blah: [1,2]});
      await t .insert ('foo', {_id: 3, value: 3, name: 'b', blah: [2,3]});
      await t .insert ('foo', {_id: 4, value: 4, name: 'c', blah: [1,2,3,4]});
      await t .insert ('foo', {_id: 5, value: 5, name: 'c', blah: [4]});
      await t .insert ('foo', {_id: 6, value: 6, name: 'c', blah: [4,6]});


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

      result = await t .findArray ('foo', {_id: {$in: [3,5]}});
      assert(result && result .length == 2 && result[0]._id == 3 && result[1]._id == 5);
      result = await t .findArray ('foo', {$or: [{_id: 3}, {_id: 5}]});
      assert(result && result .length == 2 && result[0]._id == 3 && result[1]._id == 5);
      result = await t .findArray ('foo', {$or: [{_id: 3}, {_id: 5}, {name: 'b'}]});
      assert(result.length==2);
      result = await t .findArray ('foo', {$or: [{_id: 3}, {_id: 5}, {name: 'a'}]});
      assert(result.length==4);

      result = [];
      c = t .findCursor ('foo', {$or: [{_id: 1}, {_id: 3}]});
      while (await c .hasNext())
        result.push(await c .next());
      assert(result.length == 2);
      result = [];
      c = t .findCursor ('foo', {$or: [{_id: 1}, {_id: 99}]});
      while (await c .hasNext())
        result.push(await c .next());
      assert(result.length == 1);
      result = [];
      c = t .findCursor ('foo', {$or: [{_id: 1}, {name: 'c'}]});
      while (await c .hasNext())
        result.push(await c .next());
      assert(result.length == 2);

      result = await t .delete ('foo', {_id: {$in: [1,5,9]}});
      result = await t .findArray('foo');
      assert(result.length == 8);
      await t .delete ('foo', {$or: [{_id: 3},{_id: 6}]});
      result = await t .findArray('foo');
      assert(result.length == 6);

      result = await t .deleteOne ('foo',{_id: {$in: [1,1000,1001]}});
      result = await t .findArray ('foo');
      assert(result.length == 5);

      result = await t .findArray ('foo', {value: {$in: [2,4]}});
      assert(result.length==2);

      result = await t .update ('foo', {_id: 4}, {$addToSet: {blah: 3}}, {returnOriginal: false});
      assert(result[0].value.blah.length == 4);
      result = await t .update ('foo', {_id: 4}, {$addToSet: {blah: 5}}, {returnOriginal: false});
      assert(result[0].value.blah.length == 5);

      await t .insert ('foo', {_id: 200, pt: [1,2,3,4]});
      await t .insert ('foo', {_id: 201, pt: [1,2,4]});
      await t .insert ('foo', {_id: 202, pt: [1,2,3,4]});

      await t .insert ('foo', {_id: 300, foo: [{bar: 1}, {bar: 2}, {bar: 3}]});
      await t .insert ('foo', {_id: 301, foo: [{bar: 3}, {bar: 4}, {bar: 5}]});
      result = await t.findArray ('foo', {foo: {$elemMatch: {bar: 3}}});
      assert(result.length == 2);
      result = await t.findArray ('foo', {foo: {$elemMatch: {bar: {$gt: 1}}}});
      assert(result.length == 2);
      result = await t.findArray ('foo', {foo: {$elemMatch: {bar: {$gt: 4}}}});
      assert(result.length == 1);
      result = await t.findArray ('foo', {foo: {$elemMatch: {bar: {$gt: 6}}}});
      assert(result.length == 0);
      result = await t .findArray ('foo', {'foo.bar': 3});
      assert (result.length == 2);
      result = await t .findArray ('foo', {'foo.bar': {$gt: 1}});
      assert (result.length == 2);
      result = await t .findArray ('foo', {'foo.bar': {$gt: 4}});
      assert (result.length == 1);
      result = await t .findArray ('foo', {'foo.bar': {$gt: 6}});
      assert (result.length == 0);
      await t.insert ('foo', {_id: 400, foo: {bar: 1, bat: 2}});
      await t.insert ('foo', {_id: 401, foo: {bar: 1, bat: 3}});
      result = await t.findArray('foo', {'foo.bar': 1});
      assert (result.length==3);
      result = await t.findArray('foo', {'foo.bat': 2});
      assert (result.length==1);
      result = await t.findArray('foo', {'foo.bar': 6});
      assert (result.length==0);

      await t.insert ('foo', {_id: 500, foo: [{bar: 1, bat: 2}, {bar: 2, bat: 3}, {bar: 1}, {bat: 3}]})
      result = await t .update('foo', {_id: 500}, {$pull: {foo: {bar: 1}}}, {returnOriginal: false});
      assert(result[0].value.foo.length==2);
      result = await t .update('foo', {_id: 500}, {$pull: {foo: {bar: 2, bat: 3}}}, {returnOriginal: false});
      assert(result[0].value.foo.length==1);

      await t .delete ('foo');
      await t .insert ('foo', {_id: 600, category:null});
      await t .insert ('foo', {_id: 601, category:''});
      await t .insert ('foo', {_id: 602});
      await t .insert ('foo', {_id: 603, category: 0});
      await t .insert ('foo', {_id: 604, category: 1});
      await t .insert ('foo', {_id: 605});
      result = await t .findArray ('foo', {_id: {$gte: 600, $lte: 604}, category: null});
      assert(result .length == 2);
      result = await t .findArray ('foo', {_id: {$gte: 600, $lte: 604}, category: {$exists: true}});
      assert (result .length == 4);
      result = await t .findArray ('foo', {_id: {$gte: 600, $lte: 604}, category: {$exists: false}});
      assert (result .length == 1);
      result = await t .findArray ('foo', {_id: {$gte: 600, $lte: 604}, $or: [{category: null}, {category: ''}, {category: {$exists: false}}]});
      assert (result .length == 3);
      result = await t .findArray ('foo', {$or: [{category: null}, {category: ''}, {category: {$exists: false}}]});
      result = await t .findArray ('foo', {$or: [{category: null}, {category: 0}]});
      assert (result .length == 3);

      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      result = await t .findOneAndUpdate ('foo', {_id: 600}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false});
      assert (result .value .seq == 9);

      await t .insert ('foo', {_id: 700, month: 201806});
      await t .insert ('foo', {_id: 701, month: 201806});
      await t .insert ('foo', {_id: 702, month: 201806});
      await t .insert ('foo', {_id: 703, month: 201806});
      await t .insert ('foo', {_id: 704, month: 201806});
      await t .insert ('foo', {_id: 705, month: 201807});
      await t .deleteMany ('foo', {$and: [{month: {$gte: 201806}}, {month: {$lte: 201806}}]});
      result = await t .findArray ('foo', {_id: {$gte: 700, $lte: 705}});
      assert (result.length == 1 && result[0]._id==705);

      await t .insert ('foo', {_id: 800, category: 201806});
      await t .insert ('foo', {_id: 801, category: 201806});
      await t .insert ('foo', {_id: 802, category: 201806});
      await t .insert ('foo', {_id: 803, category: 201806});
      await t .insert ('foo', {_id: 804, category: 201806});
      await t .insert ('foo', {_id: 805, category: 201807});

      await t .update ('foo', {category: 201806}, {$set: {blah: 1}});
      result = await t .findArray ('foo', {blah: 1});
      assert (result .length == 5);

      await t .update ('foo', {_id: {$gte: 802, $lte: 804}}, {$set: {blah: 2}});
      result = await t .findArray ('foo', {blah: 2});
      assert (result .length == 3);

      await t .deleteMany ('foo', {category: 201806});
      result = await t .findArray ('foo', {_id: {$gte: 800, $lte: 805}});
      assert (result .length == 1);

      // const cur = t .findCursor ('foo');
      // while (await cur .hasNext())
      //   console.log (await cur .next());

      await t .hasCommitted();

      console.log('All tests pass.');

    } catch (e) {
      console.log (e);
    }
  }
}

window.indexedDB          = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
window.IDBKeyRange        = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
const LocalDB_isSupported = !! window.indexedDB;
