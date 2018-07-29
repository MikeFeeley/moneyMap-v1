class ScheduleEntryView extends ListView {

  constructor (name, options, accounts, variance) {
    if (options && options .showTotal && ! options .categoriesOnlyWithParent && ! options .categories)
      var hud = new BudgetProgressHUD (accounts, variance, {noScheduleEntry: true, isNotModal: true});
    const startFormat = new ViewFormat (
      value => {
        return Types.dateMYorYear.toString (value, variance.getBudget ().getStartDate ())
      },
      view => {
        return Types.dateMYorYear.fromString (view, variance.getBudget ().getStartDate ())
      },
      value => {return ''}
    );
    const endFormat = new ViewFormat (
      value => {return Types .dateEndMY .toString   (value)},
      view  => {return Types .dateEndMY .fromString (view, variance .getBudget() .getStartDate())},
      value => {return ''}
    );
    const totalFormat = new ViewFormat (
      value => {return isNaN(value)? value: Types .moneyDC .toString   (value)},
      view  => {return Types .moneyDC .fromString (view)},
      value => {return ''}
    )
    const budget     = variance .getBudget();
    const categories = budget .getCategories();
    const fields = [
      new ScheduleEntryName            ('name',            new ScheduleNameFormat (accounts, categories), '', '', 'Name', categories),
      new ScheduleEntryAccount         ('account',         ViewFormats ('string')),
      new ScheduleEntryZombie          ('zombie',          ViewFormats ('string')),
      new ScheduleEntryZombieActive    ('zombieActive',    ViewFormats ('string'), categories, variance .getActuals()),
      new ViewEmpty                    ('scheduleLine',    ViewFormats ('string')),
      new ScheduleEntryTotal           ('total',           totalFormat, hud),
      new ScheduleEntryViewUnallocated ('unallocated',     ViewFormats ('moneyDC')),
      new ViewScalableDate             ('start',           startFormat,                  '', '', 'Start', {type: 'MYorYear', budget: budget, other: 'end'}),
      new ViewScalableDate             ('end',             endFormat,                    '', '', 'End',   {type: 'EndMY',    budget: budget, other: 'start'}),
      new ViewScalableTextbox          ('amount',          ViewFormats ('moneyDC'),      '', '', 'Amount'),
      new RepeatField                  ('repeat',          variance .getBudget()),
      new LimitField                   ('limit',           ViewFormats ('number'),       '', '', 'Yrs'),
      new ViewElasticTextbox           ('notes',           ViewFormats ('string'),       '', '', 'Notes')
    ];
    const lineTypes = {
      categoryLine: ['name', 'account', 'zombie', 'zombieActive', 'scheduleLine', 'unallocated', 'total'],
      scheduleLine: ['start', 'end', 'amount', 'repeat', 'limit', 'notes']
    }
    options .protectRoot = true;
    super (name, fields, lineTypes, options);
    this._hud = hud;
  }

  delete() {
    super.delete ();
    if (this._hud)
      ui .ModalStack .delete (this._modalStackEntry);
  }

  addHtml (toHtml) {
    super .addHtml (toHtml);
    if (this._hud)
      this._modalStackEntry = ui .ModalStack .add (e => {
        return this._hud .isShowing()  && e && ! this._hud .contains (e .target)
      }, () => {this._hud .hide()}, false);
  }

  _showFieldTip (field, html, tipText) {
    if (this._pendingFieldTip) {
      this._pendingFieldTip();
      this._pendingFieldTip = undefined;
    }
    let target = field._html;
    let tip    = $('<div>', {class: '_fieldTip fader'}) .appendTo (html) .append ($('<div>'));
    $('<div>', {text: 'TIP'}) .appendTo (tip .children());
    for (let tl of tipText)
      $('<div>', {text: tl}) .appendTo (tip .children());
    setTimeout (() => {
      let pos;
      if (ui .calcPosition (target, $('body'), {top: - tip .height() -16, left: 0}) .top >= 64)
        pos = ui .calcPosition (target, html, {top: - tip .height() -16, left: 0});
      else
        pos = ui .calcPosition (target, html, {top: 64, left: 0})
      tip .css (pos);
      ui .scrollIntoView (tip);
      let to, mo;
      this._pendingFieldTip = () => {
        if (to)
          clearTimeout (to);
        if (mo)
          ui .ModalStack .delete (mo);
        tip .remove();
      };
      tip .addClass ('fader_visible') .one ('transitionend', () => {
        mo = ui .ModalStack .add (() => {return true}, () => {
          this._pendingFieldTip = undefined;
          if (mo) {
            mo = null;
            if (to)
              clearTimeout (to);
            tip .removeClass ('fader_visible') .one ('transitionend', () => {tip .remove()});
          }
        }, true);
        to = setTimeout (() => {
          this._pendingFieldTip = undefined;
          tip .removeClass ('fader_visible') .one ('transitionend', () => {
            tip .remove();
            if (mo)
              ui .ModalStack .delete (mo);
          });
        }, UI_FIELD_TIP_DURATION_MS);
      })
    }, 0)
  }

  showTipNameChange (id) {
    this._showFieldTip (this._getField (id, 'name'), this._html, [
      'Change also applies to older transactions that use this category',
      'To change only this year, delete and add new category.'
    ]);
  }

  showTipNoRemove (id) {
    this._showFieldTip (this._getField (id, 'name'), this._html, [
      'Current-year transactions use category (or subcategory).',
      'Recategorize transactions before deleting.'
    ]);
  }

  showTipNoRemoveZombie (id) {
    this._showFieldTip (this._getField (id, 'name'), this._html, [
      'You can not delete this category.',
      'It is still in use by a transaction or budget.'
    ]);
  }

  addHelpTable (descData, tableData, top=130, left=220) {
    if (! this._helpTable) {
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
}

class ScheduleEntryTotal extends ViewLabel {
  constructor (name, format, hud) {
    super (name, format);
    this._hud = hud;
  }
  _addHtml() {
    super._addHtml();
    if (this._hud)
      this._html .click (e => {
        var target = $(e .currentTarget);
        var toHtml = target .offsetParent();
        var pos    = {top: target .position() .top + 32, right: -8};
        this._hud .show (target .closest ('._list_line_categoryLine') .data ('id'), Types .dateDMY .today(), 0, 0, toHtml, pos);
        return false;
      })
  }
  set (value) {
    if (value == '...') {
      this._html .addClass ('_bold');
    } else {
      this._html .removeClass ('_bold');
    }
    super .set (value);
  }
}

class ScheduleEntryViewUnallocated extends ViewLabel {
  set (value) {
    if (value < 0) {
      this._isNegative = true;
      this._html .addClass ('_negative');
      value = -value;
    } else {
      this._isNegative = false;
      this._html .removeClass ('_negative');
    }
    super .set (value);
    const notes = this._html .prev ('._field_scheduleLine') .find ('._field_notes');
    notes [(value? 'add': 'remove') + 'Class'] ('_narrow');
    this._html .css ({visibility: value? 'visible' : 'hidden'});
  }
  _set (value) {
    super ._set (value? (this._isNegative? '(Over: ': '(Unallocated: ') + value + ')': '');
  }
}

class ScheduleEntryAccount extends ViewEmpty {
  set (value) {
    this._html .prev ('._field_name') [value? 'addClass': 'removeClass'] ('_account');
  }
}

class ScheduleEntryZombie extends ViewEmpty {
  set (value) {
    this._html .prevAll ('._field_name') [value? 'addClass': 'removeClass'] ('_zombie');
  }
}

class ScheduleEntryZombieActive extends ViewLabel {
  constructor (name, format, categories, actuals) {
    super (name, format);
    this._categories = categories;
    this._actuals    = actuals;
  }
  _addHtml (value) {
    super._addHtml (value);
    this._label .click (e => {
      let close    = () => {popup .removeClass ('fader_visible') .one ('transitionend', () => {popup .remove()})};
      let html     = this._html .offsetParent();
      let popup    = $('<div>', {class: '_zombieControlPopup fader'}) .appendTo (html);
      popup .css (ui .calcPosition (this._html, html, {top: 16, left: -250}));
      let content  = $('<div>') .appendTo (popup);
      $('<div>', {text: 'Explore Category'}) .appendTo (content);
      let buttons = $('<div>') .appendTo (content);
      $('<button>', {text: 'Reactivate'}) .appendTo (buttons)
      .click (e => {
        this._view._notifyObservers (ScheduleEntryViewEvent .REACTIVATE_ZOMBIE, {
          id: this._id,
          after: this._html .closest ('._tuple') .prev ('._tuple') .data ('id')
        });
        ui .ModalStack .delete (modal);
        close();
      });
      let cat = this._categories .get (this._id);
      if (this._actuals .hasTransactions (cat, null, null)) {
        $('<button>', {text: 'Show Transactions'}) .appendTo (buttons)
        .click (e => {
          let html = this._html .closest ('._ReorganizeScheduleEntry')
          this._view._notifyObservers (ScheduleEntryViewEvent .SHOW_TRANSACTIONS, {
            id:   this._id,
            html: html,
            position: ui .calcPosition (this._html, html, {top: 24, left: -250})
          });
          ui .ModalStack .delete (modal);
          close();
        })
      }
      $('<button>', {text: 'Cancel'}) .appendTo (buttons)
        .click (e => {
          ui .ModalStack .delete (modal);
          close();
        })
      let modal = ui .ModalStack .add (
        e  => {return e && ! $.contains (popup .get (0), e .target)},
        () => {close()},
        true
      );
      ui .scrollIntoView (popup, true);
      setTimeout (() => {popup .addClass ('fader_visible')}, 0);
      e .stopPropagation();
    })
  }
}

class ScheduleName extends ViewTextbox {
  _addHtml() {
    if (this .cat && this .cat .account) {
      this._inputContainer = $('<div>', {data: {field: this}})         .appendTo (this._html);
      this._input = $('<input>', {class: '_content', prop: {readonly: true}, text: this .get()}) .appendTo (this._inputContainer);
      $('<div>', {class: '_prefix', text: this._prefix})               .appendTo (this._inputContainer);
      $('<div>', {class: '_suffix', text: this._suffix})               .appendTo (this._inputContainer);
    } else
      super._addHtml();
  }
  _get() {
    if (this .cat && this .cat .account)
      return this .cat .name;
    else
      return super._get();
  }
}

class ScheduleEntryName extends ViewScalable (ScheduleName) {
  constructor (name, format, prefix='', suffix='', placeholder='', catagories) {
    super (name, format, prefix, suffix, placeholder);
    this._categories = catagories;
  }
  newInstance (id) {
    return Object.create (this, {
      _id: {value: id},
      cat: {value: this._categories .get (id)}
    });
  }
}

class ScheduleEntryNameNotScalable extends ScheduleName {
  constructor (name, format, prefix='', suffix='', placeholder='', catagories) {
    super (name, format, prefix, suffix, placeholder);
    this._categories = catagories;
  }
  newInstance (id) {
    return Object.create (this, {
      _id: {value: id},
      cat: {value: this._categories .get (id)}
    });
  }
}

class ScheduleNameFormat extends ViewFormat {
  constructor (accountsModel, categories) {
    super (
      value      => {return Types .string .toString   (value)},
      view       => {return Types .string .fromString (view)},
      (value,id) => {
        let cat = categories .get (id);
        if (cat && cat .account)
          return accountsModel .getToolTip (cat .account, cat);
        else
          return '';
      }
    )
  }
}


class RepeatField extends ViewScalableCheckbox {
  constructor (field, budget) {
    super (field, ['not repeating', '']);
    this._budgetStart = budget .getStartDate();
    this._budgetEnd   = budget .getEndDate();
  }
  _setWithLimit (limit) {
    if (limit > 0) {
      var start = this._html .closest ('li') .find ('.' + this._view._getFieldHtmlClass ('start')) .data ('field')._value;
      var thru  = Types .dateFY .toString (Types .date .addYear (start, limit), this._budgetStart, this._budgetEnd);
    }
    this._labels [1] = ! limit? 'every year' : 'until ' + thru;
    super._set (this._value);
  }
  _set (value) {
    if (value)
      this._html .addClass ('_value_checked');
    else
      this._html .removeClass ('_value_checked');
    if (!this._limit)
      this._limit = this._html .closest ('li') .find ('.' + this._view._getFieldHtmlClass ('limit')) .data ('field');
    if (this._limit)
      this._setWithLimit (this._limit._value)
    else
      super._set (value);
  }
}

class LimitField extends ViewScalableTextbox {
  constructor (name, format, prefix, suffix, placeholder) {
    super (name, format, prefix, suffix, placeholder)
  }
  _addHtml() {
    super._addHtml();
    this._repeat = this._html .closest ('li') .find ('.' + this._view._getFieldHtmlClass ('repeat')) .data ('field');
  }
  _set (value) {
    super._set (value);
    this._repeat._setWithLimit (value);
  }
}

class ViewElasticTextbox extends ViewScalableTextbox {
  constructor (name, format, prefix, suffix, placeholder) {
    super (name, format, prefix, suffix, placeholder)
  }
  _addHtml() {
    super._addHtml();
    setTimeout (() => {
      if (this._html .closest ('._field_scheduleLine') .siblings ('._field_unallocated') .find ('._content') .text())
        this._html .addClass ('_narrow');
     }, 0);
  }
}

const ScheduleEntryViewEvent = Object.create (ListViewEvent, {
  REACTIVATE_ZOMBIE: {value: 500},
  SHOW_TRANSACTIONS: {value: 501}
});
