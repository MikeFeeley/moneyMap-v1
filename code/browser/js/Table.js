class Table extends TuplePresenter {

  constructor (model, view, query, sort, options, columns) {
    super (model, view, options);
    this._query   = query;
    this._sort    = sort;
    this._columns = columns;
  }

  _onModelChange (eventType, doc, arg, source) {
    if (eventType == ModelEvent .INSERT && source != this._view && ! this._options .noKeepSorted && this._sort) {
      var match = (this._view .getTuples() || [])
        .map    (t     => {return this._model .get (t._id)})
        .filter (t     => {return this._sort (doc, t) < 0})
        .reduce ((m,t) => {return m && this._sort (m,t) < 0? m: t}, null)
      if (match) {
        this._addTuple (doc, {id: match._id, before: true});
        return;
      }
    }
    super._onModelChange (eventType, doc, arg, source);
  }

  _getTupleData (doc) {
    return this._columns .reduce ((o,f) => {o [f] = doc [f] || ''; return o}, {_id: doc._id});
  }

  *_getModelData() {
    return yield* this._model .find (this._query);
  }

  *_addModelData() {
    var docs = yield* this._getModelData();
    if (this._sort)
      docs .sort (this._sort);
    for (let doc of docs)
      this._addTuple (doc);
  }

  _addTuple (doc) {
    this._view .addTuple (this._getTupleData (doc));
  }

  *addHtml (toHtml) {
    this._view .addHtml (toHtml);
    yield* this._addModelData();
  }

  *refreshHtml() {
    this._view .empty();
    yield* this._addModelData();
  }
}


