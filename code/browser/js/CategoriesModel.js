class CategoriesModel extends Observable {
  constructor () {
    super();
    this._model = new Model ('categories');
    this._model .addObserver (this, this._onModelChange);
  }

  delete() {
    this._model .delete();
  }

  _onModelChange (eventType, doc, arg, source) {
    if (this._categories)
      this._categories .onModelChange (eventType, doc, arg, source);
    this._notifyObservers (eventType, doc, arg, source);
  }

  getCategories() {
    return this._categories;
  }
}

class Categories {
  constructor (docs, allDocs) {
    this._index    = this._processDocs (docs);
    this._allIndex = this._processDocs (allDocs);
  }

  _processDocs (docs) {
    var index = docs .reduce ((map, doc) => {map .set (doc._id, doc); return map}, new Map());
    for (let doc of docs)
      this._addParentLink (doc, 'parent', 'children', index);
    return index;
  }

  _addParentLink (doc, parent='parent', children='children', index=this._index) {
    doc [parent] = doc [parent]? index .get (doc [parent]): undefined;
    if (doc [parent])
      var list = (doc [parent] [children] = doc [parent] [children] || [])
    else
      var list = (this._roots = this._roots || [])
    var i = list .findIndex (d => {return d .sort >= doc .sort});
    list .splice (i >=0? i: list.length + 1, 0, doc);
  }

  _removeParentLink (doc, parent='parent', children='children') {
    var list  = doc [parent]? doc [parent] [children]: this._roots;
    var index = list .indexOf (doc);
    if (index != -1)
      list .splice (index, 1);
  }

  _onModelChange (eventType, doc, arg, parent='parent', children='children') {
    switch (eventType) {
      case ModelEvent.UPDATE:
        let cat = this._index .get (doc._id);
        if (arg [parent])
          this._removeParentLink (cat, parent, children);
        for (let f in arg) {
          cat [f] = arg [f];
        }
        if (arg [parent])
          this._addParentLink (cat, parent, children);
        break;
      case ModelEvent.INSERT:
        this._index .set (doc._id, doc);
        this._addParentLink (doc, parent, children);
        break;
      case ModelEvent.REMOVE:
        this._removeParentLink (this._index .get (doc._id), parent, children);
        this._index .delete (doc._id);
        break;
    }
  }

  findOne (query) {
    for (let c of this._index .values())
      if (query (c))
        return c;
  }

  get (id) {
    return this._index .get (id) || this._allIndex .get (id); 
  }

  getPathname (doc) {
    return doc? this .getPathname (doc.parent) .concat ([doc.name]): [];
  }

  getPath (doc) {
    return doc? this .getPath (doc .parent) .concat (doc): [];
  }

  getSiblings (doc, parent='parent', children='children') {
    return this .getSiblingsAndSelf (doc, parent, children) .filter (s => {return s._id != doc._id})
  }

  getSiblingsAndSelf (doc, parent='parent', children='children') {
    return (doc [parent]? doc [parent] [children]: this._roots);
  }

  getRoots() {
    return this._roots;
  }

  getDescendants (doc) {
    return ((doc && doc .children) || []) .reduce ((d,c) => {return d .concat (c) .concat (this .getDescendants (c))}, [])
  }

  findBestMatch (name) {
    var f = (name, cats) => {
      if (!cats || !cats.length)
        return false;
      for (let c of cats)
        if (c .name && c.name .toLowerCase() .startsWith (name .toLowerCase()))
          return c;
      return f (
        name,
        cats
          .map    (c     => {return c.children})
          .filter (c     => {return c})
          .reduce ((a,c) => {return a .concat (c)}, [])
      );
    }
    var roots = this._roots;
    for (let n of Array.isArray (name)? name: [name]) {
      let match = f (n, roots);
      if (match)
        roots = [match];
      else
        return undefined;
    }
    return roots[0];
  }
}
