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
  constructor (docs, budget) {
    this._index = docs .reduce ((map, doc) => {map .set (doc._id, doc); return map;}, new Map());
    this._budget = budget;
    for (let doc of docs)
      this._addParentLink (doc, 'parent', doc .budgets .includes (budget .getId())? 'children': 'zombies');
  }

  _addParentLink (doc, parent='parent', children='children') {
    doc [parent] = doc [parent]? this._index .get (doc [parent]): undefined;
    if (doc [parent])
      var list = (doc [parent] [children] = doc [parent] [children] || [])
    else if (doc .budgets .includes (this._budget .getId()))
      var list = (this._roots = this._roots || [])
    else
      return;
    var index = list .findIndex (d => {return d .sort >= doc .sort});
    list .splice (index >=0? index: list.length + 1, 0, doc);
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
        if (arg .budgets && parent == 'parent') {
          if (! cat .budgets .includes (this._budget .getId())) {
            this._removeParentLink (cat);
            if (cat .parent)
              cat .parent .zombies = (cat .parent .zombies || []) .concat (cat);
          }
        }
        break;
      case ModelEvent.INSERT:
        this._index .set (doc._id, doc);
        this._addParentLink (doc, parent, children);
        break;
      case ModelEvent.REMOVE:
        let d = this._index .get (doc._id);
        if (d) {
          this._removeParentLink (d, parent, children);
          this._index .delete (doc._id);
        }
        break;
    }
  }

  findOne (query) {
    for (let c of this._index .values())
      if (query (c))
        return c;
  }

  get (id) {
    return this._index .get (id);
  }

  getPathname (doc) {
    return doc? this .getPathname (doc.parent) .concat ([doc.name]): [];
  }

  getPath (doc) {
    return doc? this .getPath (doc .parent) .concat (doc): [];
  }

  getSiblings (doc, parent='parent', children='children') {
    return this .getSiblingsAndSelf (doc, parent, children) .filter (s => {return s._id != doc._id}) || [];
  }

  getSiblingsAndSelf (doc, includeZombies=false) {
    let p = doc .parent;
    if (p) {
      let c = p .children || [];
      let z = (includeZombies && p .zombies) || [];
      if (z .length) {
        z = Array .from (z .reduce ((m,z) => {return m .set (z .name, z)}, new Map()) .values());
        c = c .concat (z);
      }
      return c;
    } else
      return this._roots || []
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
