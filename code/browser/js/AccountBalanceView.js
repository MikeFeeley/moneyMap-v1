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
    this._hideButton = $('<button>', {class: '_sidebar_right_hide_botton', click: () => {
      this._html       .hide();
      this._showButton .show();
    }, html: '&times;'}) .appendTo (this._html);
    this._showButton = $('<button>', {class: '_sidebar_right_show_button', click: () => {
      this._html       .show();
      this._showButton .hide();
    }, html: '&#9776;'}) .appendTo (this._html.parent());
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .appendTo (this._html);
  }

  removeText (name) {
    this._html .find ('.' + name) .remove();
  }

  addGroup (title, name='') {
    return $('<div>', {class: name + ' _sidebar_group _group '})
      .appendTo (this._html)
      .append   ($('<div>', {class: '_heading', text: title}));
  }

  removeGroup (name) {
    this._html .find('.' + name) .remove();
  }

  setGroupVisible (group, isVisible) {
    group [isVisible? 'removeClass': 'addClass'] ('hidden');
  }

  addTuple (data, tuple, getToHtml) {
    if (tuple)
      tuple = $('<div>') .appendTo (tuple);
    var tuple = super .addTuple (data, tuple, getToHtml);
    tuple .click (e => {
      let target   = $(e .target) .parent();
      let html     = target .offsetParent() .parent();
      this._notifyObservers (AccountBalanceViewEvent .CLICK, {
        id:       data._id,
        name:     data .name,
        toHtml:   html,
        position: {top: ui .calcPosition (target, html, {top: 0, left: 0}) .top, right: 50},
        isCat:    data .isCat
      });
    });
  }
}

var AccountBalanceViewEvent = Object.create (TupleViewEvent, {
  CLICK: {value: 300}
});
