class TransactionHUD extends TransactionAndRulesTable {
  constructor (title, query, accounts, variance, onClose, monthStart, monthEnd, context) {
    let columns      = ['date','payee','debit','credit','account','category','description'];
    let options      = {readOnly: false, noGrouping: true};
    super (query, null, undefined, '', undefined, undefined, options);
    this._accounts    = accounts;
    this._variance    = variance;
    this._title       = [] .concat (title);
    this._titleLength = this._title[0] .split(' ') .length;
    this._onClose     = onClose;
    this._monthStart  = monthStart || (query .date && query .date .$gte);
    this._monthEnd    = Types .date .monthEnd (this._monthStart);
    this._context     = context;
  }

  delete() {
    super.delete ();
    if (this._html) {
      this._html .remove();
      this._html = null;
    }
    ui .ModalStack .delete (this._modalStackEntry);
    if (this._onClose)
      this._onClose();
  }

  _onViewChange (eventType, arg) {
    if (eventType == ViewEvent .UPDATE && ! arg .id && this._recategorizeUpdate)
      this._recategorizeUpdate();
    else
      super._onViewChange (eventType, arg);
  }

  async refreshHtml() {
    await super .refreshHtml();
    ui .scrollIntoView (this._html);
  }

  async _getModelData() {
    var trans = await super._getModelData();
    this._tdebit  = trans .reduce ((s,t) => {s += t .debit  || 0; return s}, 0);
    this._tcredit = trans .reduce ((s,t) => {s += t .credit || 0; return s}, 0);
    return trans;
  }

  async _toggleEdit() {
    var button = this._content .find ('._editButton');
    if (button .hasClass ('lnr-pencil')) {
      button .removeClass ('lnr-pencil') .addClass ('lnr-eye');
      this._content .removeClass ('_TransactionReadOnly');
      this._view._options .readOnly = false;
      (this._query .$options = this._query .$options || {}) .groupBy = 'group';
      this .refreshHtml();
    } else {
      button .removeClass ('lnr-eye') .addClass ('lnr-pencil');
      this._view._clearSelectedTuple();
      this._content .addClass ('_TransactionReadOnly');
      this._view._options .readOnly = true;
      delete this._query .$options .groupBy;
      this .refreshHtml();
    }
  }

  _showRecatorize() {
    let cats   = this._variance .getBudget() .getCategories();
    let format = new ViewFormatOptions (
      value => {let cat = cats .get (value); return cat? cat.name: value},
      view  => {return view},
      value => {return cats .getPathname (cats .get (value)) .join (' > ')},
      ()    => {return cats}
    );
    let edit = new ViewCategoryEdit ('category', format, '', '', 'Category',
      () => {return Types .date .today()},
      () => {return 0},
      () => {return 0},
      () => {return this._monthEnd < this._variance .getBudget() .getStartDate()}
    );
    let dialogue = $('<div>', {class: '_recategorizeDialogue'})
      .appendTo (this._content)
      .css      (ui .calcPosition (this._content .find ('._recategorizeButton'), this._content, {top: -16, left: -250}))
      .append   ($('<div>') .append ($('<div>',   {text: 'New Category:'})));
    let field = edit .addHtml ('', this._view, dialogue .children());
    field .on ('mouseup webkitmouseforceup', e => {
      if (e .target == field .find ('input') [0])
        return false
    });
    field .find (':input') .focus();
    let confirm = $('<button>', {text: 'Change All', class: '_changeAllButton _disabled', prop: {disabled: true}, click: e => {
      let cat = field .data ('field') .get();
      let ul = Array .from (this._view._tuples .keys())
        .filter (id => {return id})
        .map    (id => {return {id: id, update: {category: cat}}});
      (async () => {await this._model .updateList (ul)})();
      dialogue .remove();
      (async () => {await ui .ModalStack .delete (modalEntry)})();
      e .stopPropagation();
      return false;
    }}) .appendTo (dialogue .children());
    this._recategorizeUpdate = () => {
      let isDisabled = field .data ('field') .get() == '';
      confirm [(isDisabled? 'add': 'remove') + 'Class'] ('_disabled');
      confirm .prop ({disabled: isDisabled})
    };
    let modalEntry = ui .ModalStack .add (
      e => {
        return e && ! $.contains (dialogue [0], e .target) && dialogue [0] != e .target
      },
      () => {dialogue .remove(); this._recategorizeUpdate = null}, true
    );
  }

