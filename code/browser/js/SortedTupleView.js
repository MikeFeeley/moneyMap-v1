var SortedTupleViewEvent = Object.create (TupleViewEvent, {
  MOVED: {value: 300}
});

class SortedTupleView extends TupleView {

  addTuple (data, sort, tuple, toHtml, getToHtml) {
    tuple .data ('sort', sort);
    var insertBefore = toHtml.children ('._tuple').toArray ().find (t => {
      return $ (t).data ('sort') >= sort
    });
    super .addTuple (data, tuple, {
      before: insertBefore,
      inside: !insertBefore && toHtml
    }, getToHtml)
  }

  moveTuple (tuple, toHtml) {
    var insertBefore = toHtml .children ('._tuple') .toArray() .find (t => {return $(t) .data ('sort') > tuple .sort});
    super .moveTuple (tuple, {
      before: insertBefore,
      inside: !insertBefore && toHtml
    });
  }

  _updateTuplePosition (tuple) {
    var sort         = tuple .data ('sort');
    var parent       = tuple .parent();
    var insertBefore = tuple .siblings() .toArray() .find (t => {return $(t) .data ('sort') >= sort});
    if (insertBefore != tuple .next() [0] || (!insertBefore && tuple .next() .length)) {
      tuple .detach();
      if (insertBefore)
        tuple .insertBefore (insertBefore);
      else
        tuple .appendTo (parent);
      this._notifyObservers (SortedTupleViewEvent .MOVED, tuple._id);
    }
  }

  updateTupleSort (id, sort, source) {
    var tuple = this._getTuple (id);
    if (tuple) {
      tuple .data ('sort', sort);
      if (source != this)
        this._updateTuplePosition (tuple);
    }
  }
}