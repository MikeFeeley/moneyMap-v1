class ScheduleEntryView extends ListView {

  constructor (name, options, accounts, variance) {
    if (options && options .showVariance)
      var hud = new BudgetProgressHUD (accounts, variance, {noScheduleEntry: true, isNotModal: true});
    var startFormat = new ViewFormat (
      value => {return Types .dateMYorYear .toString   (value)},
      view  => {return Types .dateMYorYear .fromString (view, variance .getBudget() .getStartDate())},
      value => {return ''}
    );
    var endFormat = new ViewFormat (
      value => {return Types .dateEndMY .toString   (value)},
      view  => {return Types .dateEndMY .fromString (view, variance .getBudget() .getStartDate())},
      value => {return ''}
    );
    let categories = variance .getBudget() .getCategories();
    var fields = [
      new ScheduleEntryName            ('name',            new ScheduleNameFormat (accounts, categories), '', '', 'Name', categories),
      new ScheduleEntryAccount         ('account',         ViewFormats ('string')),
      new ViewEmpty                    ('scheduleLine',    ViewFormats ('string')),
      new ScheduleEntryTotal           ('total',           ViewFormats ('moneyDC'), hud),
      new ScheduleEntryViewUnallocated ('unallocated',     ViewFormats ('moneyDC')),
      new ViewScalableTextbox          ('start',           startFormat,                  '', '', 'Start'),
      new ViewScalableTextbox          ('end',             endFormat,                    '', '', 'End'),
      new ViewScalableTextbox          ('amount',          ViewFormats ('moneyDC'),      '', '', 'Amount'),
      new RepeatField                  ('repeat', variance .getBudget()),
      new LimitField                   ('limit',           ViewFormats ('number'),       '', '', 'Yrs'),
      new ViewScalableTextbox          ('notes',           ViewFormats ('string'),       '', '', 'Notes')
    ];
    var lineTypes = {
      categoryLine: ['name', 'account', 'scheduleLine', 'unallocated', 'total'],
      scheduleLine: ['start', 'end', 'amount', 'repeat', 'limit', 'notes']
    }
    options .protectRoot = true;
    super (name, fields, lineTypes, options);
    this._hud = hud;
  }

  delete() {
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
    let target = field._html;
    let tip    = $('<div>', {class: '_fieldTip fader'}) .appendTo (html) .append ($('<div>'));
    $('<div>', {text: 'TIP'}) .appendTo (tip .children());
    for (let tl of tipText)
      $('<div>', {text: tl}) .appendTo (tip .children());
    setTimeout (() => {
      let pos;
      if (ui .calcPosition (target, $('body'), {top: - tip .height() -16, left: 0}) .top >= 16)
        pos = ui .calcPosition (target, html, {top: - tip .height() -16, left: 0});
      else
        pos = ui .calcPosition (target, html, {top: 32, left: 0})
      tip .css (pos);
      ui .scrollIntoView (tip);
      tip .addClass ('fader_visible') .one ('transitionend', () => {
        let to, mo = ui .ModalStack .add (() => {return true}, () => {
          if (mo) {
            mo = null;
            if (to)
              clearTimeout (to);
            tip .removeClass ('fader_visible') .one ('transitionend', () => {tip .remove()});
          }
        }, true);
        to = setTimeout (() => {
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
    let now = new Date() .getTime() / (1000 * 60); // no more frequently than once a minute
    if (! this._lastNameChangeTip || (now - this._lastNameChangeTip) > 1) {
      this._lastNameChangeTip = now;
      this._showFieldTip (this._getField (id, 'name'), this._html, [
        'Change applies to transactions in every year.',
        'To change only this year, delete and add new category.'
      ]);
    }
  }

  showTipNoRemove (id) {
    this._showFieldTip (this._getField (id, 'name'), this._html, [
      'Current-year transactions use category (or subcategory).',
      'Recategorize transactions before deleting.'
    ]);
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

class ScheduleName extends ViewTextbox {
  _addHtml() {
    if (this .cat && this .cat .account) {
      this._inputContainer = $('<div>', {data: {field: this}})         .appendTo (this._html);
      this._input = $('<div>', {class: '_content', text: this .get()}) .appendTo (this._inputContainer);
      $('<div>', {class: '_prefix', text: this._prefix})               .appendTo (this._inputContainer);
      $('<div>', {class: '_suffix', text: this._suffix})               .appendTo (this._inputContainer);
    } else
      super._addHtml();
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

