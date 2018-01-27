class Presenter {

  constructor (model, view) {
    this._model         = model;
    this._view          = view;
    this._modelObserver = this._model && this._model .addObserver (this, this._onModelChange);
    this._viewObserver  = this._view  .addObserver (this, this._onViewChange);
  }

  delete() {
    this._view  .prepareToClose();
    if (this._model)
      this._model .deleteObserver (this._modelObserver);
    this._view  .deleteObserver (this._viewObserver);
  }

  async _onModelChange (eventType, doc, arg, source) {
    switch (eventType) {
      case ModelEvent.UPDATE:
        for (let field in arg)
          this._view .updateField (doc._id, field, arg [field])
        break;
    }
  }

  async _onViewChange (eventType, arg) {
    switch (eventType) {
      case ViewEvent.UPDATE:
        Model .newUndoGroup();
        await this .updateField (arg .id, arg .fieldName, arg .value);
        break;
    }
  }

  async updateField (id, fieldName, value) {
    let update         = {};
    update [fieldName] = value;
    await this._model .update (id, update, this._view);
  }

  click() {
    this._view .click();
  }

  blur() {
    this._view .blur();
  }

  contains (target) {
    return this._view .contains (target);
  }
}



