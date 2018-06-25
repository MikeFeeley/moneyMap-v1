class ImportRulesView extends TupleView {

  constructor (name, date, accounts, variance) {
    var stringFunctions = [
      ['Any',         ''],
      ['Is',          'eq'],
      ['Starts With', 'sw'],
      ['Ends With',   'ew'],
      ['Contains',    'co']
    ];
    var amountFunctions = [
      ['Any',       ''],
      ['<',         'lt'],
      ['<=',        'le'],
      ['=',         'eq'],
      ['>=',        'ge'],
      ['>',         'gt'],
      ['(&#8943;)', 'be'],
      ['[&#8943;]', 'bi']
    ];
    var accFormat = new ViewFormatOptions (
      value => {return (accounts .getAccounts() .find (a => {return a._id  == value}) || {}) .name},
      view  => {return (accounts .getAccounts() .find (a => {return a.name == view && a .isCashFlowAccount()}) || {}) ._id},
      value => {},
      ()    => {return accounts .getAccounts() .filter (a => {return a .type == a .isCashFlowAccount()}) .map (a => {return a.name})}
    );
    var cats      = variance .getBudget() .getCategories();
    var catFormat = new ViewFormatOptions (
      value => {var cat = cats .get (value); return cat? cat.name: value},
      view  => {return view},
      value => {return cats .getPathname (cats .get (value)) .join (': ')},
      ()    => {return cats}
    );
    let ruleDateFormat = new ViewFormat (
      /* toView   */ value => {return value >= 1 && value <= 31?                value: Types .dateDM .toString   (value)},
      /* fromView */ view  => {return ! isNaN (view) && view >= 1 && view < 31? view:  Types .dateDM .fromString (view, m => {return Types .date .today()})},
      /* toolTip  */ value => {return ''}
    )
    var getValue = (field, html) => {
      let f = html .closest ('tr') .find ('.' + this._getFieldHtmlClass (field)) .data ('field');
      return f && f .get();
    }
    var getDate        = html => {return date};
    var getDebit       = html => {return getValue ('debit',  html)};
    var getCredit      = html => {return getValue ('credit', html)};
    var getIsPriorYear = html => {return date < variance .getBudget() .getStartDate()};
    var fields = [
      new ViewSelect       ('date_fn',           new ViewFormatOptionList (amountFunctions)),
      new ViewTextbox      ('date_op0',          ruleDateFormat),
      new ViewTextbox      ('date_op1',          ruleDateFormat),
      new ViewSelect       ('payee_fn',          new ViewFormatOptionList (stringFunctions)),
      new ViewTextbox      ('payee_op0',         ViewFormats              ('string')),
      new ViewSelect       ('debit_fn',          new ViewFormatOptionList (amountFunctions)),
      new ViewTextbox      ('debit_op0',         ViewFormats              ('moneyDC')),
      new ViewTextbox      ('debit_op1',         ViewFormats              ('moneyDC')),
      new ViewSelect       ('credit_fn',         new ViewFormatOptionList (amountFunctions)),
      new ViewTextbox      ('credit_op0',        ViewFormats              ('moneyDC')),
      new ViewTextbox      ('credit_op1',        ViewFormats              ('moneyDC')),
      new ViewSelect       ('description_fn',    new ViewFormatOptionList (stringFunctions)),
      new ViewTextbox      ('description_op0',   ViewFormats              ('string')),
      new ViewTextbox      ('payee',             ViewFormats ('string')),
      new ViewTextbox      ('debit',             AmountFormulaType .toViewFormat()),
      new ViewTextbox      ('credit',            AmountFormulaType .toViewFormat()),
      new ViewSelect       ('account',           accFormat),
      new ViewCategoryEdit ('category',          catFormat, '', '', 'Category', getDate, getDebit, getCredit, getIsPriorYear),
      new ViewTextbox      ('description',       ViewFormats ('string')),
      new ViewCheckbox     ('payeeUpdate'),
      new ViewCheckbox     ('debitUpdate'),
      new ViewCheckbox     ('creditUpdate'),
      new ViewCheckbox     ('accountUpdate'),
      new ViewCheckbox     ('categoryUpdate'),
      new ViewCheckbox     ('descriptionUpdate'),
      new ViewLabel        ('debit_split_remaining', ViewFormats ('string')),
      new ViewLabel        ('credit_split_remaining', ViewFormats ('string')),
      new ViewLabel        ('account_split_remaining', ViewFormats ('string'))
    ];
    super (name, fields);
    this._rules = new Map();
    this._categoryPicker = new CategoryPicker (accounts, variance);
    this._TITLE = 'Import Rule';
    this._NO_MATCH_TITLE = 'Import Rule &dash; Does Not Match this Transaction'
  }

  delete() {
    this._categoryPicker .delete();
  }

  _addTable (name, legend, toHtml, before = []) {
    toHtml .find ('.' + name + 'Button') .addClass ('hidden');
    var fs    = $('<fieldset>', {class: '_part'});
    var added = false;
    for (let b of before) {
      var bh = toHtml .find ('.' + b);
      if (bh .length) {
        fs .insertBefore (bh .closest ('fieldset'));
        added = true;
        break;
      }
    }
    if (! added)
      fs .appendTo (toHtml);
    $('<legend>') .append ($('<span>', {text: legend})) .appendTo (fs);
    return $('<tbody>') .appendTo ($('<table>', {class: name, data: {name: name}}) .appendTo (fs));
  }

  _removeTable (table) {
    var name = table .data ('name');
    table .closest ('fieldset._rule')  .find ('.' + name + 'Button') .removeClass ('hidden');
    table .closest ('fieldset._part')  .remove();
  }

  _addButton (id, name, text, eventType, toHtml) {
    var button = $('<button>', {class: name, text: text}) .appendTo (toHtml);
    button .click (e => {
      this._notifyObservers (eventType, id);
    });
  }

  addRule (id) {
    var rule   = $('<fieldset>', {class: '_rule'}) .appendTo (this._html);
    var legend = $('<legend>') .appendTo (rule);
    $('<span>',   {html: this._TITLE + ' '}) .appendTo (legend);
    $('<span>',   {html: '&mdash;'}) .appendTo (legend);
    this._addButton (id, '_updateButton', 'Modify', ImportRulesViewEvent .CREATE_UPDATE, legend);
    this._addButton (id, '_splitButton',  'Split',  ImportRulesViewEvent .CREATE_SPLIT,  legend);
    this._addButton (id, '_addButton',    'Add',    ImportRulesViewEvent .CREATE_ADD,    legend);
    $('<span>',   {html: '&mdash;'}) .appendTo (legend);
    this._addButton (id, '',              'Apply',  ImportRulesViewEvent .APPLY,  legend);
    this._addButton (id, '',              'Apply to All',  ImportRulesViewEvent .APPLY_UNCATEGORIZED,  legend);
    this._addButton (id, '',              'Delete', ImportRulesViewEvent .REMOVE, legend);
    $('<span>',   {html: '&mdash;'}) .appendTo (legend);
    this._addButton (id, '',              'New',    ImportRulesViewEvent .NEW,   legend);
    this._addButton (id, '',              'Clone',  ImportRulesViewEvent .CLONE, legend);
    this._rules .set (id, rule);
    return rule;
  }

  setPredicateIsMatch (id, isMatch) {
    var rule = this._rules .get (id);
    rule [isMatch? 'removeClass': 'addClass'] ('_nomatch');
    rule .find ('> legend > span') .first() .html ((isMatch? this._TITLE: this._NO_MATCH_TITLE) + ' ')
  }

  show() {
    if (this._toHtml)
      this._toHtml .slideDown ({duration: UI_RULE_SLIDE_MS, queue: false});
  }

  remove (onDelete) {
    if (this._toHtml) {
      let toHtml   = this._toHtml;
      this._toHtml = null;
      toHtml .slideUp ({duration: UI_RULE_SLIDE_MS, queue: false, complete: () => {
        toHtml .empty();
        if (onDelete)
          onDelete();
      }});
    }
  }

  addHtml (toHtml) {
    this._toHtml = toHtml;
    toHtml .css ({display: 'none'})
    $('<div>', {html: '&nbsp'}) .appendTo (toHtml);
    this._html = $('<div>', {class: this._name}) .appendTo (toHtml);
    $('<div>', {html: '&nbsp'}) .appendTo (toHtml);
    this._html .click (e => {
      return false;
    });
    this._html .keydown (e => {
      var getId = e => {return $(e .target) .closest ('._field') .data ('field')._id};
      if (e .keyCode == 9)
        e .keyCode = e .shiftKey? 37: 39;
      switch (e .keyCode) {
        case 8: /* delete */
          if (e .metaKey) {
            this._notifyObservers (ImportRulesViewEvent .REMOVE_KEY, getId (e));
            return false;
          }
          break;
        case 13: /* return */
          if (e .metaKey) {
            this._notifyObservers (ImportRulesViewEvent .INSERT_KEY, {
              insert: {},
              pos:    {before: e .shiftKey, id: getId (e), inside: e .altKey}
            }, true);
            return false;
          }
          break;
        case 38: /* arrow up */
        case 40: /* arrow down */
          var name = $(e .target) .closest ('._field') .data ('field') ._name;
          var row  = $(e .target) .closest ('tr') [e .keyCode == 38? 'prev': 'next']();
          var next = row .find ('.' + this._getFieldHtmlClass (name)) .data ('field');
          if (next)
            next .click();
          return false;
      }
    })
  }

  _normalizeColumns (tr, missing) {
    for (let c of missing) {
      var ref = tr .find ('td') .slice (c, c+1);
      if (ref .length)
        var td = $('<td>') .insertBefore (ref)
      else
        var td = $('<td>') .appendTo (tr);
      $('<div>', {class: '_content'}) .appendTo (td);
    }
  }

  _getFieldHtmlFromTuple (tuple) {
    return tuple .find ('._field');
  }

  _setRowShowing (id, type) {
    let tr  = this._rules .get (id) .find ('.' + type) .find ('tr') .last();
    if (tr .find ('._field') .toArray() .find (f => {let fld = $(f) .data ('field'); return fld && fld .isEnabled()}))
      tr .removeClass ('hidden')
    else
      tr .addClass ('hidden');
  }

  setPredicateFieldsEnabled (data) {
    for (let f of ['date', 'payee', 'credit', 'debit', 'credit', 'description']) {
      this .setFieldEnabled (data._id, f + '_op0', (data [f + '_fn'] || '') != '')
      if (['date', 'credit', 'debit'] .includes (f))
        this .setFieldEnabled (data._id, f + '_op1', ['be','bi'] .includes (data [f + '_fn']))
    }
    this._setRowShowing (data._id, '_predicate');
  }

  addPredicate (data) {
    var rule = this._rules .get (data._id);
    if (!rule)
      rule = this .addRule (data._id);
    var predicate = this._addTable ('_predicate', 'Match', rule);
    var tr = $('<tr>', {data: {id: data._id}}) .appendTo (predicate);
    this .createFields ({
      _id:            data._id,
      date_fn:        data .date_fn        || '',
      payee_fn:       data .payee_fn       || '',
      debit_fn:       data .debit_fn       || '',
      credit_fn:      data .credit_fn      || '',
      description_fn: data .description_fn || ''
    }, () => {return $('<td>') .appendTo (tr)});
    this._normalizeColumns (tr, [0,5,6]);
    tr = $('<tr>', {data: {id: data._id}}) .appendTo (predicate);
    this .createFields ({
      _id:             data._id,
      date_op0:        data .date_op0        || '',
      payee_op0:       data .payee_op0       || '',
      debit_op0:       data .debit_op0       || '',
      credit_op0:      data .credit_op0      || '',
      description_op0: data .description_op0 || ''
    }, () => {return $('<td>') .appendTo (tr)})
    this._normalizeColumns (tr, [0,5,6]);
    tr = $('<tr>', {data: {id: data._id}}) .appendTo (predicate);
    this .createFields ({
      _id: data._id,
      date_op1:   data .date_op1,
      debit_op1:  data .debit_op1,
      credit_op1: data .credit_op1
    }, () => {return $('<td>') .appendTo (tr)});
    this._normalizeColumns (tr, [0,2,5,6,7]);
    this._tuples .set (data._id, predicate);
    this .setPredicateFieldsEnabled (data);
  }

  setUpdateFieldsEnabled (data) {
    for (let f of ['payee', 'debit', 'credit', 'account', 'category', 'description'])
      this .setFieldEnabled (data._id, f, data [f + 'Update']);
  }

  addUpdate (data) {
    var update = this._addTable ('_update', 'Modify', this._rules .get (data .predicate), ['_split', '_add']);
    var tr     = $('<tr>', {data: {id: data._id}}) .appendTo (update);
    this .createFields ({
      _id: data ._id,
      payeeUpdate:       data .payeeUpdate       || '',
      debitUpdate:       data .debitUpdate       || '',
      creditUpdate:      data .creditUpdate      || '',
      accountUpdate:     data .accountUpdate     || '',
      categoryUpdate:    data .categoryUpdate    || '',
      descriptionUpdate: data .descriptionUpdate || ''
    }, () => {return $('<td>') .appendTo (tr)});
    this._normalizeColumns (tr, [0,1]);
    tr .click (':input', e => {
      if (! $(e .currentTarget) .find (':input') .toArray() .find (i => {return $(i) .prop ('checked')}))
        this._notifyObservers (ImportRulesViewEvent .REMOVE, data._id)
    })
    var tr = $('<tr>', {data: {id: data._id}}) .appendTo (update);
    this .createFields ({
      _id: data ._id,
      payee:       data .payee       || '',
      debit:       data .debit       || '',
      credit:      data .credit      || '',
      account:     data .account     || '',
      category:    data .category    || '',
      description: data .description || ''
    }, () => {return $('<td>') .appendTo (tr)});
    this._normalizeColumns (tr, [0,1]);
    this._tuples .set (data._id, update);
    this .setUpdateFieldsEnabled (data);
  }

  addSplit (data, before, isRemainingRow) {
    var rule  = this._rules .get (data .predicate);
    var split = rule .find ('._split');
    if (split .length == 0)
      split = this._addTable ('_split', 'Split', this._rules .get (data .predicate), ['_add']);
    var tr = $('<tr>', {data: {id: data._id}});
    before = before && this._tuples .get (before)
    if (before)
      tr .insertBefore (before);
    else
      tr .appendTo (split);
    this .createFields ({
      _id:         data ._id,
      [isRemainingRow? 'debit_split_remaining':   'debit']: isRemainingRow? '': data .debit  || '',
      [isRemainingRow? 'credit_split_remaining': 'credit']: isRemainingRow? '': data .credit || '',
      account_split_remaining: isRemainingRow? 'Any Remaining': '',
      category:    data .category    || '',
      description: data .description || ''
    }, () => {return $('<td>') .appendTo (tr)})
    this._normalizeColumns (tr, [0,1,2]);
    this._tuples .set (data._id, tr);
    if ($(document.activeElement) .closest ('._rule') [0] == rule [0]) {
      var focus = $(tr .find ('._field') .toArray() .find (h => {var f = $(h) .data ('field'); return f && f .isEnabled()})) .data ('field');
      if (focus)
        focus .click();
    }
  }

  addAdd (data, before, options) {
    var rule = this._rules .get (data .predicate);
    var add  = rule .find ('._add');
    if (add .length == 0)
      add = this._addTable ('_add', 'Add', this._rules .get (data .predicate));
    var tr = $('<tr>', {data: {id: data._id}});
    before = before && this._tuples .get (before)
    if (before)
      tr .insertBefore (before);
    else
      tr .appendTo (add);
    this .createFields ({
      _id:         data ._id,
      payee:       data .payee       || '',
      debit:       data .debit       || '',
      credit:      data .credit      || '',
      account:     data .account     || '',
      category:    data .category    || '',
      description: data .description || ''
    }, () => {return $('<td>') .appendTo (tr)})
    this._normalizeColumns (tr, [0, 1]);
    this._tuples .set (data._id, tr);
    if ($(document.activeElement) .closest ('._rule') [0] == rule [0]) {
      var focus = $(tr .find ('._field') .toArray() .find (h => {var f = $(h) .data ('field'); return f && f .isEnabled()})) .data ('field');
      if (focus)
        focus .click();
    }
    if (options)
      this .updateTuple (data._id, options);
  }

  removeTuple (id) {
    const tuple  = this ._tuples .get (id);
    if (tuple) {
      const table  = tuple .closest ('table');
      const rule   = table .closest ('._rule');
      if ($(document.activeElement) .closest ('._rule') [0] == rule [0]) {
        var newFocus = tuple .next ('tr');
        if (newFocus .length == 0)
          newFocus = tuple .prev ('tr');
        if (newFocus .length) {
          newFocus = newFocus .find ('._field') .toArray() .find (h => {
            var f = $(h) .data ('field');
            return f && f .isEnabled()
          });
          newFocus = newFocus && $(newFocus) .data ('field');
        } else
          newFocus = undefined
      }
      super .removeTuple (id);
      if (table .find ('tr') .length ==0) {
        this ._removeTable (table);
        if (rule .find ('fieldset') .length == 0) {
          rule .remove();
          if (this._html .find ('._rule') .length == 0) {
            this._html .remove();
            this._notifyObservers (ImportRulesViewEvent .DELETED)
          }
        }
      } else if (newFocus)
        newFocus .click();
    }
  }

  async showApplyPopup (id, presenter, onClose) {
    const container = $('<div>', {class: '_ApplyPopup'}) .appendTo (this._rules .get(id));
    const content   = $('<div>') .appendTo (container);
    container .css ({top: 30, left: 10});
    await presenter .addHtml (content, () => {
      container .remove();
      ui .ModalStack .delete (modal);
    });
    const modal = ui .ModalStack .add (
      e => {return e && !$.contains (container .get (0), e .target) && container .get (0) != e .target},
      () => {popup .remove()},
      true
    );
  }

  updateTuple (id, options) {
    var html = this._getTuple (id);
    if (html) {
      for (let op of [['isGroup', '_group'], ['isLeader', '_leader'], ['isLast', '_last']])
        html [options [op [0]]? 'addClass': 'removeClass'] (op [1]);
      return html
    }
  }
}

