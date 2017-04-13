class SortedTuplePresenter extends TuplePresenter {

  _onModelChange (eventType, doc, arg, source) {
    super._onModelChange (eventType, doc, arg, source);
    if (eventType == ModelEvent .UPDATE && arg .sort)
      this._view .updateTupleSort (doc._id, arg .sort, source);
  }
  
}
