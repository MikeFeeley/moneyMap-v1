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
      this._addProgressGraphs ();
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

  *_aph() {
    this._clearUpdatersForView           (this._perspectiveView);
    var ds = yield* this._getHistoryData ();
    yield* this._addHistoryGraph         (undefined, undefined, undefined, this._perspectiveView, ds);
    yield* this._addHistoryTable         (undefined, undefined, undefined, undefined, this._perspectiveView, ds);
  }

  *addPerspectiveHtml (toHtml) {
    this._perspectiveView = new NavigateView (this._accounts, this._variance);
    this._perspectiveView .addObserver       (this, this._onViewChange);
    this._perspectiveView .addHtml (toHtml, () => {async (this, this._aph) ()})
  }

  *_anwh() {
    this._clearUpdatersForView            (this._newWorthView);
    var ds = yield* this._getNetWorthData ();
    this._addNetWorthGraph                (this._newWorthView, ds);
    this._addNetWorthTable                (this._newWorthView, ds);
  }

  *addNetWorthHtml (toHtml) {
    this._newWorthView = new NavigateView (this._accounts, this._variance);
    this._newWorthView .addObserver       (this, this._onViewChange);
    this._newWorthView .addHtml           (toHtml, () => {async (this, this._anwh) ()})
  }

  _onModelChange (eventType, doc, arg, source, model) {
    var modelName = model .constructor .name;
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
    this._update (eventType, modelName, ids);
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

    } else if (eventType == NavigateViewEvent .BUDGET_CHART_CLICK  && arg .id) { 
      /* Yearly Chart (Budget or Actual) */
      if (arg .altClick) {
        let name     = arg .name .includes ('budget')? '_budgetMonthsGraph': '_activityMonthsGraph';
        let html     = arg .html .closest (arg .name .includes ('budget')? '._budgetCharts' : '._activityCharts')
        let position = {top: arg .position .top}
        position [arg .direction == 1? 'left': 'right'] = 0;
        this._addMonthsGraph (name, arg .view, [arg .id], true, position, html);
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
        } else
          this._addMonthsGraph (arg .name, arg .view, [arg .id], true, arg .position, arg .html, im, iy, sel && sel .addCats);
      } else if (arg .name == '_budgetHistoryGraph' && arg .id .length >= 1 && arg .id [0]) {
        async (this, this._addHistoryGraph) ([] .concat (arg .id), true, arg .position, arg .view);
      }

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_TITLE_CLICK && arg .id) {
      BudgetProgressHUD .show (arg .id .split ('_') .slice (-1) [0], arg .html, arg .position, this._accounts, this._variance);
    } else if (eventType == NavigateViewEvent .BUDGET_TABLE_CLICK && arg .id) {
      /* Monthly or History Table (Budget or Actual */
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
        async (this, this._addHistoryTable) ([] .concat (arg .id), true, true, arg .position, arg .view);

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
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE:
        return ((this._categories .get (id .split ('_') .slice (-1) [0]) || {}) .children || []) .map (c => {return c._id});

      case NavigateValueType .ACTUALS:
        if (id .includes ('other_') || id .includes ('payee_'))
          return []
        else {
          let cat           = this._categories .get (id .split ('_') .slice (-1) [0]);
          let children      = cat .children || [];
          let payeeTruncate = /\d|#|\(/;
          if (children .length == 0) {
            return this._actuals .getTransactions (cat, this._budget .getStartDate(), this._budget .getEndDate())
              .map (t => {
                let stop = t .payee .match (payeeTruncate);
                return (stop && stop .index? t .payee .slice (0, stop .index): t .payee) .split (' ') .slice (0,3) .join (' ');
              })
              .sort   ((a,b)   => {return a<b? -1: a==b? 0: 1})
              .filter ((p,i,a) => {return i==0 || ! p .startsWith (a [i-1])})
              .map    (p       => {return 'payee_' + p + '_' + cat._id})
          } else
            return children .map (c => {return c._id});
          }
    }
  }

  _getAmounts (type, id, isCredit, dates, includeMonths, includeYears, addCats) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE:
        let cat     = this._categories .get (id .split ('_') .slice (-1) [0]);
        let amounts = dates .map (date => {
          let a = this._budget .getAmount (cat, date .start, date .end);
          return {
            id:    cat._id,
            value: (a .month && a .month .amount || 0) * (isCredit? -1: 1)
          }
        });
        if (dates .length == 12 || dates .length == 0) {
          let yrAmount = this._budget .getAmount (cat, this._budget .getStartDate(), this._budget .getEndDate());
          amounts .push ({
            id:    cat._id,
            value: (yrAmount .year && yrAmount .year .amount || 0) * (isCredit? -1: 1)
          })
        }
        if (type == NavigateValueType .BUDGET_YR_AVE)
          amounts [amounts .length -1] .value /= 12;
        return amounts;

      case NavigateValueType .ACTUALS:
        if (id .includes ('payee_')) {
          let ida   = id .split ('_');
          let cat   = this._categories .get (ida .slice (-1) [0]);
          let payee = ida .slice (-2) [0];
          return dates .map (date => {return {
            id:    id,
            value: this._actuals .getTransactions (cat, date .start, date .end)
                     .filter (t     => {return t .payee .startsWith (payee)})
                     .reduce ((s,t) => {return s - (t .credit || 0) + (t .debit || 0)}, 0)
          }})
        } else {
          let isOther = id .includes ('other_');
          let cat     = this._categories .get (id .split ('_') .slice (-1) [0]);
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
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE:
        return - this._budget .getAmount (
          this._budget .getIncomeCategory(), this._budget .getStartDate(), this._budget .getEndDate()
        ) .amount

      case NavigateValueType .ACTUALS:
        return - this._actuals .getAmountRecursively (
          this._budget .getIncomeCategory(), this._budget .getStartDate(), this._budget .getEndDate()
        )
    }
  }

  _getName (type, id) {
    let catName = this._categories .get (id .split ('_') .slice (-1) [0]) .name;
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE:
        return (id .includes ('other_')? 'Other ': '') + catName

      case NavigateValueType .ACTUALS:
        let ida = id .split ('_');
        return id .includes ('payee_')? ida .slice (-2) [0]: (id .includes ('other_')? 'Other ': '') + catName
    }
  }

  _getNote (type, id, includeMonths, includeYears) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE:
        return '';

      case NavigateValueType .ACTUALS:
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
    }
  }

  _getChildrenData (type, id, dates, allowLeaf, includeMonths, includeYears, addCats) {
    let isLeaf = (id .includes ('other_') || id .includes ('payee_') || this._getChildren (type, id) == 0);
    if (isLeaf && (! allowLeaf || id .includes ('leaf_')))
      return []
    else {
      let cat        = this._categories .get (id .split ('_') .slice (-1) [0]);
      let isCredit   = this._budget .isCredit (cat);
      let isGoal     = this._budget .isGoal   (cat);
      let children   = this._getChildren (type, id);
      let rows       = ((children .length && children) || [id])
        .map (child => {return {
          name:     this._getName (type, child) || '',
          id:       child,
          isCredit: isCredit,
          isGoal:   isGoal,
          isYear:   includeMonths != includeYears? this._categories .getType (this._categories .get (child .split ('_') .slice (-1) [0])) == ScheduleType .YEAR: undefined,
          amounts:  this._getAmounts (type, child, isCredit, dates, includeMonths, includeYears, addCats)
        }});
      if (! id .includes ('other_')) {
        let totals = rows .reduce ((t,r) => {return r .amounts .map ((a,i) => {return (t[i] || 0) + a .value})}, []);
        rows .push ({
          name:     'Other',
          id:       'other_' + cat._id,
          isCredit: isCredit,
          isGoal:   isGoal,
          amounts:  this._getAmounts (type, id, isCredit, dates, includeMonths, includeYears, addCats) .map ((a,i) => {
            return {id: 'other_' + cat._id, value: a .value - (totals [i] || 0)
          }})
        })
      }
      rows = rows .filter (r => {return r .amounts .reduce ((s,a) => {return s + a .value}, 0) != 0})
      if (rows .length == 1 && (rows [0] .id .includes ('other_') || this._getChildren (type, rows [0] .id) == 0))
        rows [0] .id = 'leaf_' + rows [0] .id;
      return rows
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
    includeMonths,
    includeYears,
    addCats
  ) {
    var st     = this._budget .getStartDate();
    if (!dates) {
      var dates  = [];
      while (st <= this._budget .getEndDate()) {
        dates .push ({start: st, end: Types .dateMY .monthEnd (st)});
        st = Types .dateMY .addMonthStart (st, 1);
      }
    } else
      dates = [] .concat (dates);
    var months = dates .length;
    var cols   = dates .map (d => {return Types .dateM .toString (d .start)});
    if (dates .length == 12 || dates .length == 0) {
      if (type == NavigateValueType .BUDGET)
        cols .push ('Yr');
      else if (type == NavigateValueType .BUDGET_YR_AVE)
        cols .push ('Yr Ave')
    }
    var groups = ids
      .map (id => {
        return {
          id:   id,
          name: this._getName         (type, id),
          note: this._getNote         (type, id, includeMonths, includeYears),
          rows: this._getChildrenData (type, id, dates, allowLeaf, includeMonths, includeYears, addCats),
        }
      })
    return {
      cols:      cols,
      dates:     dates,
      months:    months,
      groups:    groups,
      startBal:  this._budget .getStartCashBalance(),
      highlight: cols .length > 1? cols .indexOf (Types .dateM .toString (Types .dateMY .today())): null,
      income:    this._getIncome (type),
      getUpdate: (eventType, model, eventIds) => {
        let tooDetailedForUpdate = groups .find (g => {return g .rows .find (r => {return r .id .includes ('payee_')})});
        if (this._getModels (type) .includes (model)) {
          if (eventType == ModelEvent .UPDATE && eventIds .length == 1 && ! tooDetailedForUpdate) {
            for (let id of ids) {
              if (id == eventIds [0]) {
                let rows  = this._getChildrenData (type, id, dates, allowLeaf, getChildren, getAmounts, getName, includeMonths, includeYears, addCats);
                let group = groups [ids .indexOf (id)];
                let other = rows [rows .length - 1];
                if (other .id .includes ('other_') && group .rows [group .rows .length - 1] .id .includes ('other_')) {
                  group .rows [group .rows .length -1] = other;
                  return {update: {id: other .id , name: other .name, amounts: other .amounts}}
                } else if (other .id .includes ('other_') == group .rows [rows .length - 1] .id .includes ('other_'))
                  return {}
              } else {
                let affected = this._getChildren (type, id) .find (childId => {
                  let child = this._categories .get (childId .split ('_') .slice (-1) [0])
                  return childId == eventIds [0] || this._categories .getDescendants (child) .find (d => {return d._id == eventIds [0]})
                })
                if (affected) {
                  let isCredit = this._budget .isCredit (this._categories .get (affected .split ('_') .slice (-1) [0]))
                  return {update: {id: affected, name: getName (affected), amounts: this._getAmounts (type, affected, isCredit, dates, includeMonths, includeYears, addCats)}}
                }
              }
            }
          }
          return {replace: this._getData (type, dates, ids, allowLeaf, includeMonths, includeYears, addCats)}
        }
      }
    }
  }

  /**
   * Add GRAPH (either budget or actual) showing children of specifie root list
   */
  _addMonthsGraph (name, view, ids, popup, position, toHtml, includeMonths, includeYears, addCats) {
    var dataset = this._getData (name .includes ('budget')? NavigateValueType .BUDGET_YR_AVE: NavigateValueType .ACTUALS, null, ids, true, includeMonths, includeYears, addCats);
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
  _addMonthsTable (name, view, ids, dates, skipFoot, popup, position, toHtml, col) {
    var dataset = this._getData (name .includes ('budget')? NavigateValueType .BUDGET: NavigateValueType .ACTUALS, dates, ids, false);
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        let update = dataset .getUpdate (eventType, model, ids);
        if (update)
          updateView (update);
      });
      var updateView = view .addBudgetTable (name, dataset, dates, skipFoot, popup, position, toHtml, () => {
        this._deleteUpdater (view, updater);
      }, ! dates);
    }
  }






  /***************************************/
  /**** YEARLY BUDGET OR ACTUAL GRAPH ****/

  _getYearData (type, id, blackouts) {
    var dates = [{start: this._budget .getStartDate(), end: this._budget .getEndDate()}];
    var data  = this._getChildrenData (type, id, dates);
    if (blackouts) {
      var boAmts  = blackouts .map (b => {return this._getAmounts (type, b._id, this._budget .isCredit (b), dates) [0]});
      var amts    = data .reduce ((s,c) => {return s + c .amounts[0] .value}, 0);
      var unalloc = Math .max (0, boAmts [0] .value - boAmts [1] .value - amts);
      data .push ({
        id:      'unallocated_' + id,
        name:    'Unallocated',
        amounts: [{id: 'unallocated_' + id, value: unalloc}]
      });
      data .push ({
        id:       'blackout_' + boAmts [1] .id,
        name:     blackouts [1] .name,
        amounts:  [boAmts [1]],
        blackout: true
      });
    }
    return {
      name: this._categories .get (id .split ('_') .slice (-1) [0]) .name,
      cats: data .map (c => {return {
        id:       c .id,
        name:     c .name,
        amount:   c .amounts [0] .value,
        blackout: c .blackout
      }})
    }
    return ;
  }

  _addYearCategoriesGraph (name, id, blackouts, view, popup, position, direction) {
    if (! id .includes ('_')) {
      var type = name == '_budgetChart'? NavigateValueType .BUDGET: NavigateValueType .ACTUALS;
      var data = this._getYearData (type, id, blackouts);
      if (data .cats .length && (data .cats .length > 1 || ! data .cats [0] .id .includes ('leaf_')))
        view .addDoughnut (data, name, popup, position, direction, () => {

        });
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
      this._addProgressGraph (root, 'bottom', false, undefined, labelWidth, true, true, true)
  }






  /*****************/
  /**** HISTORY ****/

  /**
   * Get a budget data for root and its children
   *   returns {
   *     cols:   array of column headers
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
  *_getHistoryData (parentIds) {
    yield* this._actuals .findHistory ();
    var defaultParents  = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    parentIds           = parentIds || (defaultParents .map (p => {return p._id}));
    var parents         = parentIds .map (pid => {return this._categories .get (pid)});
    // get historic amounts
    var historicBudgets = yield* this._budget  .getHistoricBudgets();
    var noTranAmounts   = yield* this._history .find();
    var historicAmounts = [];
    for (let budget of historicBudgets)
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
        let a = noTranAmounts
          .filter (e => {return e .budget == budget._id})
          .map    (e => {e .category = this._categories .get (e .category); return e})
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
    budgets       = historicBudgets .concat (budgets);
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
    return {
      cols:      budgets .map (b => {return b .name}),
      highlight: historicBudgets .length,
      startBal:  (historicBudgets .sort ((a,b) => {return a.start<b.start? -1: 1}) [0] || {}) .startCashBalance || 0,
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
    }
  }

  _budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, includeYearly, updateView) {
    var defaultRoots = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    if (model == 'SchedulesModel')
      async (this, this._updateHistoryView) (parentIds, updateView);
  }

  *_updateHistoryView (parentIds, updateView) {
    updateView ({replace: yield* this._getHistoryData (parentIds)})
  }

  *_addHistoryGraph (parentIds, popup, position, view, dataset, toHtml) {
    dataset = dataset || (yield* this._getHistoryData (parentIds));
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        this._budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, false, updateView)
      });
      var updateView = view .addHistoryGraph (dataset, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml);
    }
  }

  *_addHistoryTable (parentIds, skipFoot, popup, position, view, dataset, toHtml) {
    dataset = dataset || (yield* this._getHistoryData (parentIds));
    dataset .cols = dataset .cols .map (c => {return c .slice (-4)})
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, (eventType, model, ids) => {
        this._budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, true, updateView)
      });
      var updateView = view .addHistoryTable (dataset, skipFoot, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml);
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
  *_getNetWorthData() {
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
    var param  = (yield* this._parameters .find ({name: 'rates'})) [0] || {apr: 0, inflation: 0, presentValue: false};
    var hisBud = yield* this._budget .getHistoricBudgets();
    var futBud = this._budget .getFutureBudgets();
    var his    = yield* this._balances .find ();
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
      cols: dataset .cols,
      rows: dataset .rows
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
  }

  _addNetWorthTable (view, dataset, toHtml) {
    let updater = this._addUpdater (view, (eventType, model, ids) => {
      if (['Accounts', 'ActualsModel', 'BalanceHistory'] .includes (model))
        updateView();
    })
    let updateView = view .addNetWorthTable (dataset, toHtml, () => {
      this._deleteUpdater (view, updater);
    });
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

  _update (eventType, model, ids) {
    for (let vu of this._updaters .values())
      for (let updater of vu)
        updater (eventType, model, ids);
  }

}

const NavigateValueType = {
  BUDGET:        0,
  BUDGET_YR_AVE: 1,
  ACTUALS:       2,
}
