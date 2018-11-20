class BudgetProgressHUD {
  constructor (accounts, variance, options = {}, categoryPicker) {
    this._accounts        = accounts;
    this._variance        = variance;
    this._view            = new BudgetProgressHUDView (! options .isNotModal, () => {this .delete()}, options .topBuffer, this._variance .getBudget() .getEndDate());
    this._observer        = this._variance .addObserver (this, this._onModelChange);
    this._options         = options;
    this._categoryPicker  = categoryPicker;
    this._view .addObserver (this, this._onViewChange);
    this._categories      = this._variance .getBudget() .getCategories();
  }

  delete() {
    this._variance .deleteObserver (this._observer);
    this._view     .delete();
    this._deleteScheduleEntries();
  }

  static show (id, html, position, accounts, variance, date = Types .dateDMY .today(), expanded) {
    (new BudgetProgressHUD (accounts, variance, {})) .show (id, date, 0, 0, html, position, expanded);
  }

  _onModelChange (eventType, doc, arg, model) {
    this._cat = this._id && this._categories .get (this._id);
    if (this._cat) {
      if (! this._expanded) {
        this._getData();
        this._updateCompare();
        this._updateMonth();
        this._updateYear();
        this._updateTitle();
        if (eventType == ModelEvent .INSERT || eventType == ModelEvent .REMOVE) {
          if (((this._cat .children || []) .length != 0) != this._hasSubCategories)
            this._updateSubCategories (true);
        }
        if (this._categoryPicker) {
          if (eventType == ModelEvent .INSERT && doc .parent && doc .parent._id == this._id)
            this._categoryPicker. pick (doc._id);
          else if (eventType == ModelEvent .REMOVE && doc .parent  == this._id)
            this._categoryPicker .pick (doc .parent);
          }
      } else {
        this._getExpandedData();
        this._updateTitle();
        this._updateCompare();
        this._view .updateMonthsGraph (this._monthsAmount);
        this._view .updateDoughnut ('_budget', this._budget);
        this._updateProgress();
      }
    }
  }

  async _onViewChange (eventType, arg) {
    if (arg .altPosition)
      arg .position = arg .altPosition;
    const budget = this._variance .getBudget();
    const bs     = budget .getStartDate();
    const be     = budget .getEndDate();
    const date   = arg .lastYear? Types .date .addYear (this._date, -1): this._date;
    const dates  = {start: Types .dateFY .getFYStart (date, bs, be), end: Types .dateFY .getFYEnd (date, bs, be)};

    if (eventType == BudgetProgressHUDViewEvent .GRAPH_CLICK && (arg .name != 'monthly' || arg .month || arg .name == 'all')) {
      if (arg .altClick) {
        if (arg .name == 'all') {
          let budget = this._variance .getBudget();
        }
        if (arg .id || this._id)
          TransactionHUD .showCategory (arg .id || this._id, arg .month || dates, this._accounts, this._variance, arg .html, arg .position);
      } else {
        let isMonth = arg .name == 'months' || arg .name == '_month' || arg .name == '_monthly';
        let isAll   = arg .name == 'all';
        if (arg .id || this._id) {
          if (dates .end < bs)
            await Navigate .showActualMonthGraph (arg .id || this._id, dates, arg .html, arg .position, isMonth || isAll, ! isMonth || isAll);
          else
            await Navigate .showBudgetMonthGraph (this._id, dates, arg .html, arg .position);
        }
      }
    } else if (eventType == BudgetProgressHUDViewEvent .BODY_CLICK) {
      if (arg .altClick) {
        let parent = this._cat .parent;
        if (parent)
          BudgetProgressHUD .show (parent._id, arg .html, arg .position, this._accounts, this._variance, this._date);
      } else {
        await Navigate .showBudgetMonthGraph (this._id, dates, arg .html, arg .position);
      }

    } else if (eventType == BudgetProgressHUDViewEvent .SHOW_NORMAL)
      this._setNormal();
    else if (eventType == BudgetProgressHUDViewEvent .SHOW_EXPANDED)
      this._setExpanded();
    else if (eventType == BudgetProgressHUDViewEvent .PIN) {
      if (this._id)
        PinnedCategories .getInstance() .add (this._id, this._date != Types .date .today() && this._date);
    } else if (eventType == BudgetProgressHUDViewEvent.DOUGHNUT_CLICK) {
      if (arg.id != this._id)
        BudgetProgressHUD.show (arg.id, arg.html, arg.position, this._accounts, this._variance, this._date, true)
    } else if (eventType == BudgetProgressHUDViewEvent.PATH_CLICK)
      BudgetProgressHUD .show (arg .id, arg .html, arg .position, this._accounts, this._variance, this._date, true)
  }

  _setNormal() {
    if (this._view .setExpanded (false)) {
      this._expanded = false;
      this._id = null;
      this._addTitle();
      if (this._date != Types.date.today ())
        this._view.addText ('', '_date', 'As of ' + (this._date == Types.date.today () ? 'Today' : Types.dateLong.toString (this._date)));
      this._addCompare();
      this._addMonth();
      this._addYear();
      this._addSchedule();
      this._addSubCategories();
      this .update (this._originalId);
    }
  }

  _setExpanded() {
    if (this._view .setExpanded (true)) {
      this._expanded = true;
      if (! this._originalId)
        this._originalId = this._id;
      this._id = this._originalId;
      this._cat = this._id && this._categories .get (this._id);
      this._getExpandedData();
      this._addTitle ('Budget ' + this._budgetDescription);

      this._view .addGroup ('_graphLine0');
      this._view .addGroup ('_graphContainer0', '_graphLine0')
      this._view .addCompareGraph ('_graphContainer0');

      this._view .addGroup ('_graphLine1');
      this._view.addText ('', '_date', this._date == Types.date.today () ? '' : 'As of ' + Types.dateLong.toString (this._date));
      this._view.addMonthsGraph ('_graphLine1', this._monthsAmount, {width: 500, height: 80}, false);

      this._view .addGroup ('_graphs');
      this._view .addGroup ('_progress', '_graphs');
      this._view .addGroup ('_budget',   '_graphs');
      this._view .addDoughnut ('_budget');
      this._addProgress();
      this._addSchedule();
      this._id = null;
      this._updateExpanded (this._originalId, true);
    }
  }

  _getExpandedData() {
    const budget     = this._variance .getBudget();
    const actuals    = this._variance .getActuals();
    const children   = (this._cat .children || []);
    const sign       = budget .isCredit (this._cat)? -1: 1;
    const bs         = budget.getStartDate ();
    const be         = budget.getEndDate ();
    const st         = Types.dateFY.getFYStart (this._date, bs, be);
    const en         = Types.dateFY.getFYEnd (this._date, bs, be);

    this._budgetTotal = budget .getAmount (this._cat, st, en) .amount * sign;

    this._budgetDescription = st == bs ? 'this Year' : budget.getLabel ({start: st, end: en});
    const va = [this._cat] .concat (children)
      .map (c => {
        const b = budget .getAmount (c, st, en) .amount * sign;
        const a = actuals .getAmountRecursively (c, st, en) * sign;
        return {
          _id:       c._id,
          name:      c .name,
          available: Math .max (0, b - a),
          actual:    a
        }
      })
      .filter (item => item .available || item .actual)
    if (va .length > 1) {
      const ca = va .slice (1) .reduce ((t, i) => ({available: (t .available || 0) + i .available, actual: (t .actual || 0) + i .actual}), {});
      va [0] .available = Math .max (0, va [0] .available - ca .available);
      va [0] .actual    = Math .max (0, va [0] .actual    - ca .actual);
      va [0] .name = 'Other';
    }
    const rootName = this._categories .getPath (this._cat) [0] .name;
    this._budget = va
      .filter (item => item .actual > 0 || item .available > 0)
      .map (item => [
        {id: item._id, name: item .name + ' ' + rootName,  amount: Math .max (0, item .actual)},
        {id: item._id, name: item .name + ' Available',    amount: Math .max (0, item .available)}
      ]);

    this._varianceAmounts = [this._id] .concat (children .map (child => child._id))
      .map    (cid => this._getAmount (cid, true))
      .filter (item =>
        (item._id == this._id || this._categories .hasType (this._categories .get (item._id), ScheduleType .NOT_NONE)) &&
        (this._hasAmount (item .month) || this._hasAmount (item .year)));
    for (const per of ['month', 'year']) {
      const list = this._varianceAmounts .map (item => item [per]) .filter (item => item);
      if (list .length == 2) {
        if (! Object .keys (list [0] .amounts) .find (p => list [0] [p] != list [1] [p]))
          list [0].deleteThis = true;
      }
    }
    for (const item of this._varianceAmounts)
      for (const per of ['month', 'year'])
        if (item [per] && item [per] .deleteThis)
          delete item [per];
    this._varianceAmounts = this._varianceAmounts .filter (item => item .month || item .year);
    if (this._varianceAmounts .length > 1)
      for (const per of ['month', 'year'])
        if (this._varianceAmounts [0] [per])
          this._varianceAmounts [0] [per] .name = 'All ' + this._varianceAmounts [0] [per] .name;
    this._monthsAmount = this._variance .getAmountByMonth (this._id, en, true);
    this._varianceAmount = this._getAmount (this._id);
    this._getCompareAmount();
  }

  _updateProgress() {
    const months = this._varianceAmounts
      .map    (item => item .month)
      .filter (item => item && this._hasAmount (item));
    const years = this._varianceAmounts
      .map    (item => item .year)
      .filter (item => item && this._hasAmount (item));
    const rebuildMonths = this._prevMonthsLength !== undefined && this._prevMonthsLength != months .length;
    const rebuildYears  = this._prevYearsLength  !== undefined && this._prevYearsLength  != years .length;
    if (rebuildMonths || rebuildYears) {
      this._view .emptyGroup ('_progress');
      this._addProgress();
    }
    this._prevMonthsLength = months .length || 0;
    this._prevYearsLength  = years  .length || 0;
    this._view .setTextVisibility ('_progress', '_thisMonth', !! months .length);
    this._view .updateProgressGraph ('_monthly', months, !! months .length);
    this._view .setTextVisibility ('_progress', '_thisYear', !! years .length);
    this._view .updateProgressGraph ('_yearly', years, !! years .length);
}

  _updateExpanded (id, skipGetData) {
    this._id = id;
    this._cat = this._id && this._categories .get (this._id);
    if (skipGetData)
      this._getExpandedData();
    this._updateTitle();
    this._view .updateMonthsGraph (this._monthsAmount);
    this._updateCompare({width: 300, height: 44});
    this._view .updateDoughnut ('_budget', this._budget);
    this._updateProgress();
    this._updateScheduleEntry();
    this._view .setVisible (!! this._cat);
  }

  show (id, date, debit, credit, toHtml, position, expanded, showProgress) {
    this._originalId = id;
    this._amount     = (debit || 0) - (credit || 0);
    this._date = date || Types.date.today ();
    this._showProgress = showProgress || Types .date._yearMonth (this._date) == Types .date._yearMonth (Types .date .today());
    this._view .addHtml (toHtml, position);
    if (! expanded)
      this._setNormal();
    else
      this._setExpanded();
  }

  update (id) {
    if (id == null || id != this._id) {
      this._id = id;
      this._cat = this._id && this._categories .get (this._id);
      this._getData();
      if (this._options .noScheduleEntry) {
        const noVariance = this._varianceAmount && ! this._varianceAmount .month && ! this._varianceAmount .year;
        const noMonths   = this._monthsAmount   && ! ['actual', 'budget', 'priorYear'] .find (p => this._monthsAmount [p] .find (a => a != 0));
        const noCompare  = this._compareAmount  && ! [... Object .values (this._compareAmount)] .find (v => v != 0);
        if (noVariance && noMonths && noCompare) {
          this .hide();
          return;
        }
      }
      this._view .setVisible (!! this._cat);
      this._updateAll();
     }
  }
  
  hide() {
    this._id = undefined;
    this._cat = undefined;
    this._deleteScheduleEntries();
    this._view .removeHtml();
  }

  _addTitle (subtitle) {
    this._title = new BudgetProgressCategoryTitle (this._variance, this._view, this._accounts, this._categories);
    this._view.addTitle (this._title, subtitle);
  }

  _updateTitle() {
    if (this._cat && this._title) {
      if (! this._expanded) {
        this._title .setId (this._id);
        this._view .setTitleHasNoParent (this._cat .parent == null);
      } else {
        this._view .updateTitle (this._cat .name);
        this._view .updateBudgetTotal (this._budgetTotal);
      }
    }
  }

  _addMonth() {
    this._view.addGroup ('_month');
    this._view.addMonthsGraph ('_month', this._monthsAmount);
    if (this._showProgress) {
      this._view.addText ('_month', '_monthTitle', 'This Month');
      this._view.addProgressGraph ('_month', '_month');
    }
  }

  _addYear () {
    if (this._showProgress) {
      this._view.addGroup ('_year');
      var budget = this._variance.getBudget ();
      var year = Types.dateFY.toString (this._date, budget.getStartDate (), budget.getEndDate ());
      this._view.addText ('_year', '_yearTitle', 'This Year');
      this._view.addProgressGraph ('_year', '_year');
    }
  }

  _addProgress () {
    if (this._showProgress) {
      const options = {barThickness: 24, barPercentage: .85};
      this._view.addText ('_progress', '_thisMonth', 'This Month', false);
      this._view.addProgressGraph ('_progress', '_monthly', false, options);
      this._view.addText ('_progress', '_thisYear', 'This Year (at any time)', false);
      this._view.addProgressGraph ('_progress', '_yearly', false, options);
    }
  }

  _addCompare() {
    this._view .addGroup        ('_compare');
    this._view .addCompareGraph ('_compare')
  }

  _updateCompare (prop) {
    this._view .updateCompareGraph (this._compareAmount, prop)
  }

  _updateMonth() {
    if (this._cat) {
      const hasMonth = this._hasAmount (this._varianceAmount .month)
      this._view .updateGroup ('_month', hasMonth);
      if (this._varianceAmount .month) {
        this._view .updateMonthsGraph   (this._monthsAmount);
        this._view .updateProgressGraph ('_month', this._varianceAmount .month, hasMonth);
      }
    }
  }

  _hasAmount (a) {
    return a && Object .values (a .amounts) .find (a => a != 0);
  }

  _updateYear() {
    if (this._cat) {
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
    if (this._cat) {
      if (this._options .noScheduleEntry)
        return;
      this._view .emptyGroup ('_subcategories');
      if (this._sub) {
        this._sub .delete();
        this._sub = null;
      }
      this._hasSubCategories = (this._cat .children || []) .length != 0;
      if (this._hasSubCategories) {
        var opt = {
          startDate:                            Types .date .monthStart (this._date),
          endDate:                              Types .date .monthEnd   (this._date),
          noInsertInside:                       true,
          noRemoveCategoryWithNonBlankSchedule: true,
          showTotal:                            this._showProgress? 'variance': true,
          categoriesOnlyWithParent:             [this._id],
          onFieldClick:                         (id, name, html, pos) => {
            if (name != 'name' && id) {
              this .blur();
              BudgetProgressHUD .show (id, html .closest ('._BudgetProgressHUD'), {top: 50, left: 50}, this._accounts, this._variance, this._date)
            }
          },
          setFocus:                             setFocus
        }
        this._sub = new ScheduleEntry         ('_MiniScheduleEntry', this._accounts, this._variance, opt);
      } else
        this._sub = new BudgetProgressHUDName ((name) => {this._addSub (name)}, setFocus);
      this._view .addText      ('_subcategories', '', 'Subcategories');
      this._view .addPresenter ('_subcategories',  this._sub);
    }
  }

  _updateScheduleEntry() {
    if (this._cat) {
      const budget = this._variance.getBudget ();
      const bs = budget.getStartDate ();
      const be = budget.getEndDate ();
      const opt = {
        categories: [this._id],
        showTotal: true,
        startDate: Types.dateFY.getFYStart (this._date, bs, be),
        endDate: Types.dateFY.getFYEnd (this._date, bs, be),
        onFieldClick: (id, name, _0, _1, target) => {
          if (name == 'total' && id) {
            this .blur();
            const hud  = new BudgetProgressHUD (this._accounts, this._variance, {noScheduleEntry: true});
            const html = target .closest ('._BudgetProgressHUD');
            const pos  = ui .calcPosition (target, html, {top: 23, left: -454});
            hud .show (id, this._date, 0, 0, html, pos);
          }
        }
      };
      this._sub = new ScheduleEntry ('_ExpandedMiniScheduleEntry', this._accounts, this._variance, opt);
      this._view .addPresenter ('_schedule', this._sub);
    }
  }
  
  _addSub (name) {
    (async () => {
      await this._variance .getBudget() .getSchedulesModel() .insert ({name: name}, {id: this._id, inside: true});
      this .update (this._id);
    }) ();
  }

  _addSchedule () {
    this._view .addGroup ('_schedule');
    if (this._expanded) {
      this._view .addPath  ('_schedule', this._categories .getPath (this._cat) .slice (0, -1));
    }
  }

  _updateSchedule() {
    if (this._cat) {
      if (this._options .noScheduleEntry)
        return;
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
        scheduleOnly:         [this._id],
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
    if (this._cat) {
      this._varianceAmount = this._getAmount (this._id);
      let budget           = this._variance .getBudget();
      let bs = budget.getStartDate ();
      let be = budget.getEndDate ();
      this._monthsAmount = this._variance.getAmountByMonth (this._id, Types.dateFY.getFYEnd (this._date, bs, be), true);
      this._getCompareAmount();
    }
  }

  _getCompareAmount() {
    const budget = this._variance.getBudget ();
    const bs = budget.getStartDate ();
    const be = budget.getEndDate ();
    const cyS = Types.dateFY.getFYStart (this._date, bs, be);
    const cyE = Types.dateFY.getFYEnd (this._date, bs, be);
    const lyS = Types.date.addYear (cyS, - 1);
    const lyE = Types.date.addYear (cyE, - 1);
    const cat = this._cat;
    const isCredit = ['month', 'year'].reduce ((isc, per) => {
      return isc || (this._varianceAmount [per] && this._varianceAmount [per] .isCredit)
    }, false)
    const creditAdjust = isCredit ? - 1 : 1;
    let lastYearAmount;
    if (lyS < bs)
      lastYearAmount = [this._cat].concat ((this._cat.parent && this._cat.parent.zombies) || [])
      .filter (c => {
        return c.name == this._cat.name
      })
      .reduce ((t, c) => {
        return t + this._variance.getActuals ().getAmountRecursively (c, lyS, lyE)
      }, 0);
    else
      lastYearAmount = budget.getAmount (this._cat, lyS, lyE).amount;
    let actualAmount = this._variance .getActuals() .getAmountRecursively (this._cat, cyS, cyE) * creditAdjust;
    let budgetAmount = budget .getAmount (this._cat, cyS, cyE) .amount * creditAdjust;
    const isBudgetLess = ! ['month', 'year']
      .find (p => this._varianceAmount [p] && ! this._varianceAmount [p] .isBudgetless);
    if (isBudgetLess)
      budgetAmount = actualAmount;
    this._compareAmount  = {
      lastYear:  lastYearAmount * creditAdjust,
      actual:    Math .min (actualAmount, budgetAmount),
      available: Math .max (0, budgetAmount - actualAmount),
      over:      Math .max (0, actualAmount - budgetAmount),
      isFutureYear: this._date > be
    };
  }

  _updateAll() {
    this._updateTitle();
    this._updateCompare();
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
  
  _getAmount (id, includeName) {
    var isZero = a => {
      var total = Object .keys (a .amounts) .reduce ((s,k) => {
        return s + (a .amounts [k] || 0)
      }, 0);
      return total == 0 || total == a .amounts .budgetlessActual;
    }
    var data       = this._variance .getAmount (id, this._date, [[this._originalId, this._date, this._amount]]);
    data._id       = id;
    var isCredit   = (data .year && data .year .isCredit) || (data .month && data .month .isCredit);
    var amt        = this._amount * (isCredit? -1: 1);
    var isNegative = amt < 0;
    var isNegative = amt < 0;
    amt = amt * (isNegative? -1: 1);
    const cat = includeName && this._cat;
    for (let t of ['month', 'year']) {
      if (data [t] && includeName) {
        data [t]._id   = cat._id;
        data [t] .name = cat .name;
      }
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
          let pa = dat .prevAvailable;
          dat .prevAvailable = Math.max (0, dat .prevAvailable - amt);
          dat .curAvailable = Math.max (0, dat .curAvailable - amt - (pa - dat .prevAvailable));
          if (t == 'month' && data .year && data .year .available) {
            amt           = dat .thisOver;
            dat .thisOver = 0;
          }
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
  constructor (variance, parentView, accounts, categories) {
    super (
      variance .getBudget() .getSchedulesModel(),
      new BudgetProgressCategoryTitleView ('_title', [
        new ScheduleEntryNameNotScalable ('name',    new ScheduleNameFormat (accounts, categories), '', '', 'Name', categories),
        new ScheduleEntryAccount         ('account', ViewFormats ('string'))
      ], parentView)
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
    if (this._category && doc._id == this._category._id && arg && arg .name)
      this._view .updateField (this._category._id, 'name', this._category .name);
  }

  addHtml (toHtml) {
    this._view .addHtml ('_title', toHtml);
  }
}
