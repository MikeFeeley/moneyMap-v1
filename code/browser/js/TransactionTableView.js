class TransactionTableView extends TableView {

  constructor (name, columns, options, accounts, variance) {
    var cats      = variance && variance .getBudget() .getCategories();
    var accFormat = new ViewFormatOptions (
      value => {return (accounts .getAccounts() .find (a => {return a._id  == value}) || {}) .name},
      view  => {return (accounts .getAccounts() .find (a => {return a.name == view})  || {}) ._id},
      value => {},
      ()    => {return accounts .getAccounts() .map  (a => {return a.name})}
    );
    var catFormat = new ViewFormatOptions (
      value => {var cat = cats .get (value); return cat? cat.name: value},
      view  => {return view},
      value => {return cats .getPathname (cats .get (value)) .join (' > ')},
      ()    => {return cats}
    );
    var getValue = (field, html) => {
      return html .closest ('tr') .find ('.' + this._getFieldHtmlClass (field)) .data ('field') .get();
    }
    var getDate   = html => {return getValue ('date',   html)};
    var getDebit  = html => {return getValue ('debit',  html)};
    var getCredit = html => {return getValue ('credit', html)};
    var fieldDesc = {
      date:        [new ViewDateLabel            ('date',        ViewFormats ('dateDM')),
                    new ViewDateTextbox          ('date',        ViewFormats ('dateDM'), variance .getBudget() .getStartDate(), '', '', 'Date')],
      payee:       [new ViewLabel                ('payee',       ViewFormats ('string')),
                    new ViewScalableTextbox      ('payee',       ViewFormats ('string'), '', '', 'Payee')],
      debit:       [new ViewLabel                ('debit',       ViewFormats ('moneyDC')),
                    new ViewScalableTextbox      ('debit',       ViewFormats ('moneyDC'), '', '', 'Debit')],
      credit:      [new ViewLabel                ('credit',      ViewFormats ('moneyDC')),
                    new ViewScalableTextbox      ('credit',      ViewFormats ('moneyDC'), '', '', 'Credit')],
      account:     [new ViewLabel                ('account',     accFormat),
                    new ViewScalableSelect       ('account',     accFormat)],
      category:    [new ViewLabel                ('category',    catFormat),
                    new ViewScalableCategoryEdit ('category',    catFormat, '', '', 'Category', getDate, getDebit, getCredit)],
      description: [new ViewLabel                ('description', ViewFormats ('string')),
                    new ViewScalableTextbox      ('description', ViewFormats ('string'), '', '', 'Description')],
      nop0:        [new ViewLabel                ('nop0',        ViewFormats ('string')),
                    new ViewLabel                ('nop0',        ViewFormats ('string'))],
      nop1:        [new ViewLabel                ('nop1',        ViewFormats ('string')),
                    new ViewLabel                ('nop1',        ViewFormats ('string'))],
      nop2:        [new ViewLabel                ('nop2',        ViewFormats ('string')),
                    new ViewLabel                ('nop2',        ViewFormats ('string'))],
      nop3:        [new ViewLabel                ('nop3',        ViewFormats ('string')),
                    new ViewLabel                ('nop3',        ViewFormats ('string'))],
      nop4:        [new ViewLabel                ('nop4',        ViewFormats ('string')),
                    new ViewLabel                ('nop4',        ViewFormats ('string'))],
      nop5:        [new ViewLabel                ('nop5',        ViewFormats ('string')),
                    new ViewLabel                ('nop5',        ViewFormats ('string'))],
      tdebit:      [new ViewLabel                ('tdebit',      ViewFormats ('string')),
                    new ViewLabel                ('tdebit',      ViewFormats ('string'))],
      tcredit:     [new ViewLabel                ('tcredit',     ViewFormats ('string')),
                    new ViewLabel                ('tcredit',     ViewFormats ('string'))]
    }
    var fields = Object .keys (fieldDesc) .map (f => {
      var ro = options .readOnly || (options .readOnlyFields && options .readOnlyFields .includes (f));
      return fieldDesc [f] [ro? 0: 1];
    })
    var headerDesc = {
      date:        'Date',
      payee:       'Payee',
      debit:       'Debit',
      credit:      'Credit',
      account:     'Account',
      category:    'Category',
      description: 'Description'
    }
    var headers = columns .map (f => {return {name: f, header: headerDesc [f]}});
    super (name, fields, headers, options);
    this._accounts = accounts;
    this._variance = variance;
  }

  delete() {
    if (this._categoryPicker)
      this._categoryPicker .delete();
  }

  addHtml (toHtml) {
    this._categoryPicker = this._variance && new CategoryPicker (this._accounts, this._variance);
    super.addHtml (toHtml);
  }

  addTuple (data, pos, options) {
    if (pos && options && options .isGroup && ! options .isLeader)
      pos .disabledFields = ['date', 'payee', 'acccount'];
    super .addTuple (data, pos);
    this .updateTuple (data._id, options);
  }

  updateTuple (id, options) {
    var html = this._getTuple (id);
    if (html) {
      for (let op of [['isGroup', '_group'], ['isLeader', '_leader'], ['isLast', '_last']])
        html [options [op [0]]? 'addClass': 'removeClass'] (op [1]);
      return html
    }
  }

  showFieldTip (tipText, id, fieldName) {
    let field    = this._getFieldHtml (id, fieldName) .closest ('td');
    let html     = field .offsetParent();
    let tip      = $('<div>', {class: '_fieldTip hidden'}) .appendTo (html) .append ($('<div>'));
    $('<div>', {text: 'TIP'}) .appendTo (tip .children());
    for (let tl of tipText)
      $('<div>', {text: tl}) .appendTo (tip .children());
    setTimeout (() => {
      tip .css (ui .calcPosition (field, html, {top: - tip .height() - 32, left: - tip .width() / 2 + field .width() / 2}));
      tip .fadeIn (300, () => {
        let mo = ui .ModalStack .add (() => {return true}, () => {
          if (mo) {
            mo = null;
            clearTimeout (to);
            tip .fadeOut (300, () => {
              tip .remove();
            })
          }
        }, true);
        let to = setTimeout (() => {
          tip .fadeOut (1000, () => {
            tip .remove();
            if (mo)
              ui .ModalStack .delete (mo);
          })
        }, 5000);
      });
    }, 0);
  }
}

