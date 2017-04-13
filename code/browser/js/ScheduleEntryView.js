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

