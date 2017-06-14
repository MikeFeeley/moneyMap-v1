class AccountBalanceView extends TupleView {
  constructor() {
    var fields = [
      new ViewLabel ('name',    ViewFormats ('string')),
      new ViewLabel ('balance', ViewFormats ('moneyDCZ'))
    ];
    super ('_AccountBalanceView', fields);
  }

  addHtml (toHtml) {
    super .addHtml (toHtml);
    this._html .addClass ('_sidebar_right');
    $('<button>', {class: '_sidebar_right_hide_botton', click: () => {this._html .hide()}, html: '&times;'}) .appendTo (this._html);
    $('<button>', {class: '_sidebar_right_show_button', click: () => {this._html .show()}, html: '&#9776;'}) .appendTo (this._html.parent());
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .appendTo (this._html);
  }

  removeText (name) {
    this._html .find ('.' + name) .remove();
  }

  addGroup (title, name) {
    return $('<div>', {class: (name || '') + ' _sidebar_group _group'})
      .appendTo (this._html)
      .append   ($('<div>', {class: '_heading', text: title}));
  }

  removeGroup (name) {
    this._html .find('.' + name) .remove();
  }

  addTuple (data, tuple, getToHtml) {
    if (tuple)
      tuple = $('<div>') .appendTo (tuple);
    var tuple = super .addTuple (data, tuple, getToHtml);
    tuple .click (e => {
      var target   = $(e .target) .parent();
      var position = target .position();
      position .top += e .offsetY;
      position .left = 16;
      this._notifyObservers (AccountBalanceViewEvent .CLICK, {
        id:       data._id,
        toHtml:   target .offsetParent(),
        position: position,
        isCat:    data .isCat
      });
    });
  }
}

var AccountBalanceViewEvent = Object.create (TupleViewEvent, {
  CLICK: {value: 300}
});