  _setTitleDate() {
    let budget = this._variance .getBudget();
    let [title, subtitle]  = this._title .map (t => {return t .split (' ')});
    title .length = this._titleLength;
    if (subtitle) {
      let pos = subtitle .findIndex (w => {return w == 'Date'});
      if (pos != -1)
        subtitle .splice (pos - 1, subtitle [pos + 2] == 'between'? 7: 4);
    }
    let st = this._query .date .$gte || (this._query .date .$gt && Types .date .addDay (this._query .date .$gt,  1));
    let en = this._query .date .$lte || (this._query .date .$lt && Types .date .addDay (this._query .date .$lt, -1));
    let dsc = [];
    let bst = budget .getStartDate(), ben = budget .getEndDate();
    if (st && ! en)
      dsc = ('Starting ' + Types .dateMonthY .toString (st)) .split (' ');
    else if (!st && en)
      dsc = ('Ending ' + Types .dateMonthY .toString (en)) .split (' ');
    else if (Types .date ._difMonths (en, st) == 1) {
      dsc = Types .dateMonthY .toString (st) .split (' ');
      if (st != Types .date .monthStart (st) || en != Types .date .monthEnd (en))
        if (st == en)
          dsc .splice (1, 0, Types .date._day (st) + ', ')
        else
          dsc .splice (1, 0, Types .date._day (st) + '-' + Types .date._day (en) + ',');
    } else if (st == Types .dateFY .getFYStart (st, bst, ben) && en == Types .dateFY .getFYEnd (en, bst, ben))
      dsc = ('Year ' + Types .dateFY .toString (st, bst, ben)) .split (' ');
    else if (Types .date._year (st) == Types .date._year(en) && Types .date._month (st) == 1 && Types .date._month (en) == 12)
      dsc = ('Year ' + Types .date._year (st)) .split (' ');
    else if (Types .date._year (st) == Types .date._year (en))
      dsc = (Types .dateMY .toString (st) .split ('-') [0] + ' ' + Types .date._day (st) + ' - ' +
             Types .dateMY .toString (en) .split ('-') [0] + ' ' + Types .date._day (en) + ', ' + Types .date._year (st)) .split (' ')
    else
      dsc = (Types .dateMY .toString (st) .split ('-') [0] + ' ' + Types .date._day (st) +  ', ' + Types .date._year (st) + ' - ' +
        Types .dateMY .toString (en) .split ('-') [0] + ' ' + Types .date._day (en) + ', ' + Types .date._year (en)) .split (' ')
    title = (title .join (' ') + (! dsc .includes ('Starting') && ! dsc .includes ('Ending')? ' for ': ' ') + dsc .join (' ')) .split (' ');
    this._title = [title, subtitle]    .map  (t => {return (t && t .join (' ')) || ''})
    this._content .find ('._title')    .text (this._title [0]);
    this._content .find ('._subtitle') .text (this._title [1])
  }

  _changeMonth (delta) {
    if (delta == 1 || delta == -1)
      delta *= Types .date._difMonths (this._query .date .$lte, this._query .date .$gte);
    this._query .date .$gte = Types .date .addMonthStart (this._query .date .$gte, delta);
    this._query .date .$lte = Types .date .monthEnd (Types .date .addMonthStart (this._query .date .$lte, delta));
    this._setTitleDate();
    (async () => {await this .refreshHtml()}) ();
  }

  _toggleMonthYear() {
    let budget = this._variance .getBudget();
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
    (async () => {await this .refreshHtml()}) ();
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
    (async () => {await this .refreshHtml()}) ();
  }

  _addFooter() {
    const total = this._tdebit - this._tcredit;
    this._view .addFooterRow (Object .assign(this._view._options .readOnly? {}: {nop0: ''}, {
      nop1:    '',
      nop2:    '',
      tdebit:  total >= 0? Types .moneyDCZ .toString (total): 'net -->',
      tcredit: total < 0?  Types .moneyDCZ .toString (-total): '<-- net',
      nop3:    '',
      nop4:    '',
      nop5:    ''
    }));
    if (total >= 0)
      $(this._view._tfoot .find ('td') [this._view._options .readOnly? 3: 4]) .addClass ('_leftArrow');
    else
      $(this._view._tfoot .find ('td') [this._view._options .readOnly? 2: 3]) .addClass ('_rightArrow');
  }

