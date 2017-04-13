class OrganizeView  extends Observable {
  constructor() {
    super();
    this._name = '_Organize';
  }

  addHtml (toHtml) {
    this._html    = $('<div>', {class: this._name + ' _IndexedListView'}) .appendTo (toHtml);
    this._index   = $('<div>', {class: '_index'}) .appendTo (this._html);
    this._content = $('<div>', {class: '_list'})  .appendTo (this._html);
  }

  getHtml() {
    return this._content;
  }

  addHeading (indexText, text) {
    var id     = this._name + '_' + indexText .split (' ') .join ('_');
    var anchor = $('<a>', {text: indexText, attr: {href: '#' + id}}) .appendTo (this._index);
    $('<div>', {class: '_heading', text: text, attr: {id: id}})      .appendTo (this._content);
    anchor .click (e => {
      var scrollTo = $('#' + id);
      this._content .animate ({
        scrollTop: scrollTo .position() .top + this._content .scrollTop() + Number (scrollTo .css ('margin-top') .slice (0, -2)) - 20
      });
      e .preventDefault();
    })
  }

  addText (text) {
    $('<div>', {text: text, class: '_text'}) .appendTo (this._content);
  }
}

class _HasTransactionsCheckbox extends ViewCheckbox {
  constructor (onCheck) {
    super ('hasTransactions');
    this._onCheck = onCheck;
  }
  _addHtml() {
    super._addHtml();
    this._input .click (() => {this._onCheck (this._input .prop ('checked'), this._id)});
  }
}