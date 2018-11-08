class AccountBalanceView extends TupleView {
  constructor() {
    var fields = [
      new ViewLabel   ('name',             ViewFormats ('string')),
      new ViewLabel   ('balance',          ViewFormats ('moneyDCZ')),
      new ViewTextbox ('editable_balance', ViewFormats ('moneyDCZ'))
    ];
    super ('_AccountBalanceView', fields);
  }

  addHtml (toHtml, rebuild) {
    super .addHtml (toHtml);
    this._html .addClass ('_sidebar_right');
    this._hideButton = $('<button>', {class: '_sidebar_right_hide_botton lnr-cross', click: () => {
      this._html       .hide();
      this._showButton .show();
    }}) .appendTo (this._html);
    this._showButton = $('<button>', {class: '_sidebar_right_show_button lnr-menu', click: () => {
      this._html       .show();
      this._showButton .hide();
    }}) .appendTo (this._html.parent());
    toHtml .parent() .data ('visible', () => {
      if (this._html .find ('div') .length == 0)
        rebuild();
    });
  }

  resetHtml() {
    this._html .children ('div') .remove();
    this .empty();
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .appendTo (this._html);
  }

  removeText (name) {
    this._html .find ('.' + name) .remove();
  }

  findGroup (name) {
    return this._html .find (name .split (' ') .map (np => '.' + np) .join(''));
  }

  addGroup (title, name='') {
    return $('<div>', {class: name + ' _sidebar_group _group '})
      .appendTo (this._html)
      .append   ($('<div>', {class: '_heading', text: title}))
      .keypress (e => {
        if (e .keyCode == 13 && ! e .altKey) {
          let target = this._getTuple ($(e .target) .closest ('._field') .data ('field')._id) [e .shiftKey? 'prev': 'next'] ('._tuple');
          if (target .length)
            this._selectTuple (target, {last: true});
        }
      })
  }

  emptyGroup (name) {
    this._html .find ('.' + name ) .empty();
  }

  addGroupHeading (group, heading) {
    $('<div>', {class: '_heading', text: heading}) .appendTo (group);
  }

  setGroupVisible (group, isVisible) {
    group [isVisible? 'removeClass': 'addClass'] ('hidden');
  }

  isVisible() {
    return this._html && ! this._html .closest ('.contents > div > div') .hasClass ('background');
  }

  addTuple (data, tuple, getToHtml) {
    if (tuple) {
      tuple = $('<div>') .appendTo (tuple);
      if (data .name == undefined)
        data .name = '';
      if (data .editable_balance === undefined && data .balance == undefined)
        data .balance = 0;
      tuple = super .addTuple (data, tuple, getToHtml);
      tuple .find ('._field_name, ._field_balance') .on ('click webkitmouseforcedown', e => {
        const target       = $(e .target);
        const scrollParent = target .closest ('._AccountBalanceView');
        const top          = ui .calcPosition (target, scrollParent) .top - scrollParent .scrollTop() + $('body') .scrollTop();
        const html         = target .closest ('._ImportTransactions') .children ('._import');
        const pos          = {top: top, left: 50};
        this._notifyObservers (AccountBalanceViewEvent .CLICK, {
          id:       data._id,
          name:     data .name,
          toHtml:   html,
          position: pos,
          isCat:    data .isCat,
          altKey:   e .originalEvent .webkitForce > 1 || e .originalEvent .altKey,
          shiftKey: e .originalEvent .shiftKey
        });
      });
    }
  }
}

var AccountBalanceViewEvent = Object.create (TupleViewEvent, {
  CLICK: {value: 300}
});
