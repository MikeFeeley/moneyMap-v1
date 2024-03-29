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
      this._toHtml = null;
    }
    $('html') .off ('dragover');
    $('html') .off ('drop');
  }

  async addHtml (toHtml) {
    this._toHtml = toHtml;
    this._html = $('<div>', {class: '_ImportTransactions'}) .appendTo (toHtml);
    $('html') .on ({
      dragover: e => {e .preventDefault()},
      drop:     e => {
        e.preventDefault();
        if (e .originalEvent .dataTransfer .files [0])
         this ._notifyObservers (ImportTransactionsViewEvent .DROPPED, e .originalEvent .dataTransfer .files [0])
      }
    });
    this._accountBalance = new AccountBalance (this._variance);
    await this._accountBalance .addHtml (this._html);
    this._import = $('<div>', {class: '_import'})  .appendTo (this._html);
    this._html .parent() .addClass ('_ImportTransactionsContents');
  }

  async hasBecomeVisible() {
    await this._accountBalance .hasBecomeVisible();
  }

  addText (name, text) {
    $('<div>', {class: name, text: text}) .appendTo (this._import);
  }

  updateImportStatus (message) {
    let popup        = $('<div>', {class: '_import_status_popup fader'}) .appendTo ($('body'));
    let popupContent = $('<div>', {class: '_popupContent'}) .appendTo (popup);
    for (let m of [] .concat (message))
      $('<div>', {html: m}) .appendTo (popupContent);
    ui .ModalStack .add (
      e  => {return e && ! $.contains (popup .get (0), e .target) && popup .get (0) != e .target},
      () => {popup .removeClass ('fader_visible') .one ('transitionend', () => {popup .remove()})},
      true
    );
    setTimeout (() => {popup .addClass ('fader_visible')}, 0);
  }

  async addTable (table) {
    await table .addHtml (this._import);
  }

  addButton (name, icon, isEnabled, action) {
    let button = $('<div>', {class: '_button ' + name + ' ' + icon + ' ' + (!isEnabled? '_disabled': ''),}) .appendTo (this._import) .click(() => {
      if (! button .hasClass ('_disabled'))
        action (button);
    });
  }

  addHelpTable (descData, tableData, top=100, left=50) {
    if (!this ._helpTable) {
      this._helpTable = $('<div>', {class: '_helpPopup'})
        .appendTo ($('body'))
        .css ({top: top, left: left});
      let help = $('<div>') .appendTo (this._helpTable);
      $('<div>', {text: 'TIP'}) .appendTo (help);
      for (let desc of descData)
        $('<div>', {text: desc}) .appendTo (help);
      let table = $('<table>') .appendTo (help);
      for (let row of tableData) {
        let tr = $('<tr>') .appendTo (table);
        for (const c of row) {
          const td = $('<td>') .appendTo (tr);
          for (let t of Array .isArray (c)? c: [c]) {
            if (typeof t[0] == 'object' && [... t[0] .classList] .find (c => c .startsWith ('lnr-')))
              t .css ({'font-family': 'Linearicons-Free', 'font-weight': 100});
            else if (typeof t == 'string')
              t = $('<span>', {text: t});
            t .appendTo (td);
          }
        }
      }
      ui .ModalStack .add (
        e => {return true},
        e => {this._helpTable .remove(); this._helpTable = null},
        true
      )
    }
  }

  isVisible() {
    return this._toHtml && ! this._toHtml .hasClass ('background');
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

  addButton (name, icon, isEnabled, action) {
    let button = $('<div>', {class: '_button ' + name + ' ' + icon + ' ' + (!isEnabled? '_disabled': ''),}) .prependTo (this._html) .click(() => {
      if (! button .hasClass ('_disabled'))
        action (button);
    });
  }

  updateButton (name, isEnabled) {
    this._html .find ('._button.' + name) [(isEnabled? 'remove': 'add') + 'Class'] ('_disabled');
  }

  _getLastTupleinGroup (id) {
    let tuple = super._getTuple (id);
    let lastInGroup;
    if (tuple && tuple .hasClass ('_group') && ! tuple .hasClass ('_last'))
      lastInGroup = $(tuple .nextAll ('._last') [0]);
    return lastInGroup && lastInGroup .length? lastInGroup: tuple;
  }

  getRuleBox (id) {
    let tuple = this._getLastTupleinGroup (id);
    let rulebox = tuple .next ('tr') .find ('._rulebox');
    let field   = rulebox .closest ('tr') .prev ('tr') .find ('._field') .data ('field');
    return [rulebox, field];
  }

  addRuleBox (id) {
    let tuple = this._getLastTupleinGroup (id);
    let cols = tuple .closest('table') .find ('thead') .find ('th') .length;
    let field = tuple .find ('._field') .data ('field');
    field .setRuleShowing (true);
    return $('<div>', {class: '_rulebox'}) .appendTo ($('<td>', {prop: {colspan: cols}}) .appendTo ($('<tr>') .insertAfter (tuple)));
  }

  removeRuleBox (rulebox, field) {
    let tr = rulebox .closest ('tr');
    if (tr .length) {
      if (! field)
        field = tr .prev ('tr') .find ('._field') .data ('field');
      if (field)
        field .setRuleShowing (false);
      tr .remove();
    }
  }

  updateRulesField (id, rules) {
    const field = this._getField (id, 'rules');
    this .updateField (id, 'rules', field._ruleIsShowing || rules);
  }
}

class NeedsAttentionTableView extends ImportedTransactionTableView {

  constructor (name, columns, options, accounts, variance, toggleRule, selectBatch) {
    super (name, columns, options, accounts, variance, toggleRule);
    this._selectBatch = selectBatch;
  }

  addHtml (toHtml) {
    super .addHtml (toHtml);
    if (this._selectBatch)
      this._html .find ('tbody') .on ('click', 'td:nth-child(9)', e => {
        let field = $(e .currentTarget) .find ('._field') .data ('field');
        if (field && field._value)
          this._selectBatch (field._value);
        e.stopImmediatePropagation();
        return false;
      })
  }

  _getFields (fields) {
    return super._getFields (fields) .concat (new ViewLabel ('importTime',
      new ViewFormat (
        (value => {return Types .timeShort .toString   (value)}),
        (view  => {return Types .timeShort .fromString (view)}),
        (value => {return Types .timeLongHM .toString (value)})
      )
    ));
  }

  _getHeaders (headers) {
    return super._getHeaders (headers) .filter (h => {return h .name != 'importTime'}) .concat ({name: 'importTime', header: 'Added'});
  }
}

