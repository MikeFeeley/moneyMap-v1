class TransactionHUD extends TransactionTable {
  constructor (title, query, accounts, variance, onClose, monthStart, monthEnd) {
    var name    = '_TransactionHUD';
    var sort    = (a,b) => {return a.date < b.date? -1: a.date == b.date? 0: 1}
    var columns = ['date','payee','debit','credit','account','category','description'];
    var options = {readOnly: false, noGrouping: true};
    var view    = new TransactionTableView (name, columns, options, accounts, variance);
    super (name, query, sort, options, columns, accounts, variance, view);
    this._title      = title;
    this._onClose    = onClose;
    this._monthStart = monthStart;
    this._monthEnd   = monthEnd;
  }

  delete() {
    if (this._html) {
      this._html .remove();
      this._html = null;
    }
    ui .ModalStack .delete (this._modalStackEntry);
    if (this._onClose)
      this._onClose();
    super .delete();
  }

  *_getModelData() {
    var trans = yield* super._getModelData();
    this._tdebit  = trans .reduce ((s,t) => {s += t .debit  || 0; return s}, 0);
    this._tcredit = trans .reduce ((s,t) => {s += t .credit || 0; return s}, 0);
    return trans;
  }

  _toggleEdit() {
    var button = this._html .find ('._editButton');
    if (button .text() == 'Edit') {
      button .text ('View');
      this._html .addClass ('_TransactionEdit');
      this._view._options .readOnly = false;
      (this._query .$options = this._query .$options || {}) .groupBy = 'group';
      async (this, this .refreshHtml)();
    } else {
      button .text ('Edit');
      this._view._clearSelectedTuple();
      this._html .removeClass ('_TransactionEdit');
      this._view._options .readOnly = true;
      delete this._query .$options .groupBy;
      async (this, this .refreshHtml)();
    }
  }

  _setTitleDate() {
    var budget = this._variance .getBudget();
    var t = (Array .isArray (this._title)? this._title[0] : this._title) .split (' ');
    t.length -= 1;
    if (Types .date._difMonths (this._query .date .$lte, this._query .date .$gte) > 1) {
      if (Types .date._month (this._query .date .$gte) == 1)
        t [t .length - 1] = ' Year ' + Types .date._year (this._query .date .$gte)
      else
        t [t .length - 1] = ' Year ' + Types .dateFY .toString (this._query .date .$lte, budget .getStartDate(), budget .getEndDate())
    } else {
      t [t .length - 1] = Types .dateMonthY .toString (this._query .date .$gte);
    }
    t = t .join (' ');
    if (Array.isArray (this._title))
      this._title [0] = t;
    else
      this._title = t;
    this._html .find ('._title') .text (t);
  }

  _changeMonth (delta) {
    if (delta == 1 || delta == -1)
      delta *= Types .date._difMonths (this._query .date .$lte, this._query .date .$gte);
    this._query .date .$gte = Types .date .addMonthStart (this._query .date .$gte, delta);
    this._query .date .$lte = Types .date .monthEnd (Types .date .addMonthStart (this._query .date .$lte, delta));
    this._setTitleDate();
    async (this, this .refreshHtml)();
  }

  _toggleMonthYear() {
    var budget = this._variance .getBudget();
    var t = (Array .isArray (this._title)? this._title[0] : this._title) .split (' ');
    if (Types .date._difMonths (this._query .date .$lte, this._query .date .$gte) == 1) {
      this._monthStart = this._query .date .$gte;
      this._monthEnd   = this._query .date .$lte;
      var by = Types .date._yearForDate (this._monthStart, budget .getStartDate());
      this._query .date .$gte = Types .date._yearStart (by, budget .getStartDate());
      this._query .date .$lte = Types .date._yearEnd   (by, budget .getStartDate(), budget .getEndDate());
    } else {
      this._query .date .$gte = this._monthStart;
      this._query .date .$lte = this._monthEnd;
    }
    this._setTitleDate();
    async (this, this .refreshHtml)();
  }

  _calendarYear() {
    if (Types .date._difMonths (this._query .date .$lte, this._query .date .$gte) == 1) {
      this._monthStart = this._query .date .$gte;
      this._monthEnd   = this._query .date .$lte;
    }
    let y = Types. date._year (this._monthStart);
    this._query .date .$gte = Types .date._date (y, 1,   1);
    this._query .date .$lte = Types .date._date (y, 12, 31);
    this._setTitleDate();
    async (this, this .refreshHtml)();
  }

  _addFooter() {
    var total = this._tdebit - this._tcredit;
    this._view .addFooterRow ({
      nop0:    '',
      nop1:    '',
      tdebit:  total >= 0? Types .moneyDCZ .toString (total): 'net -->',
      tcredit: total < 0?  Types .moneyDCZ .toString (-total): '<-- net',
      nop2:    '',
      nop3:    '',
      nop4:    ''
    });
    if (total >= 0)
      $(this._view._tfoot .find ('td') [3]) .addClass ('_leftArrow');
    else
      $(this._view._tfoot .find ('td') [2]) .addClass ('_rightArrow');
  }

  *_addModelData() {
    yield* super._addModelData();
    this._addFooter();
  }

  *addHtml (toHtml, position) {
    this._html = $('<div>', {class: this._view._name}) .appendTo (toHtml);
    this._html .mouseup (e => {
      if (this._view._options .readOnly) {
        var target = $(e .target);
        var field  = target .hasClass ('_content') && target .parent() .parent ('._field') .data ('field');
        if (field) {
          let selectedText = window.getSelection().toString();
          let top          = e .pageY + this._html .offsetParent() .scrollTop() - this._html .offsetParent() .offset() .top;
          TransactionHUD .showRefineByField (
            this._title, JSON .parse (JSON .stringify (this._query)), field, selectedText, this._accounts, this._variance, this._html .offsetParent(),
            {top: top, left: this._html .position() .left + 50, right: 'auto'},
            () => {this._html .removeClass ('_occluded')},
            this._monthStart, this._monthEnd
          );
          this._html .addClass ('_occluded');
        }
        return false;
      }
    });
    if (position)
      this._html .css ({top: position .top, right: position .right, left: position .left});
    $('<div>', {class: '_title', text: Array .isArray (this._title)? this._title[0]: this._title}) .appendTo (this._html)
      .on ('click',                     e => {this._toggleMonthYear()})
      .on ('webkitmouseforcewillbegin', e => {e .preventDefault()})
      .on ('webkitmouseforcedown',      e => {this._calendarYear()})
    var buttons = $('<div>', {class: '_buttons'}) .appendTo (this._html);
    $('<button>', {html: '&lang;', class: '_prevButton'}) .appendTo (buttons) .click (e => {
      this._changeMonth (-1);
    });
    $('<button>', {html: '&rang;', class: '_nextButton'}) .appendTo (buttons) .click (e => {
      this._changeMonth (1);
    });
    $('<button>', {text: 'Edit', class: '_editButton'}) .appendTo (buttons) .click (e => {
      this._toggleEdit();
    })
    var body = $('<div>', {class: '_body'}) .appendTo (this._html);
    if (Array .isArray (this._title))
      $('<div>', {text: this._title [1], class: '_subtitle'}) .appendTo (body);
    this._view._options .readOnly = true;
    yield* super .addHtml (body);
    this._modalStackEntry = ui .ModalStack .add (
      (e) => {return ! $.contains (this._html .get (0), e .target) && this._html .get (0) != e .target},
      ()  => {this .delete()}, true
    );
  }

  _showRefineByDateRange (start, end) {
    let query = JSON .parse (JSON .stringify (this._query));
    query .date .$gte = start;
    query .date .$lte = end;
    let [t, s] = Array .isArray (this._title)? this._title: [this._title,''];
    TransactionHUD .show ([t, s], query, this._accounts, this._variance, this._html .offsetParent(),
      {top: this._html .position() .top + 50, left: this._html .position() .left + 50, right: 'auto'},
      () => {this._html .removeClass ('_occluded')},
      this._monthStart, this._monthend
    );
    this._html .addClass ('_occluded');
  }

  static showRefineByField (title, query, field, selectedText, accounts, variance, toHtml, position, onClose, monthStart, monthEnd) {
    var query = Object .keys (query) .reduce ((o,f) => {o[f] = query[f]; return o}, {});
    if (selectedText .length && ['payee', 'description'] .includes (field._name)) {
      var selectValue = selectedText;
      if (field._value .startsWith (selectedText)) {
        var selectType = 'starts with';
        query [field._name] = {$regex: '^' + selectedText .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '.*'};
      } else {
        var selectType = 'contains';
        query [field._name] = {$regex: '.*' + selectedText .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '.*'};
      }
    } else {
      var selectType  = 'is';
      var selectValue = field._get();
      query [field._name] = field._value;
    }
    if (['payee', 'description'] .includes (field._name))
      selectValue = '"' + selectValue + '"';
    var name = field._name .charAt (0) .toUpperCase() + field._name .slice (1);
    var [t,s] = Array .isArray (title)? title: [title,''];
    s = s + (s.length? ' and ': 'Where ') + name + ' ' + selectType + ' ' + selectValue;
    TransactionHUD .show ([t,s], query, accounts, variance, toHtml, position, onClose, monthStart, monthEnd);
  }

  static showCategory (id, dates, accounts, variance, toHtml, position, includeMonths=true, includeYears=true, addCats=[]) {
    var getFamily = (cats) => {
      var family = [];
      for (let cat of cats || []) {
        var type = categories .getType (cat);
        if ((type == ScheduleType .MONTH && includeMonths) || (type == ScheduleType .YEAR && includeYears) || type == ScheduleType .NONE)
          family .push (cat ._id);
        for (let id of getFamily ((cat .children || []) .concat (cat .zombies || [])))
          family .push (id);
        }
      return family;
    }
    var budget     = variance .getBudget();
    var categories = budget .getCategories();
    var cat        = categories .get (id);
    var qualifier = includeMonths && !includeYears? ' (Monthly) ': includeYears && !includeMonths? ' (Anytime) ': '';
    var title      = cat .name + qualifier + ' for ' + Types .dateMonthY .toString (dates .start);
    var dates      = dates || {start: budget .getStartDate(), end: budget .getEndDate()};
    var query = {
      category: {$in: getFamily ([cat]) .concat (addCats)},
      date:     dates && {$gte: dates .start, $lte: dates .end},
      $options: {updateDoesNotRemove: true}
    };
    TransactionHUD .show (title, query, accounts, variance, toHtml, position);
  }

  static showAccount (id, dates, accounts, variance, toHtml, position) {
    var title = accounts .getAccounts() .find (a => {return a._id == id}) .name +
      ' for ' + Types .dateMonthY .toString (dates .start);
    var query = {
      account:  id,
      date:     {$gte: dates .start, $lte: dates .end},
      $options: {updateDoesNotRemove: true}
    };
    TransactionHUD .show (title, query, accounts, variance, toHtml, position);
  }

  static show (title, query, accounts, variance, toHtml, position, onClose, monthStart, monthEnd) {
    var hud = new TransactionHUD (title, query, accounts, variance, onClose, monthStart, monthEnd);
    async (hud, hud .addHtml) (toHtml, position);
  }
}

class TransactionHUDDateTextbox extends ViewScalableTextbox {
  constructor (name, format, startDate, prefix='', suffix='', placeholder='') {
    super (name, format, prefix, suffix, placeholder);
    this._startDate = startDate;
  }
  get() {
    return this._format .fromView (this._get(), (m) => {
      var value = this._value;
      if (value) {
        var df = m - Types.dateDM._month (value);
        return Types.dateDM._year (value) + (Math.abs (df) < 6? 0: (df < 0? 1: -1));
      } else {
        var sy = Types .dateMY ._year  (this._startDate);
        var sm = Types .dateMY ._month (this._startDate);
        return m >= sm? sy: sy + 1;
      }
    });
  }
}

