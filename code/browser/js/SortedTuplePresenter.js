class SortedTuplePresenter extends TuplePresenter {

  async _onModelChange (eventType, doc, arg, source) {
    await super._onModelChange (eventType, doc, arg, source);
    if (eventType == ModelEvent .UPDATE && arg .sort)
      this._view .updateTupleSort (doc._id, arg .sort, source);
  }
  
}