class ViewDateTextbox extends ViewScalableTextbox {
  constructor (name, format, budgetStartDate, prefix='', suffix='', placeholder='') {
    super (name, format, prefix, suffix, placeholder);
    this._budgetStartDate = budgetStartDate;
  }
  get() {
    return this._format .fromView (this._get(), (m) => {
      var value = this._value;
      if (!value) {
        var tr = this._html .closest ('tr');
        var fl = '.' + this._view._getFieldHtmlClass (this._name);
        var prev = tr .prev() .find (fl) .data('field');
        var next = tr .next() .find (fl) .data('field');
        value = (prev && prev._value) || (next && next._value);
      }
      if (value) {
        var df = m - Types.dateDM._month (value);
        return Types.dateDM._year (value) + (Math.abs (df) < 6? 0: (df < 0? 1: -1));
      } else {
        var sy = Types .dateMY ._year  (this._budgetStartDate);
        var sm = Types .dateMY ._month (this._budgetStartDate);
        return m >= sm? sy: sy + 1;
      }
    });
  }
}

class ViewDateLabel extends ViewLabel {
  get() {
    return this._format .fromView (this._get(), (m) => {
      var value = this._value;
      if (!value) {
        var tr = this._html .closest ('tr');
        var fl = '.' + this._view._getFieldHtmlClass (this._name);
        value = tr .prev() .find (fl) .data('field') ._value || tr .next() .find (fl) .data('field') ._value;
      }
      if (!value)
        return undefined;
      var df = m - Types.dateDM._month (value);
      return Types.dateDM._year (value) + (Math.abs (df) < 6? 0: (df < 0? 1: -1));
    });
  }
}

class ViewCategoryEdit extends ViewTextbox {
  constructor (name, format, prefix, suffix, placeholder, getDate, getDebit, getCredit) {
    super (name, format, prefix, suffix, placeholder);
    this._getDate     = getDate;
    this._getDebit    = getDebit;
    this._getCredit   = getCredit;
  }
  _open() {
    if (! this._isOpen) {
      this._startingValue = this.get();
      var date            = this._getDate     (this._html);
      var debit           = this._getDebit    (this._html);
      var credit          = this._getCredit   (this._html);
      var td = this._html .closest ('td');
      for (let e of [td .prev() .find (':input'), td .next() .find (':input')])
        e .one ('focus', () => {this._close()})
      this._view._categoryPicker .show (this._value, date, debit, credit, this._html, id => {
        $(this._html .find ('input') [0]) .focus();
        $(this._html .find ('input') [0]) .val(' '); // XXX workaround to clear placeholder in Safari 10.1.1
        this .set (id)
      });
      this._isOpen = true;
      this.clearTooltip();
      this._modalStackEntry = ui .ModalStack .add (e => {
        return this._isOpen && e &&
          ! this._view._categoryPicker .contains (e .target) &&
          $(e .target) .closest ('._field') [0] != this._html [0]
      }, () => {this._close()}, true);
      return false;
    } else
      return true;
  }
  _close() {
    if (this._isOpen) {
      this._view._categoryPicker.hide();
      if (this.isSelected () && this.get() != this._startingValue)
        this._view._notifyObservers (ViewEvent.UPDATE, {
          id:        this._id,
          fieldName: this._name,
          value:     this.get()
        });
      this.reset();
      this._isOpen = false;
      ui .ModalStack .delete (this._modalStackEntry);
    }
  }
  _addHtml (value) {
    super._addHtml (value);
    var input = $(this._html .find ('input') [0]);
    input .on ('click', e  => {return this._open()});
    input .on ('input', e  => {
      if (!this._isOpen)
        this._open();
      this._view._categoryPicker .filter (super._get())
    });
    input .on ('keydown', e  => {
      if (e .keyCode == 8 && e .metaKey && this._isOpen)
        return false;
      switch (e.keyCode) {
        case 13: /* return */
          if (this._isOpen) {
            this._close();
            return false;
          }
          break;
        case 37: /* arrow left */
          if (this._isOpen) {
            this._view._categoryPicker .moveLeft();
            return false;
          }
          break;
        case 38: /* arrow up */
          if (this._isOpen) {
            this._view._categoryPicker .moveUp();
            return false;
          }
          break;
        case 39: /* arrow right */
          if (this._isOpen) {
            this._view._categoryPicker .moveRight();
            return false;
          }
          break;
        case 40: /* arrow down */
          if (this._isOpen) {
            this._view._categoryPicker .moveDown();
            return false;
          }
      }
      return true;
    });
  }
  _get() {
    return this._value;
  }
  click() {
    super.click();
    this._open()
  }
}

class ViewScalableCategoryEdit extends ViewScalable (ViewCategoryEdit) {}



