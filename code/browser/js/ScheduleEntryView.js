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
    var fields = [
      new ViewScalableTextbox          ('name',            ViewFormats ('string'),       '', '', 'Name'),
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
      categoryLine: ['name', 'scheduleLine', 'unallocated', 'total'],
      scheduleLine: ['start', 'end', 'amount', 'repeat', 'limit', 'notes']
    }
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
    let tip    = $('<div>', {class: '_fieldTip hidden'}) .appendTo (html) .append ($('<div>'));
    $('<div>', {text: 'TIP'}) .appendTo (tip .children());
    for (let tl of tipText)
      $('<div>', {text: tl}) .appendTo (tip .children());
    setTimeout (() => {
      let pos = ui .calcPosition (target, html, {top: - tip .height() -16, left: -16});
      if (pos .top < 16)
        pos = ui .calcPosition (target, html, {top: 32, left: -16})
      tip .css (pos);
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