var ImportRulesViewEvent = Object.create (TupleViewEvent, {
  CREATE_UPDATE:       {value: 300},
  CREATE_SPLIT:        {value: 301},
  CREATE_ADD:          {value: 302},
  DELETED:             {value: 303},
  REMOVE_KEY:          {value: 304},
  INSERT_KEY:          {value: 305},
  APPLY:               {value: 306},
  APPLY_UNCATEGORIZED: {value: 307},
  APPLY_ALL:           {value: 308},
  NEW:                 {value: 309},
  CLONE:               {value: 310}
});

class ApplyToTableView extends TransactionTableView {

  constructor (name, columns, options, accounts, variance) {
    super (name, columns, options, accounts, variance);
  }

  delete() {
    if (this._html)
      this._html .remove();
  }

  _getFields (fields) {
    return super._getFields (fields) .concat (new ViewCheckbox ('apply'));
  }

  _getHeaders (headers) {
    return [{name: 'apply', header: 'A'}] .concat (super._getHeaders (headers) .filter (h => {return h .name != 'apply'}));
  }

  _getApplyFields() {
    return this._html .find ('tbody') .find ('._field_apply') .toArray() .map (h => {return $(h) .data ('field')});
  }

  addHtml (toHtml) {
    if (! this._html) {
      this._html = $('<div>', {class: this._name}) .appendTo (toHtml);
      super .addHtml (this._html);
      var apply = $('<button>', {class: '_apply_button', text: 'Apply'}) .prependTo (toHtml);
      apply .click (e => {this._notifyClick()});
      $('<div>', {class: '_title', text: 'Apply Rule to These Matching, Unallocated Transactions'}) .prependTo (toHtml);
      this._html .find ('thead') .find ('._field_apply') .click (e => {
        var fields   = this._getApplyFields();
        var selected = fields .find (f => {return f.get()})
        for (let f of fields)
          f .set (selected? 0: 1);
      })
      $('body') .one ('keydown', e => {
        if (e .keyCode == 13)
          this._notifyClick();
      })
    }
  }

  _notifyClick() {
    this._notifyObservers (
      ApplyToTableViewEvent .APPLY,
      this._getApplyFields() .filter (f => {return f.get()}) .map (f => {return f._id})
    );
  }
}

var ApplyToTableViewEvent = Object .create (TableViewEvent, {
  APPLY: {value: 400}
})
