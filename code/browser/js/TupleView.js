var TupleViewEvent = Object.create (ViewEvent, {
  INSERT:   {value: 200},
  REMOVE:   {value: 201},
  SELECT:   {value: 202}
});

class TupleView extends View {

  constructor (name, fields) {
    super (name, fields);
    this._tuples = new Map();
  }

  delete () {
    this._clearSelectedTuple ();
  }

  remove() {
    if (this._html) {
      this._html .remove();
    }
  }

  /**
   * Overridden by subclasses that use different HTML structure
   */
  _getFieldHtmlFromTuple (tuple) {
    return tuple .children ('._field');
  }

  _getTuple (id) {
    return this._tuples .get (id);
  }

  _getFieldHtml (id, name) {
    let fieldClass = this._getFieldHtmlClass (name)
    let tuple      = this._tuples .get (id);
    if (tuple)
      return $(this._getFieldHtmlFromTuple (tuple) .toArray() .find (h => {return h .classList .contains (fieldClass)}));
  }

  flagTupleError (id) {
    var tuple = this._getTuple (id);
    if (tuple)
      tuple .effect (tuple .closest ('tr') [0] == tuple [0]? 'pulsate': 'shake');
  }

  selectTupleWithId (id, focus) {
    return this._selectTuple (this._tuples .get (id), focus);
  }

  _tupleSelected (tuple, isSelected) {
    this._notifyObservers (TupleViewEvent .SELECT, {tuple: tuple, isSelected: isSelected});
  }

  _selectTuple (tuple, focus) {
    var selectionChange = false;
    tuple = tuple || this._selectedTuple;
    if (tuple && tuple [0]) {
      if (! this._selectedTuple || this._selectedTuple [0] != tuple [0]) {
        this._clearSelectedTuple();
        this._selectedTuple = tuple;
        this._tupleSelected (tuple, true);
        for (let f of this._getFieldHtmlFromTuple (tuple))
          this._getFieldFromHtml (f) .setSelected (true);
        selectionChange = true;
      }
      if (focus) {
        if (focus .first || focus .last) {
          var focusableFields = this._getFieldHtmlFromTuple (tuple) .toArray() .filter (f => {
            return this._getFieldFromHtml (f) .isEnabled() && $(f) .find (':input') .length
          });
          focus .field = $(focus .first? focusableFields [0] : focusableFields .slice (-1));
        }
        if (focus .field && focus .field .length) {
          let field = this._getFieldFromHtml (focus .field);
          while (field && ! field .isEnabled()) {
            focus .field = focus .field .prev();
            field = this._getFieldFromHtml (focus .field);
          }
          if (field)
           field .click();
        }
      }
    }
    return selectionChange;
  }

  _clearSelectedTuple() {
    if (this._selectedTuple) {
      for (let h of this._getFieldHtmlFromTuple (this._selectedTuple)) {
        var f = this._getFieldFromHtml (h);
        if (f)
          f .setSelected (false);
      }
      this._tupleSelected (this._selectedTuple, false);
    }
    this._selectedTuple = null;
  }

  addHtml (toHtml) {
    this._html = $('<div>', {class: this._name}) .appendTo (toHtml);
  }

  /**
   * Add tuple to html
   *   data      - ordered list of field names and values to add
   *   tuple     - html of tuple
   *   pos       - {before: X}, {after: X}, or {inside: X}
   *   getToHtml - (optional) function that returns HTML to which to attach each field
   */
  addTuple (data, tuple = $('<div>') .appendTo (this._html), pos = {}, getToHtml) {
    if (! this._tuples .get (data._id)) {
      this._tuples .set  (data._id, tuple);
      this .createFields (data, getToHtml || (() => {return tuple}));
      tuple .addClass ('_tuple');
      tuple .data     ('id', data._id);
      tuple .attr     ('id', this._name + data._id);
      if (pos .before)
        tuple .insertBefore (pos .before);
      else if (pos .after)
        tuple .insertAfter (pos .after);
      else
        tuple .appendTo (pos .inside);
      return tuple;
    }
  }

  moveTuple (tuple, pos) {
    tuple .detach();
    if (pos .before)
      tuple .insertBefore (pos .before);
    else if (pos .after)
      tuple .insertAfter (pos .after);
    else
      tuple .appendTo (pos .inside);
  }

  removeTuple (id) {
    var tuple = this._tuples .get (id);
    if (tuple) {
      if (this._selectedTuple && this._selectedTuple [0] == tuple [0])
        this._clearSelectedTuple();
      this._tuples .delete (id);
      tuple .remove();
    }
  }

  removeTupleIds (ids) {
    for (let id of ids)
      this._tuples .delete (id);
  }

  empty() {
    this._tuples .clear();
  }

  getNumberOfTuples() {
    return Array .from (this._tuples .entries()) .length;
  }

  getFirstTuple() {
    return Array .from (this._tuples .entries()) [0];
  }
}
