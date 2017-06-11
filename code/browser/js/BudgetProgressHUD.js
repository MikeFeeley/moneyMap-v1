class BudgetProgressHUD {
  constructor (accounts, variance, options = {}) {
    this._accounts        = accounts;
    this._variance        = variance;
    this._view            = new BudgetProgressHUDView (! options .isNotModal, () => {this .delete()});
    this._observer        = this._variance .addObserver (this, this._onModelChange);
    this._options         = options;
    this._view .addObserver (this, this._onViewChange);
  }

  delete() {
    this._variance .deleteObserver (this._observer);
    this._view     .delete();
    this._deleteScheduleEntries();
  }

  static show (id, html, position, accounts, variance, date = Types .dateDMY .today()) {
    (new BudgetProgressHUD (accounts, variance, {})) .show (id, date, 0, 0, html, position);
  }

  _onModelChange (eventType, doc, arg, model) {
    if (this._id) {
      this._getData();
      this._updateMonth();
      this._updateYear();
      this._updateTitle();
      if (eventType == ModelEvent .INSERT || eventType == ModelEvent .REMOVE) {
        var cat = this._variance .getBudget() .getCategories() .get (this._id);
        if (((cat .children || []) .length != 0) != this._hasSubCategories)
          this._updateSubCategories (true);
      }
    }
  }

  _onViewChange (eventType, arg) {
    if (eventType == BudgetProgressHUDViewEvent .GRAPH_CLICK && (arg .name != 'monthly' || arg .month)) {
      if (!arg .month) {
        arg .month  = {
          start: Types .dateMY .monthStart (this._date),
          end:   Types .dateMY .monthEnd   (this._date)
        }
      }
      arg .position .left = Math .min (0, ($(document) .width() - 1000) - arg .html .offset() .left);
      if (arg .altClick)
        TransactionHUD .showCategory (this._id, arg .month, this._accounts, this._variance, arg .html, arg .position);
      else
        Navigate .showActualMonthGraph (this._id, arg .month, arg .html, arg .position, arg .name == '_month', arg .name == '_year');
    }
  }

  show (id, date, debit, credit, toHtml, position) {
    this._originalId = id;
    this._amount     = (debit || 0) - (credit || 0);
    this._date       = date;
    this._view .addHtml (toHtml, position);
    this._addTitle();
    this._addMonth();
    this._addYear();
    this._addSubCategories();
    this._addSchedule();
    this .update (id);
  }

  update (id) {
    if (id != this._id) {
      this._view .setVisible (id);
      this._id = id;
      this._getData();
      this._updateAll();
    }
  }
  
  hide() {
    this._id = undefined;
    this._deleteScheduleEntries();
    this._view .removeHtml();
  }

  _addTitle() {
    this._title = new BudgetProgressCategoryTitle (this._variance);
    this._view .addTitle (this._title);
  }

  _updateTitle() {
    if (this._id)
      this._title .setId (this._id);
  }

  _addMonth() {
    this._view .addGroup         ('_month');
    this._view .addText          ('_month', '_monthTitle', 'Monthly on ' + Types .dateLong .toString (this._date));
    this._view .addMonthsGraph   ('_month', this._monthsAmount);
    this._view .addProgressGraph ('_month', '_month');
  }

  _updateMonth() {
    if (this._id) {
      this._view .updateGroup ('_month', this._varianceAmount .month);
      if (this._varianceAmount .month) {
        this._view .updateMonthsGraph   (this._monthsAmount);
        this._view .updateProgressGraph ('_month', this._varianceAmount .month, this._hasAmount (this._varianceAmount .month));
      }
    }
  }

  _addYear() {
    this._view .addGroup ('_year');
    var budget = this._variance .getBudget();
    var year   = Types .dateFY .toString (this._date, budget .getStartDate(), budget .getEndDate ());
    this._view .addText  ('_year', '_yearTitle', 'Anytime in ' + year);
    this._view .addProgressGraph ('_year', '_year');
  }

  _hasAmount (a) {
    return a && Object .keys (a .amounts) .reduce ((t,k) => {return t + a .amounts[k]}, 0) != 0;
  }

  _updateYear() {
    if (this._id) {
      var hasYear = this._hasAmount (this._varianceAmount .year);
      this._view .updateGroup ('_year', hasYear);
      if (hasYear) {
        this._view .updateProgressGraph ('_year', this._varianceAmount .year);
      }
    }
  }

  _addSubCategories() {
    this._view .addGroup ('_subcategories');
  }

  _updateSubCategories (setFocus) {
    if (this._id) {
      if (this._options .noScheduleEntry)
        return;
      var cats = this._variance .getBudget() .getCategories();
      var cat  = cats .get (this._id);
      this._view .emptyGroup ('_subcategories');
      if (this._sub) {
        this._sub .delete();
        this._sub = null;
      }
      this._hasSubCategories = (cat .children || []) .length != 0;
      if (this._hasSubCategories) {
        var opt = {
          startDate:                            Types .date .monthStart (this._date),
          endDate:                              Types .date .monthEnd   (this._date),
          noInsertInside:                       true,
          noRemoveCategoryWithNonBlankSchedule: true,
          categoriesOnlyWithParent:             [this._id],
          onFieldClick:                         (id, name, html, pos) => {
            if (name != 'name' && id) {
              this .blur();
              BudgetProgressHUD .show (id, html, pos, this._accounts, this._variance)
            }
          },
          setFocus:                             setFocus
        }
        this._sub = new ScheduleEntry         ('_MiniScheduleEntry', this._accounts, this._variance, opt);
      } else
        this._sub = new BudgetProgressHUDName ((name) => {async (this, this._addSub) (name)}, setFocus);
      this._view .addText      ('_subcategories', '', 'Subcategories');
      this._view .addPresenter ('_subcategories',  this._sub);
    }
  }
  
  *_addSub (name) {
    yield* this._variance .getBudget() .getSchedulesModel() .insert ({name: name}, {id: this._id, inside: true});
    this .update (this._id);
  }

  _addSchedule () {
    this._view .addGroup ('_schedule');
  }

  _updateSchedule() {
    if (this._id) {
      if (this._options .noScheduleEntry)
        return;
      var cats = this._variance .getBudget() .getCategories();
      this._view .emptyGroup ('_schedule');
      if (this._shd) {
        this._shd .delete();
        this._shd = null;
      }
      var opt = {
        startDate:            Types .date .monthStart (this._date),
        endDate:              Types .date .monthEnd   (this._date),
        noInsertInside:       true,
        noRemoveLastSchedule: true,
        scheduleOnly:         [this._id]
      }
      this._shd = new ScheduleEntry  ('_MiniScheduleEntry', this._accounts, this._variance, opt);
      this._view .addText            ('_schedule', '', 'Allocation');
      this._view .addPresenter       ('_schedule', this._shd);
    }
  }

  _deleteScheduleEntries() {
    if (this._sub) {
      this._sub .delete();
      this._sub = null;
    }
    if (this._shd) {
      this._shd .delete();
      this._shd = null;
    }
  }

  _getData() {
    if (this._id) {
      this._varianceAmount = this._getAmount (this._id);
      this._monthsAmount   = this._variance .getAmountByMonth (this._id, this._variance .getBudget() .getEndDate(), true);
    }
  }

  _updateAll() {
    this._updateTitle();
    this._updateMonth();
    this._updateYear();
    this._updateSubCategories();
    this._updateSchedule();
  }

  contains (target) {
    return this._view .contains (target);
  }

  isShowing() {
    return this._id != null;
  }

  blur() {
    this._view .blur();
  }
  
  _getAmount (id) {
    var isZero = a => {
      var total = Object .keys (a .amounts) .reduce ((s,k) => {
        return s + (a .amounts [k] || 0)
      }, 0);
      return total == 0 || total == a .amounts .budgetlessActual;
    }
    var data       = this._variance .getAmount (id, this._date, [[this._originalId, this._date, this._amount]]);
    var isCredit   = (data .year && data .year .isCredit) || (data .month && data .month .isCredit);
    var amt        = this._amount * (isCredit? -1: 1);
    var isNegative = amt < 0;
    amt = amt * (isNegative? -1: 1);
    for (let t of ['month', 'year'])
      if ((data [t] && ! isZero (data [t])) || (t == 'month' && data .month && ! data .month .amounts .budgetlessActual)) {
        var dat = data [t] .amounts;
        data [t] .isYear = (t == 'year');
        if (isNegative) {
          var stg = [
            ['curOverActual',     'thisCreditOver'],
            ['preOverActual',     'thisCreditOver'],
            ['curBudgetedActual', 'thisCreditBudgeted'],
            ['preBudgetedActual', 'thisCreditBudgeted']
          ];
          for (let s of stg) {
            var a = Math .min (amt, dat [s [0]]);
            dat [s [0]] -= a;
            amt         -= a;
            dat [s [1]] = (dat [s [1]] || 0) + a;
          }
          if (t != 'month' || ! data .year)
            dat .thisCreditAvailable = amt;
        } else {
          var bud = Math .min (amt, dat .available);
          dat .thisBudgeted = bud;
          dat .thisOver     = amt - bud;
          dat .available    = Math.max (0, dat .available - amt);
          if (t == 'month' && data .year && data .year .available) {
            amt           = dat .thisOver;
            dat .thisOver = 0;
          }
        }
      }
    return data;
  }
}

