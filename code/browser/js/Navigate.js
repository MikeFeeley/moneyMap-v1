class Navigate {
  constructor (accounts, variance) {
    this._accounts           = accounts;
    this._variance           = variance;
    this._actuals            = variance .getActuals();
    this._budget             = variance .getBudget();
    this._categories         = this._budget .getCategories();
    this._updaters           = new Map();
    this._balances           = new Model ('balanceHistory');
    this._parameters         = new Model ('parameters');
    this._history            = new Model ('history');
    this._accountsModel      = new Model ('accounts');
    this._varianceObserver   = this._variance      .addObserver (this, this._onModelChange);
    this._balancesObserver   = this._balances      .addObserver (this, (e,d,a) => {this._onModelChange (e,d,a,null,{constructor: {name: 'BalanceHistory'}})});
    this._parametersObserver = this._parameters    .addObserver (this, (e,d,a) => {this._onModelChange (e,d,a,null,{constructor: {name: 'Parameters'}})});
    this._accountsObserver   = this._accountsModel .addObserver (this, (e,d,a) => {this._onModelChange (e,d,a,null,{constructor: {name: 'Accounts'}})});
    this._accountsModel .observe ({});
    NavigateInstance         = this;
  }

  delete() {
    this._variance      .deleteObserver (this._varianceObserver);
    this._balances      .deleteObserver (this._balancesObserver);
    this._parameters    .deleteObserver (this._parametersObserver);
    this._accounts      .deleteObserver (this._accountsObserver);
    this._balances      .delete();
    this._parameters    .delete();
    this._history       .delete();
    this._accountsModel .delete();
  }

  addProgressHtml (toHtml) {
    this._progressView = new NavigateView (this._accounts, this._variance);
    this._progressView .addObserver       (this, this._onViewChange);
    this._progressView .addHtml           (toHtml, () => {
      this._clearUpdatersForView (this._progressView);
      this._addProgressSidebar()
      this._addProgressGraphs();
    })
  }

  addPlanHtml (toHtml) {
    this._planView = new NavigateView (this._accounts, this._variance);
    this._planView .addObserver       (this, this._onViewChange);
    this._planView .addHtml           (toHtml, () => {
      this._clearUpdatersForView     (this._planView);
      this._addBudgetYearTotalsGraph (this._planView);
      this._addYearCategoriesGraphs  ('_budgetChart', this._planView);
      this._addMonthsGraph           ('_budgetMonthsGraph', this._planView);
      this._addMonthsTable           ('_budgetTable', this._planView);
    })
  }

  addRealityHtml (toHtml) {
    this._realityView = new NavigateView (this._accounts, this._variance);
    this._realityView .addObserver       (this, this._onViewChange);
    this._realityView .addHtml           (toHtml, () => {
      this._clearUpdatersForView    (this._realityView);
      this._realityView .addHeading ('What has actually happened so far ...');
      this._addYearCategoriesGraphs ('_activityChart', this._realityView);
      this._addMonthsGraph          ('_activityMonthsGraph', this._realityView);
      this._addMonthsTable          ('_activityTable', this._realityView);
    })
  }

  *_getModelValues() {
    yield* this._actuals .findHistory ();
    if (this._historicBudgets === undefined)
      this._historicBudgets = (yield* this._budget  .getHistoricBudgets()) || null;
    if (this._noTranAmounts === undefined) {
      this._noTranAmounts = (yield* this._history .find()) || null;
      for (let nta of this._noTranAmounts || [])
        nta .category = this._categories .get (nta .category);
    }
    if (this._historicBalances === undefined)
      this._historicBalances = (yield* this._balances .find()) || null
    if (this._rates === undefined)
      this._rates = (yield* this._parameters .find ({name: 'rates'})) [0] || {apr: 0, inflation: 0, presentValue: false}
  }


  *_aph() {
    yield* this._getModelValues();
    this._clearUpdatersForView                      (this._perspectiveView);
    let sc = this._perspectiveView .addContainer    ('_sliderHeader');
    this._perspectiveView .addHeading               ('Compare Years', '', sc);
    let lv = this._perspectiveView .addSubHeading   ('', '', sc);
    this._perspectiveView .addSubHeading            ('&ndash;', '', sc);
    let rv = this._perspectiveView .addSubHeading   ('', '', sc);
    let ds = this._getHistoryData                   ();
    this._addHistorySlider (
      this._perspectiveView, ds, sc, lv, rv,
      this._addHistoryGraph (undefined, undefined, undefined, this._perspectiveView, ds),
      this._addHistoryTable (undefined, undefined, undefined, undefined, undefined, this._perspectiveView, ds)
    );
  }

  addPerspectiveHtml (toHtml) {
    this._perspectiveView = new NavigateView (this._accounts, this._variance);
    this._perspectiveView .addObserver       (this, this._onViewChange);
    this._perspectiveView .addHtml (toHtml, () => {async (this, this._aph) ()})
  }

  *_anwh() {
    yield* this._getModelValues();
    var ds = this._getNetWorthData ();
    this._clearUpdatersForView                   (this._newWorthView);
    let sc = this._netWorthView .addContainer    ('_sliderHeader');
    this._netWorthView .addHeading               ('Net Worth', '', sc);
    let lv = this._netWorthView .addSubHeading   ('', '', sc);
    this._netWorthView .addSubHeading            ('&ndash;', '', sc);
    let rv = this._netWorthView .addSubHeading   ('', '', sc);
    this._addNetworthSlider (
      this._netWorthView, ds, sc, lv, rv,
      this._addNetWorthGraph                (this._netWorthView, ds),
      this._addNetWorthTable                (this._netWorthView, ds)
    );
  }

  addNetWorthHtml (toHtml) {
    this._netWorthView = new NavigateView (this._accounts, this._variance);
    this._netWorthView .addObserver       (this, this._onViewChange);
    this._netWorthView .addHtml           (toHtml, () => {async (this, this._anwh) ()})
  }

  _onModelChange (eventType, doc, arg, source, model) {
    var modelName = model .constructor .name;
    let skip =
      (eventType == ModelEvent .INSERT && modelName == 'SchedulesModel' && doc .category) ||
      (eventType == ModelEvent .UPDATE && modelName == 'SchedulesModel' && arg && arg .sort != null);
    if (skip)
      return;
    switch (modelName) {
      case 'ActualsModel':
        var ids = (doc .category && [doc .category]) || [];
        if (eventType == ModelEvent .UPDATE && arg._original_category != null)
          ids .push (arg._original_category);
        break;
      case 'SchedulesModel':
        var ids = [doc .category || doc._id];
        break;
      default:
        var ids = [doc._id] || [];
        break;
    }
   this._update (eventType, modelName, ids, doc);
  }




  /**
   * Handle interation with view (drilling on click)
   */
  _onViewChange (eventType, arg) {

    if (eventType == NavigateViewEvent .PROGRESS_GRAPH_CLICK && arg .id) {
      /* Progress Graph */
      if (arg .html .hasClass('_popup')) {
        arg .position .top += arg .html .position() .top;
        arg .position .left = arg .html .position() .left + (arg .html .parent() .hasClass ('_right')? -20: +20);
        arg .html           = arg .html .parent();
      } else {
        if (arg .html .hasClass ('_right')) {
          arg .position .left  = undefined;
          arg .position .right = 0;
        } else
          arg .position .left = 0;
      }
      if (arg .isLabel) {
        var root = this._categories .get (arg .id);
        var t    = arg .title .split (' ');
        var im   = t [t .length -1] == 'Month';
        if (arg .altClick || ! this._addProgressGraph (root, arg .html, true, arg .position, undefined, im, ! im))
          BudgetProgressHUD .show (root._id, arg .html, arg .position, this._accounts, this._variance);
      } else {
        var today = Types .dateMY .today();
        var dates  = {
          start: Types .dateMY .monthStart (today),
          end:   Types .dateMY .monthEnd   (today)
        }
        let sel = arg .data .find (d => {return d._id == arg .id});
        if (arg .altClick)
          TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, {top: arg .position .top, left: 0}, ! sel .isYear, sel .isYear, sel .addCats);
        else
          this._addMonthsGraph ('_activityMonthsGraph', arg.view, [arg .id], true, arg .position, arg .html, ! sel .isYear, sel .isYear, sel .addCats);
      }

    } else if (eventType == NavigateViewEvent .PROGRESS_SIDEBAR_CLICK) {
      if (arg .altClick)
        this._addMonthsGraph ('_budgetMonthsGraph', arg.view, [arg .id], true, arg .position, arg .html);
      else
        this._addMonthsGraph ('_activityMonthsGraph', arg.view, [arg .id], true, arg .position, arg .html);
    } else if (eventType == NavigateViewEvent .BUDGET_CHART_CLICK  && arg .id) {
      /* Yearly Chart (Budget or Actual) */
      if (arg .altClick) {
        if (! arg .id .includes ('blackout_') && ! arg .id .includes ('unallocated_')) {
          let name     = arg .name .includes ('budget')? '_budgetMonthsGraph': '_activityMonthsGraph';
          let html     = arg .html .closest (arg .name .includes ('budget')? '._budgetCharts' : '._activityCharts')
          let position = {top: arg .position .top}
          if (arg .direction == 1)
            position .left = 0;
          else
            position .right = 200;
          this._addMonthsGraph (name, arg .view, [arg .id], true, position, html);
        }
      } else
        this._addYearCategoriesGraph (arg .name, arg .id, null, arg .view, true, arg .position, arg .direction);

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_CLICK && arg .id) {
      /* Monthly or History Graph (Budget or Actual) */
      if (['_budgetMonthsGraph', '_activityMonthsGraph'] .includes (arg .name)) {
        let sel = arg .data && arg .data .reduce ((s,d) => {return s || d .rows .find (r => {return r .id == arg .id})}, null);
        let im  = !sel || sel .isYear === undefined || ! sel.isYear;
        let iy  = !sel || sel .isYear === undefined || sel .isYear;
        if (arg .altClick) {
          let id = arg .id .split ('_') .slice (-1) [0];
          var today = Types .date .today();
          var dates = {};
          dates .start = arg .labelIndex < 12? Types .date .addMonthStart (this._budget .getStartDate(), arg .labelIndex) : Types .date .monthStart (today);
          dates .end   = Types .date .monthEnd (dates .start);
          if (arg .name == '_budgetMonthsGraph') {
            var position = {top: arg .position .top, left: Math .max (0, arg .position .left + 200)}
            BudgetProgressHUD .show (id, arg .html, position, this._accounts, this._variance, arg .labelIndex < 12? dates .end: undefined);
          } else
            TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, {top: arg .position .top, left: 0}, im, iy, sel && sel .addCats);
        } else {
          if (arg .id .includes ('budget_')) {
            let id   = arg .id .split ('_') .slice (-1) [0];
            let date = arg .labelIndex < 12
              ? Math .min(Types .date. today(), Types .date .monthEnd (Types .date .addMonthStart (this._budget .getStartDate(), arg . labelIndex)))
              : undefined;
            BudgetProgressHUD .show (id, arg .html, arg .position, this._accounts, this._variance, date);
          } else
            this._addMonthsGraph (arg .name, arg .view, [arg .id], true, arg .position, arg .html, true, iy, sel && sel .addCats);
        }
      } else if (arg .name == '_budgetHistoryGraph' && arg .id .length >= 1 && arg .id [0]) {
        this._addHistoryGraph ([] .concat (arg .id), true, arg .position, arg .view);
      }

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_TITLE_CLICK && arg .id) {
      /* Graph Title */
      if (arg .altClick) {
        let parent = this._categories .get (arg .id) .parent;
        if (parent) {
          let sel = arg .data [0] .rows [1];
          let im  = !sel || sel .isYear === undefined || ! sel.isYear;
          let iy  = !sel || sel .isYear === undefined || sel .isYear;
          this._addMonthsGraph (arg .name, arg .view, [parent._id], true, arg .position, arg .html, im, iy, sel && sel .addCats);
        }
      } else
        BudgetProgressHUD .show (arg .id .split ('_') .slice (-1) [0], arg .html, arg .position, this._accounts, this._variance);

    } else if (eventType == NavigateViewEvent .BUDGET_TABLE_CLICK && arg .id) {
      /* Monthly or History Table (Budget or Actual) */
      if (['_budgetTable', '_activityTable'] .includes (arg .name)) {
        if (arg .altClick) {
          let id = arg .id .split ('_') .slice (-1) [0];
          let date  = (arg .date && arg .date .length > 0 && arg .dates [0]) || {start: this._budget .getStartDate(), end: this._budget .getEndDate()}
          switch (arg .name) {
            case '_budgetTable':
              BudgetProgressHUD .show (id, arg .html, arg .position, this._accounts, this._variance, arg .date? arg .date .end: undefined);
              break;
            case '_activityTable':
              TransactionHUD .showCategory (arg .id, arg .date, this._accounts, this._variance, arg .html, {top: arg .position .top, left: 0});
              break;
          }
        } else
          this._addMonthsTable (arg .name, arg .view, [arg .id], arg .date, true, true, arg .position, arg .html);
      } else if (arg .name == '_budgetHistoryTable' && arg .id .length >= 1 && arg .id [0])
        this._addHistoryTable ([] .concat (arg .id), arg .date, true, true, arg .position, arg .view);

    } else if (eventType == NavigateViewEvent .BUDGET_TABLE_TITLE_CLICK && arg .name == '_budgetHistoryTable') {
      let name, title;
      if (arg .date .start >= this._budget .getStartDate()) {
        name  = '_budgetTable';
        title = 'Budget for ';
      } else {
        name  = '_activityTable';
        title = 'Activity for ';
      }
      title += this._budget .getNameForBudgetByDate (arg .date);
      this._addMonthsTable (name, arg.view, undefined, arg .date, true, true, arg .position, arg .html, undefined, title);

    } else if (eventType == NavigateViewEvent .PROGRESS_GRAPH_TITLE_CLICK && arg .data .length) {
      /* Progress Graph Title */
      var id = this._categories .get (arg .data [0]._id) .parent ._id;
      BudgetProgressHUD .show (id, arg .html, arg .position, this._accounts, this._variance);
    }
  }




  /*******************************************/
  /***** GET BUDGET / ACTUAL INFORMATION *****/

  _getChildren (type, id) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        if (id .includes ('other_'))
          result = []
        else
          result = ((this._categories .get (id .split ('_') .slice (-1) [0]) || {}) .children || []) .map (c => {return c._id});
        if (type == NavigateValueType .BUDGET_YR_AVE_ACT)
          result = ['budget_' + id] .concat (result);
        return result

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        if (id .includes ('other_') || id .includes ('payee_'))
          return []
        else {
          let cat           = this._categories .get (id .split ('_') .slice (-1) [0]);
          let children      = cat .children || [];
          let payeeTruncate = /\d|#|\(/;
          if (children .length == 0) {
            var result = this._actuals .getTransactions (cat, this._budget .getStartDate(), this._budget .getEndDate())
              .map (t => {
                let stop = t .payee .match (payeeTruncate);
                return (stop && stop .index? t .payee .slice (0, stop .index): t .payee) .split (' ') .slice (0,3) .join (' ');
              })
              .sort   ((a,b)   => {return a<b? -1: a==b? 0: 1})
              .filter ((p,i,a) => {return i==0 || ! p .startsWith (a [i-1])})
              .map    (p       => {return 'payee_' + p + '_' + cat._id})
          } else
            var result = children .map (c => {return c._id});
          if (type == NavigateValueType .ACTUALS_BUD)
            result = ['budget_' + id] .concat (result);
          return result;
        }
    }
  }

  _getAmounts (type, id, isCredit, dates, includeMonths, includeYears, addCats) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        if (type == NavigateValueType .BUDGET_YR_AVE_ACT && id .includes ('budget_')) {
          let cat = this._categories .get (id .split ('_') .slice (-1) [0]);
          return (dates .filter (d => {return d .start <= Types .date .today()}) .map (date => {
            let value = this._actuals .getAmountRecursively (cat, date .start, date .end);
            if (id .includes ('other_'))
              value -= this._getChildren (type, id) .reduce ((t, c) => {
                if (! c .includes ('_')) {
                  let cat = this._categories .get (c);
                  if (this._budget .getAmount (cat, date .start, date .end) .amount == 0) {
                    return t + this._actuals .getAmountRecursively (cat, date .start, date .end)
                  } else
                    return t;
                } else
                  return t;
              }, 0)
            return {id: id, value: value}
          }))
        } else {
          let cat     = this._categories .get (id .split ('_') .slice (-1) [0]);
          let amounts = dates .map (date => {
            let a = this._budget .getAmount (cat, date .start, date .end);
            return {
              id:    cat._id,
              value: (a .month && a .month .amount || 0) * (isCredit? -1: 1)
            }
          });
          if (dates .length == 12 || dates .length == 1) {
            let yrAmount = this._budget .getAmount (cat, this._budget .getStartDate(), this._budget .getEndDate());
            amounts .push ({
              id:    cat._id,
              value: (yrAmount .year && yrAmount .year .amount || 0) * (isCredit? -1: 1)
            })
          }
          if ((type == NavigateValueType .BUDGET_YR_AVE || type == NavigateValueType .BUDGET_YR_AVE_ACT))
            amounts [amounts .length -1] .value /= 12;
          if (dates .length == 1)
            amounts = [{id: cat._id, value: amounts [0] .value + amounts [1] .value}]
          return amounts;
        }

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        let ida = id .split ('_');
        let cat = this._categories .get (ida .slice (-1) [0]);
        if (type == NavigateValueType .ACTUALS_BUD && id .includes ('budget_')) {
          return (dates .filter (d => {return d .start <= Types .date .today()}) .map (date => {
            let va = this._variance .getAmount (cat._id, date .start - 1);
            let ma = includeMonths && va .month? va .month .amounts .available: 0;
            let ya = includeYears  && va .year?  va .year  .amounts .available: 0;
            return {id: id, value: ma + ya}
          }))
        } else if (id .includes ('payee_')) {
          let payee = ida .slice (-2) [0];
          return dates .map (date => {return {
            id:    id,
            value: this._actuals .getTransactions (cat, date .start, date .end)
                     .filter (t     => {return t .payee .startsWith (payee)})
                     .reduce ((s,t) => {return s - (t .credit || 0) + (t .debit || 0)}, 0)  * (isCredit? -1: 1)
          }})
        } else {
          let isOther = id .includes ('other_');
          return dates .map (date => {
            let value;
            if (isOther)
              value = this._actuals .getAmount (cat, date .start, date .end, null, includeMonths, includeYears, addCats) * (isCredit? -1: 1);
            else
              value = this._actuals .getAmountRecursively (cat, date .start, date .end, null, includeMonths, includeYears, addCats) * (isCredit? -1: 1);
            return {
              id:    cat._id,
              value: value
            }})
        }
    }
  }

  _getIncome (type) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        return - this._budget .getAmount (
          this._budget .getIncomeCategory(), this._budget .getStartDate(), this._budget .getEndDate()
        ) .amount

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        return - this._actuals .getAmountRecursively (
          this._budget .getIncomeCategory(), this._budget .getStartDate(), this._budget .getEndDate()
        )
    }
  }

  _getName (type, id) {
    let cat     = this._categories .get (id .split ('_') .slice (-1) [0]);
    let catName = cat .name;
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        if (type == NavigateValueType .BUDGET_YR_AVE_ACT && id .includes ('budget_')) {
          let gr = (c) => {return c .parent? gr (c .parent): c};
          return 'Actual ' + gr (cat) .name;
        }
        return (id .includes ('other_')? 'Other ': '') + catName

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        let ida      = id .split ('_');
        let isCredit = this._budget .isCredit (cat);
        let isGoal   = this._budget .isGoal   (cat);
        if (type == NavigateValueType .ACTUALS_BUD && id .includes ('budget_'))
          return isCredit || isGoal? 'Expected Budget': 'Available Budget';
        else
          return id .includes ('payee_')? ida .slice (-2) [0]: (id .includes ('other_')? 'Other ': '') + catName
    }
  }

  _getNote (type, id, includeMonths, includeYears) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        return 'Budget';

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        let getRoot  = c => {return c.parent? getRoot (c .parent): c}
        let ym       = includeMonths && !includeYears? ' Monthly ': !includeMonths && includeYears? ' Anytime ': '';
        let gn       = getRoot (this._categories .get (id .split ('_') .slice (-1) [0])) .name;
        return 'Actual ' + ym + gn;
    }
  }

  _getModels (type) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE:
        return ['SchedulesModel'];

      case NavigateValueType .ACTUALS:
        return ['ActualsModel'];

      case NavigateValueType .ACTUALS_BUD: case NavigateValueType .BUDGET_YR_AVE_ACT:
        return ['SchedulesModel', 'ActualsModel'];
    }
  }

  _getChildrenData (type, id, dates, allowLeaf, includeMonths = true, includeYears = true, addCats = []) {
    let isLeaf = (id .includes ('other_') || id .includes ('payee_') || this._getChildren (type, id) .filter (c => {return ! c .includes ('budget_')}) .length == 0);
    if (isLeaf && (! allowLeaf || id .includes ('leaf_')))
      return {data: []}
    else {
      let cat         = this._categories .get (id .split ('_') .slice (-1) [0]);
      let isCredit    = this._budget .isCredit (cat);
      let isGoal      = this._budget .isGoal   (cat);
      let children    = this._getChildren (type, id);
      let hasChildren = children .length > 1 || (children .length == 1 && ! children [0] .includes ('budget_'));
      let data        = ((hasChildren && children) || [id] .concat (children))
        .map (child => {return {
          name:     this._getName (type, child) || '',
          id:       child,
          isCredit: isCredit,
          isGoal:   isGoal,
          isYear:   includeMonths != includeYears? this._categories .getType (this._categories .get (child .split ('_') .slice (-1) [0])) == ScheduleType .YEAR: undefined,
          amounts:  this._getAmounts (type, child, isCredit, dates, includeMonths, includeYears, addCats),
          type:     child .includes ('budget_') && 'line'
        }});
      if (! id .includes ('other_')) {
        let totals = data .reduce ((t,r) => {return ! r .id .includes ('budget_')? r .amounts .map ((a,i) => {return (t[i] || 0) + a .value}): t}, []);
        data .push ({
          name:     'Other',
          id:       'other_' + cat._id,
          isCredit: isCredit,
          isGoal:   isGoal,
          amounts:  this._getAmounts (type, id, isCredit, dates, includeMonths, includeYears, addCats) .map ((a,i) => {
            return {id: 'other_' + cat._id, value: a .value - (totals [i] || 0)
          }})
        })
      }
      data          = data .filter (r => {return r .amounts .reduce ((s,a) => {return s + a .value}, 0) != 0});
      let realData  = data .filter (d => {return ! d .id .includes ('budget_')});
      let hasBudget = data .length != realData .length;
      let hasOther  = realData .length && realData [realData .length -1] .id .includes ('other_');
      let one = data .length == 1 || (data .length == 2 && hasBudget);
      if (one && (data [0] .id .includes ('other_') || this._getChildren (type, data [0] .id) .filter (c => {return ! c .includes ('budget_')}) .length == 0))
        data [0] .id = 'leaf_' + data [0] .id;
      return {
        data:      data,
        getUpdate: (eventType, model, ids) => {
          let needReplace = {needReplace: true};
          if (this._getModels (type) .includes (model)) {
            if (eventType == ModelEvent .UPDATE && ids .length == 1) {
              let eid = ids [0];
              let aff = data .filter (e => {
                let i =  e. id .split ('_') .slice (-1) [0];
                return i == eid || (! e .id .includes ('other_') && this._categories .getDescendants (this._categories .get (i)) .find (d => {return d._id == eid}))
              });
              if (aff .length) {
                let up = aff .map (af => {
                  let aid     = af .id;
                  let newData = this._getChildrenData (type, id, dates, allowLeaf, includeMonths, includeYears, addCats);
                  if (hasOther == (newData .data .length && newData .data [newData .data .length - 1] .id .includes ('other_'))) {
                    let newAff = newData .data .filter (d => {return d .id == aid});
                    if (newAff .length == 1) {
                      newAff = newAff [0];
                      return {update: {id: newAff .id, name: newAff .name, amounts: newAff .amounts}}
                    } else if (newAff .length == 0)
                      return {needUpdate: true, affected: aid}
                    else
                      return needUpdate
                  } else
                    return needReplace
                })
                if (up .find (u => {return u .needReplace}))
                  return [needReplace]
                else
                  return up;
              }
            } else
              return [needReplace]
          }
        }
      }
    }
  }




  /***************************************************/
  /***** MONTHLY BUDGET OR ACTUAL GRAPH OR TABLE *****/

  /**
   * Get (budget or actual) data for id and its children
   *   returns {
   *     cols:   array of column headers
   *     months: number of months (for computing average)
   *     income: total income (for budget comparison)
   *     groups: [{
   *       name: name for this group
   *       rows: [{
   *         name:     name for this row
   *         id:       category id for this row
   *         isCredit: true iff this is a credit amount
   *         isGoal:   true iff this is a goal category
   *         amounts:  array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */
  _getData (
    type,
    dates,
    ids           = [this._budget .getIncomeCategory()._id, this._budget .getSavingsCategory()._id, this._budget .getExpenseCategory()._id],
    allowLeaf,
    includeMonths = true,
    includeYears  = true,
    addCats       = []
  ) {
    if (!dates || (dates .start && dates .end != Types .date .monthEnd (dates .start))) {
      var st     = dates? dates .start: this._budget .getStartDate();
      var en     = dates? dates .end:   this._budget .getEndDate();
      var dates  = [];
      while (st <= en) {
        dates .push ({start: st, end: Types .dateMY .monthEnd (st)});
        st = Types .dateMY .addMonthStart (st, 1);
      }
    } else
      dates = [] .concat (dates);
    var months = dates .length;
    var cols   = dates .map (d => {return Types .dateM .toString (d .start)});
    var groups = ids
      .map (id => {
        let data = this._getChildrenData (type, id, dates, allowLeaf, includeMonths, includeYears, addCats);
        return {
          id:        id,
          name:      this._getName         (type, id),
          note:      this._getNote         (type, id, includeMonths, includeYears),
          rows:      data .data,
          getUpdate: data .getUpdate
        }
      })
    if ((type == NavigateValueType .BUDGET_YR_AVE_ACT || type == NavigateValueType .ACTUALS_BUD) && groups .length > 1)
      groups = groups .map (g => {
        g .rows = g .rows .filter (r => {return ! r .id .includes ('budget_')})
        return g;
      })
    if (dates .length == 12 || dates .length == 0) {
      if (type == NavigateValueType .BUDGET)
        cols .push ('Yr')
      else if (type == NavigateValueType .BUDGET_YR_AVE || type == NavigateValueType .BUDGET_YR_AVE_ACT) {
        let hasMonths = groups .find (g => {return g .rows .find (r => {return r .amounts .length == 13 && r .amounts .slice (0, -1) .find (a => {return a .value != 0})})});
        if (! hasMonths) {
          for (let g of groups)
            for (let r of g .rows)
              if (r .amounts .length == 13)
                r .amounts [12] .value *= 12;
          cols .push ('Yr');
        } else
          cols .push ('Yr Ave')
      }
    }
    let today     = Types .date .today()
    let highlight = (dates || []) .findIndex (d => {return today >= d .start && today <= d .end});
    return {
      cols:      cols,
      dates:     dates,
      months:    months,
      groups:    groups,
      startBal:  this._budget .getStartCashBalance(),
      highlight: highlight > 0? highlight: undefined,
      income:    this._getIncome (type),
      getUpdate: (eventType, model, eventIds) => {
        let update = [];
        for (let g of groups) {
          if (this._getModels (type) .includes (model) && eventIds .includes (g .id))
            update .push ({update: {id: g .id, name: this._getName (type, g .id)}})
          let u = g .getUpdate (eventType, model, eventIds);
          if (u) {
            if (u [0] .needReplace)
              u = [{replace: this._getData (type, dates, ids, allowLeaf, includeMonths, includeYears, addCats)}]
            update = update .concat (u);
          }
        }
        return update;
      }
    }
  }

  _getMonthsData (type, dates, ids, allowLeaf, includeMonths, includeYears, addCats) {
    let data = this._getData (type, dates, ids, allowLeaf, includeMonths, includeYears, addCats);
    let parentUpdate = data .getUpdate;
    data .getUpdate = (e,m,i) => {
      return parentUpdate (e,m,i) .map (u => {
        if (u .needUpdate)
          return {needReplace: this._getData (type, dates, ids, allowLeaf, includeMonths, includeYears, addCats)}
        else
          return u;
      })
    }
    return data;
  }

  /**
   * Add GRAPH (either budget or actual) showing children of specifie root list
   */
  _addMonthsGraph (name, view, ids, popup, position, toHtml, includeMonths=true, includeYears=true, addCats=[]) {
    var type    = name .includes ('budget')? NavigateValueType .BUDGET_YR_AVE_ACT: NavigateValueType .ACTUALS_BUD;
    var dataset = this._getMonthsData (type, null, ids, true, includeMonths, includeYears, addCats);
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        let update = dataset .getUpdate (eventType, model, ids);
        if (update)
          updateView (update);
      });
      var updateView = view .addMonthsGraph (name, dataset, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml);
    }
  }

  /**
   * Add TABLE (either budget or actual) showing children of specified root list
   */
  _addMonthsTable (name, view, ids, dates, skipFoot, popup, position, toHtml, col, title) {
    var dataset = this._getMonthsData (name .includes ('budget')? NavigateValueType .BUDGET: NavigateValueType .ACTUALS, dates, ids, false);
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        let update = dataset .getUpdate (eventType, model, ids);
        if (update)
          updateView (update);
      });
      var updateView = view .addBudgetTable (name, dataset, dataset .cols .length == 1, skipFoot, popup, position, toHtml, () => {
        this._deleteUpdater (view, updater);
      }, ! dates, title);
    }
  }






  /***************************************/
  /**** YEARLY BUDGET OR ACTUAL GRAPH ****/

  _getYearsData (type, id, blackouts) {
    var getBlackouts = (d) => {
      var boAmts  = blackouts .map (b => {return this._getAmounts (type, b._id, this._budget .isCredit (b), dates) [0]});
      var amts    = d .reduce ((s,c) => {return s + c .amounts[0] .value}, 0);
      var unalloc = Math .max (0, boAmts [0] .value - boAmts [1] .value - amts);
      return [{
        id:      'unallocated_',
        name:    'Unallocated',
        amounts: [{id: 'unallocated_', value: unalloc}]
      }, {
        id:       'blackout_' + boAmts [1] .id,
        name:     blackouts [1] .name,
        amounts:  [boAmts [1]],
        blackout: true
      }]
    }
    var dates = [{start: this._budget .getStartDate(), end: this._budget .getEndDate()}];
    var data  = this._getChildrenData (type, id, dates);
    if (blackouts) {
      let bo = getBlackouts (data .data);
      data .data .push (bo [0], bo [1]);
    }
    return {
      name: this._categories .get (id .split ('_') .slice (-1) [0]) .name,
      cats: data .data .map (c => {return {
        id:        c .id,
        name:      c .name,
        amount:    c .amounts [0] .value,
        blackout:  c .blackout,
      }}),
      getUpdate: (e,m,i) => {
        let update = data .getUpdate (e,m,i);
        if (update) {
          let nu = [];
          for (let u of update)
            if (u .needReplace) {
              nu .push ({replace: this._getYearsData (type, id, blackouts)})
            } else if (u .needUpdate && u .affected .startsWith ('blackout_')) {
              let bo = getBlackouts (this._getChildrenData (type, id, dates) .data);
              nu .push ({update: bo [0]}, {update: bo [1]})
            } else
              nu .push (u);
          return nu;
        }
      }
    }
  }

  _addYearCategoriesGraph (name, id, blackouts, view, popup, position, direction) {
    if (! id .includes ('_')) {
      var type = name == '_budgetChart'? NavigateValueType .BUDGET: NavigateValueType .ACTUALS;
      var data = this._getYearsData (type, id, blackouts);
      if (data .cats .length && (data .cats .length > 1 || ! data .cats [0] .id .includes ('leaf_'))) {
        let updater = this._addUpdater (view, (eventType, model, ids) => {
          let update = data .getUpdate (eventType, model, ids);
          if (update)
            updateView (update);
        })
        var updateView = view .addDoughnut (data, name, popup, position, direction, () => {
          this._deleteUpdater (view, updater);
        });
      }
    }
  }

  _addYearCategoriesGraphs (name, view, toHtml) {
    var income  = this._budget .getIncomeCategory();
    var savings = this._budget .getSavingsCategory();
    var expense = this._budget .getExpenseCategory();
    view .addGroup (name + 's', toHtml);
    for (let root of [income, savings, expense])
      this._addYearCategoriesGraph (name, root._id, root == savings && [income, expense], view);
  }






  /******************/
  /**** PROGRESS ****/

  _getProgressGraphLabels (roots) {
    var date    = Types .dateMY .today();
    return roots
      .reduce ((list, root) => {
        return list .concat ((root .children || []) .map (cat => {
          return {
            name:    cat .name || '',
            amounts: this._variance .getAmount (cat._id, date)
          }
        }))
      }, [])
      .filter (a => {
        return Object .keys (a .amounts) .reduce ((s,k) => {return s + a .amounts [k]}, 0)
      })
      .map (a => {return a .name});
  }

  _addProgressGraph (root, side, popup, position, labelWidth, includeMonths=true, includeYears=true, bigHeading=false) {

    var getAllData = () => {
      amounts = (root .children || []) .map (cat => {return {
        cat:    cat,
        amount: this._variance .getAmount (cat._id, date)
      }});
      months = includeMonths && getData ('month', amounts .filter (a => {return a .amount .month}));
      years  = includeYears  && getData ('year',  amounts .filter (a => {return a .amount .year}));
      if (! labelWidth)
        labelWidth == []
          .concat (months? months .map (a => {return a .name}): [])
          .concat (years?  years  .map (a => {return a .name}): [])
    }

    var addGraphsToView = () => {
      if (bigHeading) {
        this._progressView .addHeadingToProgressGraph (progressGraph, root .name);
        var mo = 'This Month';
        var yr = 'This Year (at any time)';
      } else {
        var mo = root .name + ' this Month';
        var yr = root .name + ' this Year (at any time)';
      }
      if (months && months .length)
        updateMonthView = this._progressView .addToProgressGraph (progressGraph, mo, months, labelWidth);
      if (years && years .length)
        updateYearView  = this._progressView .addToProgressGraph (progressGraph, yr, years, labelWidth);
    }

    var getData = (type, amounts) => {
      return amounts
        .map (a => {return {
          name:            a .cat .name || '',
          _id:             a .cat ._id,
          isCredit:        a .amount [type] .isCredit,
          isGoal:          a .amount [type] .isGoal,
          percentComplete: a .amount [type] .percentComplete,
          percentInBudget: a .amount [type] .percentInBudget,
          isYear:          type == 'year',
          amounts:         a .amount [type] .amounts,
          addCats:         a .amount .addCats
      }})
      .filter (a => {return Object .keys (a .amounts) .reduce ((s,k) => {return s + a .amounts [k]} ,0)})
    }

    var date    = Types .dateMY .today();
    var amounts, months, years, updateMonthView, updateYearView;
    getAllData();
    if ((months && months .length) || (years  && years .length)) {
      var updater = this._addUpdater (this._progressView, (eventType, model, ids) => {
        var affected = eventType != ModelEvent .UPDATE || ids .includes (root._id) || amounts .find (a => {
          return ids .includes (a .cat._id) || this._categories .getDescendants (a .cat) .find (d => {return ids .includes (d._id)});
        })
        if (affected) {
          var oldMonths = months, oldYears = years;
          getAllData();
          if ((oldMonths .length == 0) != (months .length == 0) || (oldYears .length == 0) != (years .length == 0)) {
            this._progressView .emptyProgressGraph (progressGraph);
            addGraphsToView();
          } else {
            if (months .length)
              updateMonthView (months, labelWidth, (bigHeading? 'T' : root .name + ' t') + 'his Month');
            if (years .length)
              updateYearView (years,  labelWidth, (bigHeading? 'T' : root .name + ' t') + 'his Year (at any time)');
          }
        }
      });
      var progressGraph = this._progressView .addProgressGraph (side, popup, position, () => {this._deleteUpdater (this._progressView, updater)}, () => {
        this._deleteUpdater (this._progressView, updater);
      });
      progressGraph._includeMonths = includeMonths;
      progressGraph._includeYears  = includeYears;
      addGraphsToView();
      return true;
    } else
      return false;
  }

  _addProgressGraphs() {
    var date       = Types .dateMY .today();
    var roots      = [this._budget .getExpenseCategory(), this._budget .getSavingsCategory(), this._budget .getIncomeCategory()];
    var labelWidth = this._getProgressGraphLabels (roots);
    for (let root of roots)
      this._addProgressGraph (root, null, false, undefined, labelWidth, true, true, true)
  }





  /****************************/
  /***** PROGRESS SIDEBAR *****/

  _addBigPicture() {
    let updateView = this._progressView .addProgressSidebarGroup('Saving this Year', '');
    let update = varianceList => {
      let sav = this._budget .getAmount (this._budget .getSavingsCategory()) .amount;
      let inc = this._budget .getAmount (this._budget .getIncomeCategory())  .amount;
      let exp = this._budget .getAmount (this._budget .getExpenseCategory()) .amount;
      let ovp = varianceList .reduce ((t,v) => {return t + (v .prev < 0? v .prev: 0)}, 0)
      let ovc = varianceList .reduce ((t,v) => {
        let a = Math .max (0, v .prev) + v .cur;
        return t + (a < 0? a: 0)
      }, 0);
      let ovr = ovp + ovc;
      let una = -(inc + (sav + exp));
      let list = [];
      if (una < -50 || una > 50)
        list .push ({
          name:    una > 0? 'Unallocated' : 'Over Allocated',
          tooltip: una > 0? 'Planned income not allocated in budget.': 'Budget allocation exceeds planned income.',
          amount:  una
        })
      else
        una = 0;
      if (ovr < -50)
        list .push ({
          name: 'Over Budget',
          nameTooltip:
            'Over budget' +
            (ovp < -50?              ' ' + Types .moneyDZ .toString (-ovp) + ' through last month': '') +
            (ovp < -50 && ovc < -50? ' plus': '') +
            (ovc < -50?              ' ' + Types .moneyDZ .toString (-ovc) + ' this month': '') + '.',
          amount: ovr
        })
      else
        ovr = 0;
      let stc = this._budget .getStartCashBalance();
      if (stc < -50 || stc > 50)
        list .push ({
          name:    'Starting Year Cash',
          amount:  stc,
          tooltip: 'Projecting that you will end the year with ' + Types .moneyDZ .toString (stc + una + ovr) + '.'
        });
      list .push ({name: 'Net Savings',          amount: sav + una + ovr + stc});
      list .push ({name: 'Savings Rate',         percent: (sav + una + ovr + stc) * 1.0 / (-inc)});
      updateView (list);
    }
    return update;
  }

  _addTopVariance (title, tooltip, choose, getAmount, flag) {
    let updateView = this._progressView .addProgressSidebarGroup(title, tooltip, flag);
    let update = varianceList => {
      let list = varianceList
        .filter (v => {return choose (v)})
        .map (v => {return {
          id:          v .cat._id,
          name:        v .cat .name,
          nameTooltip: this._budget .getCategories() .getPathname (v .cat) .slice (1) .join (' > '),
          amount:      getAmount (v)
        }})
        .sort ((a,b) => {return a .amount > b .amount? -1: a .amount == b .amount? 0: 1})
      updateView (list);
    }
    return update;
  }

  _addProgressSidebar (toHtml) {
    this._progressView .addProgressSidebar();
    let bigPictureUpdate = this._addBigPicture();
    let issuesUpdate = this._addTopVariance (
      'Budget Issues',
      'Top over-budget amounts coming into this month.',
      v => {return v .amount < -50}, v => {return - v .amount}, '_flagBad'
    );
    let savingsUpdate = this._addTopVariance (
      'Savings Opportunities',
      'Top unspent amounts coming into this month.',
      v => {return v .amount >  50}, v => {return  v .amount}, '_flagGood'
    );
    let futureUpdate = this._addTopVariance (
      'Upcoming Spending',
      'Top spending in future months this year.',
      v => {
        return v .amount > 50 && this._categories .getType (v .cat) != ScheduleType .YEAR
      }, v => {return  v .amount}, '_flagGood');
    let update = () => {
      let endOfLastMonth = Types .date .monthEnd (Types .date .addMonthStart (Types .date .today(), -1))
      let toLastMonthVar = this._variance .getVarianceList ([this._budget .getExpenseCategory()], {end: endOfLastMonth});
      let toTodayVar     = this._variance .getVarianceList ([this._budget .getExpenseCategory()], {end: Types .date .today()})
      let futureVar      = this._variance .getVarianceList ([this._budget .getExpenseCategory()], {start: Types .date .addMonthStart (Types .date .today(), 1)});
      bigPictureUpdate (toTodayVar);
      issuesUpdate     (toLastMonthVar);
      savingsUpdate    (toTodayVar);
      futureUpdate     (futureVar);
    }
    update();
    this._addUpdater (this._progressView, (e,m,i) => {
      update();
    })
  }




  /*****************/
  /**** HISTORY ****/

  /**
   * Get a budget data for root and its children
   *   returns {
   *     cols:   array of column headers
   *     dates:  date ranges for each column
   *     groups: [{
   *       name: name for this group
   *       rows: [{
   *         name:    name for this row
   *         id:      category id(s) for this row
   *         isCredit: true iff this is a credit amount
   *         amounts: array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */
  _getHistoryData (parentIds, date) {
    var defaultParents  = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    parentIds           = parentIds || (defaultParents .map (p => {return p._id}));
    var parents         = parentIds .map (pid => {return this._categories .get (pid)});
    // get historic amounts
    var historicAmounts = [];
    for (let budget of this._historicBudgets)
      if (budget .hasTransactions) {
        // get actual amount from transaction history
        historicAmounts .push (parents .map (parent => {
          let isCredit = this._budget .isCredit (parent);
          let isGoal   = this._budget .isGoal   (parent);
          let amounts = Array .from ((parent .children || []) .concat (parent .zombies || []) .reduce ((m,c) => {
              let a = this._actuals .getAmountRecursively (c, budget .start, budget .end) * (isCredit? -1: 1);
              let e = m .get (c .name);
              if (e) {
                e .amount += a;
              } else {
                m .set (c .name, {
                  id:       c._id,
                  name:     c .name,
                  sort:     c .sort,
                  isCredit: isCredit,
                  isGoal:   isGoal,
                  amount:   a
                })
              }
              return m;
            }, new Map()) .values())
          let parentAmount = this._actuals .getAmountRecursively (parent, budget .start, budget .end) * (isCredit? -1: 1);
          let otherAmount  = parentAmount - amounts .reduce ((t,a) => {return t + a .amount}, 0);
          if (otherAmount != 0)
            amounts .push ({
              name:     'Other',
              isCredit: isCredit,
              isGoal:   isGoal,
              amount:   otherAmount
            })
          return {
            id:      parent._id,
            name:    parent .name,
            amounts: amounts
          }
        }))
      } else {
        // get summary amount from history model
        let a = this._noTranAmounts
          .filter (e => {return e .budget == budget._id})
        historicAmounts .push (parents .map (parent => {
          let isCredit = this._budget .isCredit (parent);
          let isGoal   = this._budget .isGoal   (parent);
          let amounts  = a .filter (e => {return e .category .parent._id == parent._id}) .map (e => {return {
            id:       e .category._id,
            name:     e .category .name,
            sort:     e .category .sort,
            isCredit: isCredit,
            isGoal:   isGoal,
            amount:   e .amount
          }});
          let parentAmount = (a .find (e => {return e .category._id == parent._id}) || {}) .amount;
          if (parentAmount != null) {
            let otherAmount  = parentAmount - amounts .reduce ((t,a) => {return t + a .amount}, 0);
             if (otherAmount != 0)
              amounts .push ({
                name:     'Other',
                isCredit: isCredit,
                isGoal:   isGoal,
                amount:   otherAmount
              })
          }
          return {
            id:      parent._id,
            name:    parent .name,
            amounts: amounts
          }
        }))
      }
    // compute future budgets
    var budgets = [{
      name:  this._budget .getName(),
      start: this._budget .getStartDate(),
      end:   this._budget .getEndDate()
    }] .concat (this._budget .getFutureBudgets());
    var budgetAmounts = [];
    for (let budget of budgets) {
      var budgetAmount = [];
      budgetAmounts .push (budgetAmount);
      for (let parent of parentIds .map (pid => {return this._categories .get (pid)}) .filter (p => {return p})) {
        var amounts = []
        budgetAmount .push ({
          id:      parent._id,
          name:    parent .name,
          amounts: amounts
        });
        let isCredit = this._budget .isCredit (parent);
        let isGoal   = this._budget .isGoal   (parent);
        for (let cat of (parent .children || []))
          amounts .push ({
            id:       cat._id,
            name:     cat .name,
            sort:     cat .sort,
            isCredit: isCredit,
            isGoal:   isGoal,
            amount:   this._budget .getAmount (cat, budget .start, budget .end) .amount * (isCredit? -1: 1)
          });
        var parentAmount = this._budget .getAmount (parent, budget .start, budget .end) .amount * (isCredit? -1: 1);
        var otherAmount  = parentAmount - amounts .reduce ((t,a) => {return t + a .amount}, 0);
        if (otherAmount != 0)
          amounts .push ({
            name:     'Other',
            isCredit: isCredit,
            isGoal:   isGoal,
            amount:   otherAmount
          })
      }
    }
    // combine history and future and normalize to category name
    budgets       = this._historicBudgets .concat (budgets);
    budgetAmounts = historicAmounts .concat (budgetAmounts);
    budgetAmounts = budgetAmounts .map (ba => {
      return Array .from (ba .reduce ((m, a) => {
        let e = m .get (a .name);
        if (e)
          e .amounts = e .amounts .concat (a .amounts);
        else
          m .set (a .name, a);
        return m;
      }, new Map()) .values())
    })
    parentIds = Array .from (budgetAmounts .reduce ((s,ba) => {
      return ba .reduce ((s, a) => {
        if (a .id)
          s .add (a .id);
        return s;
      }, s)
    }, new Set));
    var cats = parentIds .map (pid => {
      return budgetAmounts
        .reduce ((map, budgetAmount) => {
          return (budgetAmount .find (ba => {return ba .id == pid}) || {amounts: []}) .amounts .reduce ((m,a) => {
            if (a .amount != 0) {
              var e = m .get (a .name);
              if (e) {
                if (!e .sort)
                  e .sort = a .sort;
              } else
                m .set (a.name, a);
            }
            return m;
          }, map)
        }, new Map());
    });
    // compute return values
    let result = this._filterHistoryBySlider ({
      cols:      budgets .map (b => {return b .name}),
      dates:     budgets .map (b => {return {start: b .start, end: b .end}}),
      highlight: this._historicBudgets .length,
      startBal:  (this._historicBudgets .sort ((a,b) => {return a.start<b.start? -1: 1}) [0] || {}) .startCashBalance || 0,
      groups: parentIds .map ((pid, i) => {
        for (let ba of budgetAmounts) {
          var parent = ba .find (as => {return as .id == pid && as .name});
          if (parent)
            break;
        }
        return {
          name: parent .name,
          rows: Array .from (cats [i] .values()) .sort ((a,b) => {return a.sort==null? 1: b.sort==null? -1: a.sort<b.sort? -1: 1}) .map (cat => {
            var ids = Array .from (budgetAmounts .reduce ((s,ba) => {
              return ba .reduce ((s,g) => {
                return g .amounts .reduce ((s,a) => {
                  if (a .name == cat .name)
                    s .add (a .id);
                  return s;
                }, s)
              }, s)
            }, new Set()));
            return {
              name:     cat .name,
              id:       ids,
              isCredit: cat .isCredit,
              isGoal:   cat .isGoal,
              amounts:  budgetAmounts .map (ba => {
                var group = ba .find (as => {return as .id == pid});
                if (group) {
                  var a = group .amounts .find (a => {return a .name == cat .name}) || {};
                  return {
                    id:    a .id,
                    value: a .amount || 0
                  }
                } else
                  return {value: 0}
              })
            }
          })
        }
      })
    })
    // filter by selected date range if any
    if (date) {
      let sc = result .dates .findIndex (r => {return r .start == date .start && r .end == date .end});
      result .cols  = [result .cols [sc]];
      result .dates = [result .dates [sc]];
      result .highlight = undefined;
      for (let g of result .groups)
        for (let r of g .rows)
          r .amounts = [r .amounts [sc]];
    }
    return result;
  }

  _budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, includeYearly, updateView) {
    var defaultRoots = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    if (model == 'SchedulesModel')
      this._updateHistoryView (parentIds, updateView);
  }

  _updateHistoryView (parentIds, updateView) {
    updateView ([{replace: this._getHistoryData (parentIds)}])
  }

  _filterHistoryBySlider (dataset) {
    let first = this._historySliderLeft || 0;
    let last  = this._historySliderRight? this._historySliderRight + 1: dataset .cols .length;
    dataset .cols  = dataset .cols .slice (first, last);
    dataset .dates = dataset .dates .slice (first, last);
    for (let g of dataset .groups)
      for (let r of g .rows)
        r .amounts = r .amounts .slice (first, last);
    dataset .highlight -= this._historySliderLeft || 0;
    return dataset;
  }

  _addHistorySlider (view, dataset, toHtml, leftValue, rightValue, graphUpdater, tableUpdater) {
    let cbi = dataset .cols .indexOf (this._budget .getName());
    if (cbi < 0)
      cbi = 0;
    view .addSlider ({
      left:  {min:   0,                       start: Math .max (cbi-5, 0)},
      right: {max:   dataset .cols .length-1, start: Math .min (cbi+5, dataset .cols .length-1)},
      keep:  {value: [cbi,cbi],               count: 2},
      onChange: (values, handle) => {
        this._historySliderLeft = Math .floor (values [0]);
        this._historySliderRight = Math .floor (values [1]);
        leftValue  .text (dataset .cols [this._historySliderLeft]);
        rightValue .text (dataset .cols [this._historySliderRight]);
        let rds = Object .assign ({}, dataset);
        rds .cols  = rds .cols . slice (this._historySliderLeft, this._historySliderRight + 1);
        rds .dates = rds .dates .slice (this._historySliderLeft, this._historySliderRight + 1);
        rds .groups = rds .groups .map (g => {
          g = Object .assign ({}, g);
          g .rows = g .rows .map (r => {
            r = Object .assign({}, r);
            r .amounts = r .amounts .slice (this._historySliderLeft, this._historySliderRight + 1);
            return r;
          });
          return g;
        });
        rds .highlight -= this._historySliderLeft;
        graphUpdater ([{filterCols: {start: this._historySliderLeft, end: this._historySliderRight}}]);
        tableUpdater ([{replace: rds}]);
      }
    }, toHtml)
  }

  _addNetworthSlider (view, dataset, toHtml, leftValue, rightValue, graphUpdater, tableUpdater) {
    let cbi = dataset .cols .indexOf (Types .dateMY .toString (this._budget .getEndDate())) - 1;
    if (cbi < 0)
      cbi = 0;
    view .addSlider ({
      left:     {min: 0,                       start: Math .max (cbi-5, 0)},
      right:    {max: dataset .cols .length-1, start: Math .min (cbi+10, dataset .cols .length-1)},
      keep:     {value: [cbi,cbi+1],           count: 2},
      onChange: (values, handle) => {
        this._netWorthSliderLeft = Math .floor (values [0]);
        this._netWorthSliderRight = Math .floor (values [1]);
        leftValue  .text (dataset .cols [this._netWorthSliderLeft]);
        rightValue .text (dataset .cols [this._netWorthSliderRight]);
        let rds = Object .assign ({}, dataset);
        rds .cols = rds .cols .slice (this._netWorthSliderLeft, this._netWorthSliderRight + 1);
        rds .rows = rds .rows .map (r => {
          r = Object .assign ({}, r);
          r .amounts = r .amounts .slice (this._netWorthSliderLeft, this._netWorthSliderRight + 1);
          return r;
        })
        rds .highlight -= this._netWorthSliderLeft;
        graphUpdater ([{filterCols: {start: this._netWorthSliderLeft, end: this._netWorthSliderRight}}]);
        tableUpdater ([{replace: rds}]);
      }
    }, toHtml)
  }

  _addHistoryGraph (parentIds, popup, position, view, dataset = this._getHistoryData(parentIds), toHtml) {
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        this._budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, false, updateView)
      });
      var updateView = view .addHistoryGraph (dataset, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml);
      return updateView;
    }
  }

  _addHistoryTable (parentIds, date, skipFoot, popup, position, view, dataset = this._getHistoryData (parentIds, date), toHtml) {
    dataset = Object .assign ({}, dataset);
    dataset .cols = dataset .cols .map (c => {return c .slice (-4)})
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        this._budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, true, updateView)
      });
      var updateView = view .addHistoryTable (dataset, dataset .cols .length == 1, skipFoot, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml);
      return updateView;
    }
  }





  /*******************/
  /**** NET WORTH ****/

  /**
   * returns {
   *   cols:    array of column names (budgets)
   *   rows: [{
   *      name:    account name
   *      amounts: array of amounts, one for each column
   *   }]
   * }
   */
  _getNetWorthData() {
  var accounts  = [
      [AccountType .PENSION,    'Pension'],
      [AccountType .RRSP,       'RRSP'],
      [AccountType .RESP,       'RESP'],
      [AccountType .TFSA,       'TFSA'],
      [AccountType .INVESTMENT, 'Non-Registered Investments'],
      [AccountType .HOME,       'Home'],
      [AccountType .MORTGAGE,   'Mortgage']
    ];
    var order = accounts .map (a => {return a[0]});
    var param  = this._rates;
    var hisBud = this._historicBudgets;
    var futBud = this._budget .getFutureBudgets();
    var his    = this._historicBalances;
    return {
      cols: hisBud
        .map    (b => {return Types .dateMY. toString (b .end)})
        .concat (Types .dateMY .toString (this._budget .getEndDate()))
        .concat (futBud .map (b => {return Types .dateMY .toString (b .end)})),
      highlight: hisBud .length,
      rows: Array .from (
        this._accounts .getAccounts()
        .filter (a => {return order .includes (a .type)})
        .sort   ((a,b) => {
          var as = order .indexOf (a .type);
          var bs = order .indexOf (b .type);
          return as<bs? -1: as>bs? 1: a.sort<b.sort? -1: a.sort>b.sort? 1: 0;
        })
        .map (a => {
          var sign = a .creditBalance? 1: -1;
          var cat  = a .category && this._categories .get (a .category);
          var dis  = a .disCategory && this._categories .get (a .disCategory);
          var stb  = a .balance * sign || 0;
          var bal  = stb;
          var yrs  = [{start: Types .dateDMY .today(), end: this._budget .getEndDate()}] .concat (futBud);
          var amt  = [];
          for (let yr of yrs) {
            for (let st = yr .start; st <= yr .end; st = Types .dateDMY .addMonthStart (st, 1)) {
              var ba   = cat? (this._budget .getAmount (cat, st, Types .dateDMY .monthEnd (st)) .month || {}) .amount || 0 : 0;
              var rate = ((a .apr || param .apr) - (param .presentValue? param .inflation: 0))
              var bal  = bal * (1 + rate / 3650000 * Types .dateDMY .daysInMonth (st)) + ba;
            }
            bal += cat? (this._budget .getAmount (cat, yr .start, yr .end) .year || {}) .amount || 0 : 0;
            bal += dis? (this._budget .getAmount (dis, yr .start, yr .end) .year || {}) .amount || 0 : 0;
            bal  = Math .round (bal);
            amt .push (bal);
          }
          var amounts = hisBud
            .map (b => {return (his .find (h => {return h .account == a._id && h .budget == b._id}) || {}) .amount * sign})
            .concat (amt);
          return {
            name:    a .name,
            type:    a .type,
            curBal:  stb,
            amounts: amounts
          }
        })
        .reduce ((m,e) => {
          var typeValue = m .get (e .type) || {curBal: 0, amounts: []};
          m .set (e .type, {
            curBal:  e .curBal + typeValue .curBal,
            amounts: e .amounts .map ((a,i) => {return (a || 0) + (typeValue .amounts [i] || 0)})
          })
          return m;
        }, new Map())
        .entries())
        .map (e => {
          return {
            name:    accounts .find (a => {return a[0] == e[0]}) [1],
            type:    e [0],
            curBal:  e [1] .curBal,
            amounts: e [1] .amounts
          }
        })
        .filter (e => {return e .amounts .reduce ((s,a) => {return s+a}) != 0})
    }
  }

  _addNetWorthGraph (view, dataset, toHtml) {
    var homeTypes = [AccountType .HOME, AccountType .MORTGAGE];
    dataset = {
      cols:      dataset .cols .map (c => {return c}),
      rows:      dataset .rows .map (r => {r = Object .assign ({}, r); r .amounts = r .amounts .map (a => {return a}); return r}),
      highlight: {
        column:          dataset .highlight,
        percentComplete:
          (Types .date .subDays (Types .date .today(), this._budget .getStartDate()) + 1) /
          (Types .date .subDays (this._budget .getEndDate(), this._budget .getStartDate()) + 1)
      }
    }
    var equity = dataset .rows .reduce ((s,r) => {
      return homeTypes .includes (r.type)? r .amounts .map ((a,i) => {return (s [i] || 0) + a}): s
    }, [])
    var curEquity = dataset .rows .reduce ((s,r) => {
      return homeTypes .includes (r .type)? r .curBal + s: s
    }, 0);
    dataset .rows = dataset .rows
      .filter (r => {return ! homeTypes .includes (r .type)})
      .concat ({
        name:   'Home Equity',
        curBal:  curEquity,
        amounts: equity
      });
    let updater = this._addUpdater (view, (eventType, model, ids) => {
      if (['Accounts', 'ActualsModel', 'BalanceHistory'] .includes (model))
        updateView();
    })
    let updateView = view .addNetWorthGraph (dataset, toHtml, () => {
      this._deleteUpdater (view, updater);
    });
    return updateView;
  }

  _addNetWorthTable (view, dataset, toHtml) {
    let updater = this._addUpdater (view, (eventType, model, ids) => {
      if (['Accounts', 'ActualsModel', 'BalanceHistory'] .includes (model))
        updateView();
    })
    let updateView = view .addNetWorthTable (dataset, toHtml, () => {
      this._deleteUpdater (view, updater);
    });
    return updateView;
  }




  /**********************/
  /**** OTHER THINGS ****/

  _addBudgetYearTotalsGraph (toView, toHtml) {
    toView .addBudgetYearGraph (this._budget, toHtml);
  }


  _addUpdater (view, updater) {
    (this._updaters .get (view) || (this._updaters .set (view, []) .get (view))) .push (updater);
    return updater;
  }

  _deleteUpdater (view, updater) {
    this._updaters .set (view, (this._updaters .get (view) || []) .filter (u => {return u != updater}));
  }

  _clearUpdatersForView (view) {
    this._updaters .set (view, []);
  }

  _update (eventType, model, ids, doc, arg) {
    for (let view of this._updaters .keys()) {
      if (!view || !view .isVisible || view .isVisible()) {
        for (let updater of this._updaters .get (view))
          updater (eventType, model, ids, doc, arg);
      } else
        view .resetHtml();
    }
  }






  /**************************/
  /***** STATIC METHODS *****/

  static showActualMonthGraph (id, month, html, position, includeMonths=true, includeYears=true) {
    if (NavigateInstance)
      NavigateInstance._addMonthsGraph ('_activityMonthsGraph', NavigateInstance._progressView, [id], true, position, html, includeMonths, includeYears, []);
  }
  static showBudgetMonthGraph (id, month, html, position, includeMonths=true, includeYears=true) {
    if (NavigateInstance)
      NavigateInstance._addMonthsGraph ('_budgetMonthsGraph', NavigateInstance._progressView, [id], true, position, html, includeMonths, includeYears, []);
  }
}

var NavigateInstance;

const NavigateValueType = {
  BUDGET:            0,
  BUDGET_YR_AVE:     1,
  BUDGET_YR_AVE_ACT: 2,
  ACTUALS:           3,
  ACTUALS_BUD:       4,
}