  async _addModelData() {
    await super._addModelData();
    this._addFooter();
  }

  async addHtml (toHtml, position) {
    let ml = 500;
    let po = toHtml .offset() .left;
    if (po + position .left > ml)
      position .left = ml - po;
    this._html = $('<div>', {class: '_TransactionHUD fader'}) .appendTo (toHtml);
    this._html [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
    this._content = $('<div>', {class: '_hudcontent _TransactionReadOnly'}) .appendTo (this._html);
    let mousedownFired, mousedownTarget, mousedownPageY;
    this._content .on ('mousedown webkitmouseforcedown', e => {mousedownFired = true; mousedownTarget = $(e .target); mousedownPageY = e .pageY})
    this._content .on ('mouseup webkitmouseforceup', e => {
      if (this._view._options .readOnly && mousedownFired) {
        mousedownFired = false;
        let target = mousedownTarget || $(e .target);
        let pageY  = mousedownPageY || e .pageY;
        let field  = target .hasClass ('_content') && target .parent() .parent ('._field') .data ('field');
        if (field) {
          if ((e .originalEvent .webkitForce > 1 || e .originalEvent .altKey) && field._name == 'category') {
            let date     = target .closest ('tr') .find ('._field_date') .data ('field')._value;
            let html     = target .offsetParent();
            let position = ui .calcPosition (target, html, {top: 20, left: -470});
            BudgetProgressHUD .show (field._value, html, position, this._accounts, this._variance, date);
          } else {
            let selectedText;
            if (field._name == 'date') {
              let endField = $(e.target) .closest ('tr') .find ('._field_date');
              selectedText = endField .data ('field');
            } else
              selectedText =  window .getSelection() .toString() .split ('\n') [0];
            window .getSelection() .empty();
            let position = this._html .position();
            let html     = this._html .offsetParent();
            if (html .closest ('body') .length == 0)
              html = $('body');
            this._title[0] = this._title[0] .split (' ') .slice (0, this._titleLength) .join (' ');
            TransactionHUD .showRefineByField (
              this._title, JSON .parse (JSON .stringify (this._query)), field, selectedText, this._accounts, this._variance, html,
              {top: position .top + 50, left: position .left + 50, right: 'auto'},
              () => {if (this._html) this._html .removeClass ('_occluded')},
              this._monthStart, this._monthEnd, this._context
            );
            this._html .addClass ('_occluded');
          }
          return false;
        }
      }
    });
    if (position)
      this._html .css ({top: position .top, right: position .right, left: position .left});
    $('<div>', {class: '_title', text: this._title [0]}) .appendTo (this._content)
    var buttons = $('<div>', {class: '_buttons'}) .appendTo (this._content);
    $('<button>', {text: 'Recategorize', class: '_recategorizeButton'}) .appendTo (buttons) .click (e => {
      this._showRecatorize();
      e .stopPropagation();
      return false;
    })
    $('<div>', {class:'_editButton lnr-pencil'}) .appendTo (buttons) .click (e => {
      this._toggleEdit();
      e .stopPropagation();
      return false;
    })
    $('<div>', {class: '_calendarButton lnr-calendar-full'}) .appendTo (buttons)
      .on ('click',                e => {this._toggleMonthYear()})
      .on ('webkitmouseforcedown', e => {this._calendarYear()})
    if (this._context && this._context .cat) {
      let cat = this._context .cat;
      if (cat .budgets .includes (this._variance .getBudget() .getId()))
        $('<div>', {class:'_nextButton lnr-map'}) .appendTo (buttons) .click (e => {
          let date = this._query .date && this._query .date .$lte;
          BudgetProgressHUD .show (cat._id, this._html, {top: 60, left: 30}, this._accounts, this._variance, date);
          e .stopPropagation();
          return false;
        });
      if (cat .parent)
        $('<div>', {class:'_nextButton lnr-exit-up'}) .appendTo (buttons) .click (e => {
          let dates = this._query .date && {
            start: this._query .date .$gte,
            end:   this._query .date .$lte
          }
          TransactionHUD .showCategory (
            cat .parent._id, dates, this._accounts, this._variance, this._html, {top: 60, left: 30},
            this._context .includeMonths, this._context .includeYears, this._context .addCats
          );
          e .stopPropagation();
          return false;
        });
    }
    if (this._query .date && this._query .date .$gte && this._query .date .$lte) {
      $('<div>', {class:'_prevButton lnr-chevron-left'}) .appendTo (buttons) .click (e => {
        this._changeMonth (-1);
        e .stopPropagation();
        return false;
      });
      $('<div>', {class:'_nextButton lnr-chevron-right'}) .appendTo (buttons) .click (e => {
        this._changeMonth (1);
        e .stopPropagation();
        return false;
      });
    }
    var body = $('<div>', {class: '_body'}) .appendTo (this._content);
    if (this._title [1])
      $('<div>', {text: this._title [1], class: '_subtitle'}) .appendTo (body);
    this._view._options .readOnly = true;
    if (this._query .date)
      this._setTitleDate();
    await super .addHtml (body);
    this._modalStackEntry = ui .ModalStack .add (
      (e) => {return ! $.contains (this._content .get (0), e .target) && this._content .get (0) != e .target},
      ()  => {this._html .removeClass ('fader_visible') .one ('transitionend', () => {this .delete()})}, true
    );
    this._html .data ('modal', this._modalStackEntry);
    ui .scrollIntoView (this._html);
    setTimeout (() => {this._html .addClass ('fader_visible')}, 0);
  }

  _showRefineByDateRange (start, end) {
    let query = JSON .parse (JSON .stringify (this._query));
    query .date .$gte = start;
    query .date .$lte = end;
    TransactionHUD .show (this._title, query, this._accounts, this._variance, this._html .offsetParent(),
      {top: this._html .position() .top + 50, left: this._html .position() .left + 50, right: 'auto'},
      () => {this._html .removeClass ('_occluded')},
      this._monthStart, this._monthend
    );
    this._html .addClass ('_occluded');
  }

  static showRefineByField (title, query, field, selectedText, accounts, variance, toHtml, position, onClose, monthStart, monthEnd, context) {
    query = Object .assign ({}, query);
    let desc = '';
    if (field._name == 'date') {
      if (selectedText && selectedText != field) {
        let otherField = selectedText;
        let startField, endField;
        if (field._value < otherField._value) {
          startField = field;
          endField   = otherField;
        } else {
          startField = otherField;
          endField   = field;
        }
        query .date = {$gte: startField._value, $lte: endField._value};
      } else
        query .date = {$gte: field._value, $lte: field._value};
    } else if (selectedText .length && ['payee', 'description'] .includes (field._name)) {
      let selectValue = selectedText, selectType;
      if (field._value .startsWith (selectedText)) {
        selectType = 'starts with';
        query [field._name] = {$regex: '^' + selectedText .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '.*'};
      } else {
        selectType = 'contains';
        query [field._name] = {$regex: '.*' + selectedText .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '.*'};
      }
      desc = ' ' + selectType + ' "' + selectValue + '"';
    } else {
      let value = field._value;
      if (field._name == 'category') {
        let c = variance .getBudget() .getCategories() .get (value);
        let p = c .parent || {};
        let h = (p .children || []) .concat (p .zombies || []) .filter (s => {return s .name == c .name}) .map (s => {return s._id});
        if (h .length > 1)
          value = {$in: h}
      }
      query [field._name] = value;
      desc                = 'is ' + field._get();
    }
    let name = field._name .charAt (0) .toUpperCase() + field._name .slice (1);
    let [t,s] = Array .isArray (title)? title .concat(['','']): [title,''];
    if (desc .length)
      s = s + (s.length? ' and ' + (! s .toLowerCase() .includes ('where')? ' where ': ''): 'Where ') + name + ' ' + desc;
    if (field._name == 'category') {
      context = Object .assign ({}, context || {});
      context .cat = variance .getBudget() .getCategories() .get (field._value);
    }
    TransactionHUD .show ([t,s], query, accounts, variance, toHtml, position, onClose, monthStart, monthEnd, context);
  }

  static showCategory (id, dates, accounts, variance, toHtml, position, includeMonths=true, includeYears=true, addCats=[]) {
    const budget      = variance .getBudget();
    const categories  = budget .getCategories();
    const ids         = id .split ('_');
    const selectPayee = id .includes ('payee_') && id .split ('_') .slice (-2) [0];
    const isOther     = id .includes ('other_');
    const isCurrent   = dates .end >= budget .getStartDate();
    id = ids .slice (-1) [0];
    const getFamily = (cats) => {
      const family = [];
      for (const cat of cats || []) {
        const type = categories .getType (cat, undefined, undefined, true);
        if ((includeMonths && type .includes (ScheduleType .MONTH)) || (includeYears && type .includes (ScheduleType .YEAR)) || type .includes (ScheduleType .NONE))
          family .push (cat ._id);
        for (const id of getFamily ((cat .children || []) .concat (cat .zombies || [])))
          if (! isOther || (isCurrent && ! categories .hasType (categories .get (id), ScheduleType .NOT_NONE)))
            family .push (id);
      }
      return family;
    }
    const cat        = categories .get (id) || {};
    const qualifier  = includeMonths && !includeYears? ' (Monthly)': includeYears && !includeMonths? ' (Anytime)': '';
    dates = dates || {start: budget .getStartDate(), end: budget .getEndDate()};
    const title      = [(isOther? 'Other ': '') + cat .name + qualifier, ''];
    if (selectPayee)
      title [1] = 'Where Payee starts with "' + selectPayee + '"';
    const p = cat .parent || {children: [cat]};
    const cats = (p .children || []) .concat (p .zombies || [])
      .filter (s => {return s .name == cat .name})
      .map    (s => {return getFamily ([s])})
      .reduce ((l,i) => {return l .concat (i)}, [])
    const query = {
      category: {$in: cats .concat (addCats)},
      date:     dates && {$gte: dates .start, $lte: dates .end},
      $options: {updateDoesNotRemove: true}
    };
    if (selectPayee)
      query .payee = {$regex: '^' + selectPayee .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '.*'};
    TransactionHUD .show (
      title, query, accounts, variance, toHtml, position, undefined, undefined, undefined,
      {cat: cat, includeMonths: includeMonths, includeYears: includeYears, addCats: addCats}
    );
  }

  static showAccount (id, dates, accounts, variance, toHtml, position) {
    var title = [accounts .getAccounts() .find (a => {return a._id == id}) .name, ""]
    var query = {
      account:  id,
      date:     {$gte: dates .start, $lte: dates .end},
      $options: {updateDoesNotRemove: true}
    };
    TransactionHUD .show (title, query, accounts, variance, toHtml, position);
  }

  static show (title, query, accounts, variance, toHtml, position, onClose, monthStart, monthEnd, context) {
    let hud = new TransactionHUD (title, query, accounts, variance, onClose, monthStart, monthEnd, context);
    (async () => {await hud .addHtml (toHtml, position)}) ();
  }

  static async _search (text, accounts, variance, toHtml, position) {
    let family = cats => {
      if (cats .length) {
        return cats .reduce ((list, cat) => {
          let ch = (cat .children || []) .concat (cat .zombies || []);
          return list .concat (cat) .concat (family (ch))
        }, [])
      } else
        return []
    }
    let matchingCats = term => {
      return family (variance .getBudget() .getCategories()
        .findAll (c => c .name && String (c .name) .toLowerCase() .includes (term), true))
        .map     (c => c._id);
    }
    let query = {$limit: 100, $sort: {date: -1}};
    if (text && text .length) {
      let inQuote = false;
      let terms = text .toLowerCase() .split ('"') .reduce ((list, str) => {
        if (! inQuote) {
          let tokens = str .split (' ');

          let gobbleDate = (i, gobbleAnd) => {
            let thisLast, date = {};
            for (let j = i; j < tokens .length; j++) {
              if (tokens [j]) {
                if (! thisLast && ['last', 'this'] .includes (tokens [j])) {
                  thisLast = tokens[j];
                } else if (thisLast && ['year', 'budget', 'budget year', 'month'] .includes (tokens [j])) {
                  switch (tokens [j]) {
                    case 'year':
                      date .start = Types .date .addYear (Types .date .getYearStart (Types .date .today()), thisLast == 'last'? -1: 0);
                      date .end   = Types .date .getYearEnd (date .start);
                      break;
                    case 'budget':
                      const BUDGET_START = variance .getBudget() .getStartDate();
                      const BUDGET_END   = variance .getBudget() .getEndDate();
                      date .start = Types .date .addYear (Types .dateFY .getFYStart (Types .date .today(), BUDGET_START, BUDGET_END), thisLast == 'last'? -1: 0);
                      date .end   = Types .dateFY .getFYEnd (date .start, BUDGET_START, BUDGET_END);
                      if (j+1 < tokens .length && tokens [j+1] == 'year')
                        j += 1;
                      break;
                    case 'month':
                      date .start = Types .date .addMonthStart (Types .date .today(), thisLast == 'last'? -1: 0);
                      date .end   = Types .date .monthEnd      (date .start);
                      break;
                  }
                  for (let k = i; k <=j; k++)
                    tokens [k] = '';
                  return date;
                } else if (gobbleAnd && ['and', '&'] .includes (tokens [j])) {
                  tokens [j] = '';
                  gobbleAnd = false;
                } else {
                  if (! isNaN (tokens [j])) {
                    let date = {start: Types .date._date (tokens [j], 1, 1), end: Types .date._date (tokens [j], 12, 31)};
                    tokens [j] = '';
                    return date;
                  } else {
                    let m0 = Types .date._mthsLC .indexOf (tokens [j]);
                    let m1 = m0 == -1 && Types .date._monthsLC .indexOf (tokens [j]);
                    if (m0 != -1 || m1 != -1) {
                      tokens [j] = '';
                      let yr = Types .date._year (Types .date .today()) + (thisLast == 'last'? -1: 0);
                      if (j+1 < tokens .length && ! isNaN (tokens [j+1])) {
                        yr = Number (tokens [j+1]);
                        tokens [j+1] = '';
                      }
                      let date = {start: Types .date._date (yr, m0 != -1? m0 + 1: m1 + 1, 1)};
                      date .end = Types .date .monthEnd (date .start);
                      return date;
                    }
                    return undefined;
                  }
                }
              }
            }
          }

          for (let i = 0; i < tokens .length; i++) {
            if (tokens [i]) {
              if (['this', 'last', 'in', 'before', 'after', 'since', 'starting', 'ending', 'until', 'from', 'to', 'between'] .includes (tokens [i])) {
                let tok = tokens [i];
                let dt  = gobbleDate (['this', 'last'] .includes (tokens [i])? i: i+1);
                if (dt) {
                  tokens [i] = '';
                  switch (tok) {
                    case 'in': case 'this': case 'last':
                      query .date = {$gte: dt .start, $lte: dt .end};
                      break;
                    case 'before':
                      query .date = {$lt: dt .start};
                      break;
                    case 'from': case 'since': case 'starting':
                      query .date = {$gte: dt .start};
                      break;
                    case 'after':
                      query .date = {$gt: dt .end};
                      break;
                    case 'to': case 'until': case 'ending':
                      query .date = {$lte: dt .end};
                      break;
                    case 'between':
                      let dt2 = gobbleDate (i, true);
                      query .date = {$gte: dt .start};
                      if (dt2)
                        query .date .$lte = dt2 .end;
                      break;
                  }
                }
              }
            }
          }
          str = tokens .filter (t => {return t}) .join (' ');
        }
        inQuote = ! inQuote;
        return list .concat (str);
      }, []) .filter (t => {return t});

      if (terms .length) {
        if (! query .date)
          query .date = {$gte: variance .getBudget() .getStartDate(), $lte: variance .getBudget() .getEndDate()}
        query .$and = terms .map (term => {
          let regex = '.*' + term .replace (/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '.*';
          let cids  = matchingCats (term);
          return {$or: (cids .length? [{category: {$in: cids}}]: []) .concat (['payee', 'description'] .map (field => {
            return {[field]: {$regexi: regex}}
          }))}
        });
        let desc = terms .map (t => {return t .includes (' ')? "'" + t + "'": t}) .join (' ');
        let title = ['Search Results', 'Top Matches for "' + desc + '"'];
        TransactionHUD .show (title, query, accounts, variance, toHtml, position);
      }
    }
  }

  static search (text, accounts, variance, toHtml, position) {
    (async () => {await TransactionHUD._search (text, accounts, variance, toHtml, position)})();
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

