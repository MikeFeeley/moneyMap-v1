var ImportTransactionsViewEvent = Object.create (TableViewEvent, {
  DROPPED: {value: 400}
});

class ImportTransactionsView extends View {
  constructor (name, fields, variance) {
    super (name, fields);
    this._variance = variance;
  }
  remove() {
    if (this._html) {
      this._html .remove();
      this._html = null;
    }
    $('body') .off ('dragover');
    $('body') .off ('drop');
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
    this._import = $('<div>', {class: '_import'})  .appendTo (this._html);
    this._html .parent() .addClass ('_ImportTransactionsContents')
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
  _setState() {
    if (this._value) {
      this._html .addClass ('_not_empty');
      if (this._ruleIsShowing)
        this._html .addClass ('_showing');
      else
        this._html .removeClass ('_showing');
    } else {
      this._html .removeClass ('_not_empty');
      this._html .removeClass ('_showing');
    }
  }
  _addHtml (value) {
    super._addHtml (value);
    this._ruleIsShowing = false;
    this._label .click (e => {
      var tuple = $(e .currentTarget) .closest ('._tuple');
      this._view._toggleRule (tuple .data ('id'));
      this._setState();
    });
  }
  setRuleShowing (isShowing) {
    this._ruleIsShowing = isShowing;
    this._setState();
  }
  set (value) {
    super .set (value);
    this._setState();
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
    this._getTuple (id) .find ('._field') .data ('field') .setRuleShowing (true);
    return $('<div>', {class: '_rulebox'}) .appendTo ($('<td>', {prop: {colspan: 8}}) .appendTo ($('<tr>') .insertAfter (this._getTuple (id))));
  }

  removeRuleBox (id) {
    let tr = this .getRuleBox (id) .closest ('tr');
    tr .prev ('tr') .find ('._field') .data ('field') .setRuleShowing (false);
    tr .remove();
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

