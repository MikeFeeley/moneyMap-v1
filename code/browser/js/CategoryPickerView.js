class CategoryPickerView extends View {
  constructor() {
    super();
    this._html  = $('<div>', {class: '_PathPicker'});
    var content = $('<div>', {class: '_pickerContent'}) .appendTo (this._html);
    this._table = $('<tbody>') .appendTo ($('<table>')  .appendTo (content)) ;
  }

  reset() {
    this._html .stop (true,true);
    this._table .empty();
    this._tds = new Map();
  }

  addHtml (toHtml, onSelect) {
    this._html .appendTo (toHtml);
    this._html .on ('click', e => {
      onSelect ($(e.target) .data('id'));
      return false;
    });
  }

  addRow (row) {
    var tr = $('<tr>') .appendTo (this._table);
    for (let p of row) {
      var td = $('<td>', {
        text:  p.name,
        data:  {id: p.id},
        class: p.selected? '_selected': ''
      }) .appendTo (tr);
      this._tds .set (p.id, td);
    }
  }

  setSelected (id, isSelected) {
    var td = this._tds .get (id);
    if (isSelected)
      td .addClass ('_selected');
    else
      td .removeClass ('_selected');
  }

  show() {
    this._html .slideDown();
  }

  hide() {
    this._html .slideUp('fast', () => {
      this._html .remove();
    });
  }
}