/**
 * Phantom schedule entry to represent empty sub-cateogry list with a single name input
 */
class BudgetProgressHUDName extends Presenter {
  constructor (onChange, setFocus) {
    super (null, new BudgetProgressHUDNameView ('_MiniScheduleEntry', setFocus))
    this._onChange = onChange;
  }

  _onViewChange (eventType, arg) {
    this._onChange (arg .value);
  }

  addHtml (toHtml) {
    this._view .addHtml (toHtml);
  }
}

/**
 * Title at top of HUD
 */
class BudgetProgressCategoryTitle extends Presenter {
  constructor (variance) {
    super (
      variance .getBudget() .getSchedulesModel(),
      new BudgetProgressCategoryTitleView ('_title', [new ViewTextbox ('name', ViewFormats ('string'))])
    );
    this._modelObserver = this._model .addObserver (this, this._onModelChange);
  }

  delete() {
    this._model .deleteObserver (this._modelObserver);
  }

  setId (id) {
    this._category = this._model .getCategories() .get (id);
    this._view .getHtml() .empty();
    this._view .createFields (this._category, () => {return this._view .getHtml()});
 }

  _onModelChange (eventType, doc, arg, source) {
    if (doc._id == this._category._id && arg && arg .name)
      this._view .updateField (this._category._id, 'name', this._category .name);
  }

  addHtml (toHtml) {
    this._view .addHtml ('_title', toHtml);
  }
}
