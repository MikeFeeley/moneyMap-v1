class AccountBalanceView extends TupleView {
  constructor() {
    var fields = [
      new ViewLabel ('name',    ViewFormats ('string')),
      new ViewLabel ('balance', ViewFormats ('moneyDCZ'))
    ];
    super ('_AccountBalanceView', fields);
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .appendTo (this._html);
  }

  removeText (name) {
    this._html .find ('.' + name) .remove();
  }

  addTuple (data, tuple, getToHtml) {
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
