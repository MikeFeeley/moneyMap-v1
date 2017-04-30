var ImportTransactionsViewEvent = Object.create (TableViewEvent, {
  DROPPED: {value: 400}
});

class ImportTransactionsView extends View {
  constructor (name, fields, variance) {
    super (name, fields);
    this._variance = variance;
  }
  *addHtml (toHtml) {
    this._html = $('<div>', {class: '_ImportTransactions'}) .appendTo (toHtml);
    $('body') .on ({
      dragover: e => {e .preventDefault()},
      drop:     e => {
        console.log ('drop', e, e .originalEvent .dataTransfer .files [0]);
        e.preventDefault();
        this ._notifyObservers (ImportTransactionsViewEvent .DROPPED, e .originalEvent .dataTransfer .files [0])
      }
    });
    yield* (new AccountBalance (this._variance)) .addHtml (this._html);
    this._import = $('<div>', {class: '_import'}) .appendTo (this._html);
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .appendTo (this._import);
  }

  updateText (name, text) {
    $('.' + name) .text (text);
  }

  *addTable (table) {
    yield* table .addHtml (this._import);
  }
}

class ImportRulesField extends ViewLabel {
  constructor() {
    super ('rules', new ViewFormat (
      value => {return value? 'R': '+'},
      view  => {},
      value => {}
    ))
  }
  _addHtml (value) {
    super._addHtml (value);
    this._label .click (e => {
      var tuple = $(e .currentTarget) .closest ('._tuple');
      this._view._toggleRule (tuple .data ('id'));
    });
  }
  set (value) {
    super .set (value);
    if (value)
      this._html .addClass ('_not_empty');
    else
      this._html .removeClass ('_not_empty');
  }
}

class ImportedTransactionTableView extends TransactionTableView {

  constructor (name, columns, options, accounts, variance, toggleRule) {
    super (name, columns, options, accounts, variance);
    this._toggleRule = toggleRule;
  }

  _getFields (fields) {
    return super._getFields (fields) .concat (new ImportRulesField());
  }

  _getHeaders (headers) {
    return [{name: 'rules', header: ''}] .concat (super._getHeaders (headers) .filter (h => {return h .name != 'rules'}));
  }

  addHtml (toHtml) {
    if (! this._html) {
      this._html = $('<div>', {class: this._name}) .appendTo (toHtml);
      super .addHtml (this._html);
    }
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .prependTo (this._html);
  }

  updateText (name, text) {
    this._html .find ('.' + name) .text (text);
  }

  addButton (name, text, isEnabled, action) {
    var button = $('<button>', {type: 'button', class: '_button ' + name, text: text, prop: {disabled: ! isEnabled}}) .prependTo (this._html);
    button .click (action);
  }

  updateButton (name, isEnabled) {
    this._html .find ('button.' + name) .prop ('disabled', ! isEnabled);
  }

  getRuleBox (id) {
    return this._getTuple (id) .next ('tr') .find ('._rulebox');
  }

  addRuleBox (id) {
    return $('<div>', {class: '_rulebox'}) .appendTo ($('<td>', {prop: {colspan: 8}}) .appendTo ($('<tr>') .insertAfter (this._getTuple (id))));
  }

  removeRuleBox (id) {
    this .getRuleBox (id) .closest ('tr') .remove();
  }
}

class NeedsAttentionTableView extends ImportedTransactionTableView {
  _getFields (fields) {
    return super._getFields (fields) .concat (new ViewLabel ('importTime', ViewFormats ('timeShortHM')));
  }

  _getHeaders (headers) {
    return super._getHeaders (headers) .filter (h => {return h .name != 'importTime'}) .concat ({name: 'importTime', header: 'Added'});
  }
}

