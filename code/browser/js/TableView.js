class TableView extends TupleView {

  constructor (name, fields, headers, options) {
    super (name, fields);
    this._headers = this._getHeaders (headers);
    this._options  = options;
  }

  _getHeaders (headers) {
    return headers;
  }

  _getFieldHtmlFromTuple (tuple) {
    return tuple .find ('td') .children ('._field');
  }

  _handleKeydown (e) {
    var moveRow = (reverse, sameCol) => {
      $(document.activeElement).blur();
      var tr  = $(e.target) .closest ('tr');
      var col = sameCol? tr .children() .index (td): 0;
      var ntr = tr;
      do {
        ntr = reverse? ntr .prev(): ntr .next();
        if (ntr .length)
          this._selectTuple (ntr);
      } while (ntr .length && ! $(ntr .find ('td') .get (col)) .find (':input') .filter (':visible') .length)
      if (ntr .length)
        $(ntr .find ('td') .get (col)) .find (':input') .focus();
    }
    if (e.metaKey && [8, 13] .includes (e.keyCode))
      var id = $(e.target) .closest ('._field') .data ('field') ._id;
    switch (e.keyCode) {
      case 8: /* delete */
        if (e.metaKey) {
          this._notifyObservers (TupleViewEvent .REMOVE, id);
          e.preventDefault();
          return false;
        }
        break;
      case 13: /* return */
        if (e.metaKey) {
          this._notifyObservers (TupleViewEvent .INSERT, {
            insert: {},
            pos:    {before: e .shiftKey, id: id, inside: e .altKey}
          });
          e.preventDefault();
          return false;
        }
    }
    if (!([9, 13, 38, 40] .includes (e.keyCode)))
      return;
    var td = $(e.target) .closest ('td');
    switch (e.keyCode) {
      case 9: /* tab */
        if (e .shiftKey) {
          var ntd = td;
          do {
            var ntd = ntd .prev()
            var inp = ntd .find (':input:visible');
          } while (ntd .length && ! inp .length);
          inp .first() .focus();
        } else {
          var ntd = td;
          do {
            var ntd = ntd .next()
            var inp = ntd .find (':input:visible');
          } while (ntd .length && ! inp .length);
          inp .first() .focus();
        }
        break;
      case 13: /* return */
        moveRow (e.shiftKey, true);
        break;
      case 38: /* arrow up */
        moveRow (true, true);
        break;
      case 40: /* arrow down */
        moveRow (false, true);
        break;
    }
    e.preventDefault();
    return false;
  }

  getHtml() {
    return this._table;
  }

  addHtml (toHtml) {
    this._table = $('<table>', {class: '_Table ' + this._name}) .appendTo (toHtml);
    this._thead = $('<tr>') .appendTo ($('<thead>') .appendTo (this._table));
    this._tbody = $('<tbody>') .appendTo (this._table);
    this._tfoot = $('<tfoot>') .appendTo (this._table);
    for (let h of this._headers)
      $('<th>', {class: this._getFieldHtmlClass (h .name)})
        .append   ($('<div>', {text: h .header, class: '_content'}))
        .appendTo (this._thead);
    this._table .on ('keydown', e => {return this ._handleKeydown (e)});
    this._tbody .on ('click', 'tr', e => {
      if (!this._options || ! this._options .readOnly) {
        var target = $(e.target) .closest ('td');
        if (this._selectTuple ($(e.currentTarget)))
          target .find ('._field') .data ('field') .click()
      }
      e.stopPropagation();
    });
    $('body') .on ('click', e => {if (!this._options || ! this._options .readOnly) this._clearSelectedTuple()});
  }

  _hasFocus() {
    var hf = this._tempHasFocus || this._table && $(document.activeElement) .closest ('._Table')[0] == this._table[0];
    this._tempHasFocus = false;
    return hf;
  }

  _setFocus() {
    this._tempHasFocus = true;
  }

  addTuple (data, pos) {
    if (this._table) {
      var tr   = $('<tr>');
      if (pos) {
        var disabledFields = pos .disabledFields;
        var target = this._getTuple (pos .id);
        pos = pos .before? {before: target}: {after: target};
      } else
        pos = {inside: this._tbody};
      super .addTuple (data, tr, pos, () => {return $('<td>') .appendTo (tr)});
      if (this._hasFocus()) {
        this._selectTuple (tr);
        var skipDisabledFields = (disabledFields || []) .reduce ((s,f) => {return s + ':not(.' + this._getFieldHtmlClass (f) +  ')'}, '');
        tr .find ('._field' + skipDisabledFields) .find (':input') .first() .focus();
      }
      return tr;
    }
  }

  getTuples() {
    if (this._tbody)
      return this._tbody .children ('._tuple') .toArray() .map (t => {
        return $(t)
          .find ('._field') .toArray()
          .reduce ((o,h) => {
            var f = $(h) .data ('field');
            o [f._name] = f._value;
            return o;
          }, {_id: $(t) .data ('id')})
      });
  }

  removeTuple (id) {
    if (this._table) {
      var tr = this._getTuple (id);
      if (this._hasFocus()) {
        var select = (n => {return n .length? n: tr .prev()}) (tr .next())
        if (select.length) {
          this._selectTuple (select);
          select .find (':input') .filter (':visible') .first() .focus();
        } else
          if (this._selectedTuple && tr[0] == this._selectedTuple[0])
            this._clearSelectedTuple();
      }
      super .removeTuple (id);
    }
  }

  addFooterRow (data) {
    var tr = $('<tr>') .appendTo (this._tfoot);
    data._id = this._tfoot .find ('tr') .length - 1;
    super .addTuple (data, tr, {inside: tr}, () => {return $('<td>') .appendTo (tr)});
    return data._id;
  }

  empty() {
    if (this._tbody)
      this._tbody .empty();
    if (this._tfoot)
      this._tfoot .empty();
    super .empty();
  }
}
