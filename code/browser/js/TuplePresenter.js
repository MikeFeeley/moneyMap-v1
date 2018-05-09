class TuplePresenter extends Presenter {

  constructor (model, view, options) {
    super (model, view);
    this._options = options || {};
  }

  async _onModelChange (eventType, doc, arg, source) {
    await super._onModelChange (eventType, doc, arg, source);
    if (eventType == ModelEvent .INSERT && source != this._view)
      this._addTuple (doc);
    else if (eventType == ModelEvent .REMOVE)
      this._removeTuple (doc._id);
  }

  delete() {
    if (this._view .remove)
      this._view .remove();
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

  async _onViewChange (eventType, arg) {
    super._onViewChange (eventType, arg);
    switch (eventType) {
      case TupleViewEvent .INSERT:
        if (! this._options .noInsert) {
          Model .newUndoGroup();
          this._insert (arg.insert, arg.pos);
        }
        break;
      case TupleViewEvent .REMOVE:
        if (! this._options .noRemove) {
          Model .newUndoGroup();
          if (this._options .keepOneEntry && this._view .getNumberOfTuples() == 1) {
            let [id, html] = this._view .getFirstTuple();
            let fieldNames = this._view._getFieldHtmlFromTuple (html) .toArray() .map (f => {return $(f) .data ('field')._name});
            for (let fieldName of fieldNames)
              this .updateField (id, fieldName, null);
          } else
            this._remove (arg);
        }
        break;
    }
  }

  async _insert (insert, pos) {
    await this._model .insert (insert, this._view);
    this._addTuple (insert, pos);
    return insert;
  }

  async _remove (id) {
    await this._model .remove (id, this._view);
    this._removeTuple (id);
  }

  async _removeList (list) {
    await this._model .removeList (list, this._view);
    for (let id of list)
      this._removeTuple (id);
  }

}
