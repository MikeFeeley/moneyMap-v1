class TuplePresenter extends Presenter {

  constructor (model, view, options) {
    super (model, view);
    this._options = options || {};
  }

  _onModelChange (eventType, doc, arg, source) {
    super._onModelChange (eventType, doc, arg, source);
    if (source != this._view) {
      switch (eventType) {
        case ModelEvent .INSERT:
          this._addTuple (doc);
          break;
        case ModelEvent .REMOVE:
          this._removeTuple (doc._id);
          break;
      }
    }
  }

  _getTupleData (doc) {
    return doc;
  }

  _addTuple (doc, pos) {
    this._view .addTuple (this._getTupleData (doc), pos);
  }

  _removeTuple (id) {
    this._view .removeTuple (id);
  }

  _empty() {
    this._view .empty();
  }

  _onViewChange (eventType, arg) {
    super._onViewChange (eventType, arg);
    switch (eventType) {
      case TupleViewEvent .INSERT:
        Model .newUndoGroup();
        if (! this._options .noInsert)
          async (this, this._insert) (arg.insert, arg.pos);
        break;
      case TupleViewEvent .REMOVE:
        Model .newUndoGroup();
        if (! this._options .noRemove)
          async (this, this._remove) (arg);
        break;
    }
  }

  *_insert (insert, pos) {
    yield* this._model .insert (insert, this._view);
    this._addTuple (insert, pos);
  }

  *_remove (id) {
    yield* this._model .remove (id, this._view);
    this._removeTuple (id);
  }

  *_removeList (list) {
    yield* this._model .removeList (list, this._view);
    for (let id of list)
      this._removeTuple (id);
  }

}
