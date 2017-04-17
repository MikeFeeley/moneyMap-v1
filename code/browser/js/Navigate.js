class Navigate {
  constructor (accounts, variance) {
    this._accounts           = accounts;
    this._variance           = variance;
    this._actuals            = variance .getActuals();
    this._budget             = variance .getBudget();
    this._categories         = this._budget .getCategories();
    this._view               = new NavigateView (accounts, variance);
    this._updaters           = [];
    this._history            = new HistoryModel (this._variance);
    this._balances           = new Model ('balanceHistory');
    this._parameters         = new Model ('parameters');
    this._varianceObserver   = this._variance   .addObserver (this, this._onModelChange);
    this._historyObserver    = this._history    .addObserver (this, this._onModelChange);
    this._balancesObserver   = this._balances   .addObserver (this, this._onModelChange);
    this._parametersObserver = this._parameters .addObserver (this, this._onModelChange);
    this._view .addObserver (this, this._onViewChange);
  }

  delete() {
    this._variance   .deleteObserver (this._varianceObserver);
    this._history    .deleteObserver (this._historyObserver);
    this._balances   .deleteObserver (this._balancesObserver);
    this._parameters .deleteObserver (this._parametersObserver);
    this._history    .delete();
    this._balances   .delete();
    this._parameters .delete();
  }

  _onModelChange (eventType, doc, arg, source, model) {
    if (! this._view .updateHandledLazily()) {
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
      }
      this._update (eventType, modelName, ids);
    }
  }

  _onViewChange (eventType, arg) {
    if (eventType == NavigateViewEvent .MADE_VISIBLE && !this._view .hasHtml() && this._toHtml)
      async (this, this .addHtml) (this._toHtml);
    else if (eventType == NavigateViewEvent .PROGRESS_GRAPH_CLICK && arg .id) {
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
        if (! this._addProgressGraph (root, arg .html, true, arg .position, undefined, im, ! im))
          BudgetProgressHUD .show (root._id, arg .html, arg .position, this._accounts, this._variance);
      } else {
        var today = Types .dateMY .today();
        var dates  = {
          start: Types .dateMY .monthStart (today),
          end:   Types .dateMY .monthEnd   (today)
        }
        var sel = arg .data .find (d => {return d._id == arg .id});
        if (arg .position .left)
          arg .position .left += Math .min (0, $(document) .width() - (arg .html .offset() .left + arg .position .left + 1000));
        TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, arg .position, ! sel .isYear, sel .isYear, sel .addCats);
      }
    } else if (eventType == NavigateViewEvent .BUDGET_CHART_CLICK  && arg .id && isNaN (arg .id)) {
      if (arg .altClick) {
        if (arg .name == '_budgetChart') {
          var position = {top: arg .position .top, left: Math .max (0, arg .position .left - 200)}
          BudgetProgressHUD .show (arg .id, arg .html, position, this._accounts, this._variance);
        } else {
          var today = Types .dateMY .today();
          var dates  = {
            start: Types .dateMY .monthStart (today),
            end:   Types .dateMY .monthEnd   (today)
          }
          var position = {top: arg. position .top, left: Math .max (0, arg .position .left - 750)};
          TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, position);
        }
      } else
        this._addYearCategoriesGraph (arg .name, this._categories .get (arg .id), null, true, arg .position, arg .direction);
    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_CLICK && arg .id) {
      if (['_budgetMonthsGraph', '_activityMonthsGraph'] .includes (arg .name) && isNaN (arg .id))
        if (arg .altClick) {
          var today = Types .date .today();
          var dates = {};
          dates .start = arg .labelIndex < 12? Types .date .addMonthStart (this._budget .getStartDate(), arg .labelIndex) : Types .date .monthStart (today);
          dates .end   = Types .date .monthEnd (dates .start);
          if (arg .name == '_budgetMonthsGraph') {
            var position = {top: arg .position .top, left: Math .max (0, arg .position .left + 200)}
            BudgetProgressHUD .show (arg .id, arg .html, position, this._accounts, this._variance, arg .labelIndex < 12? dates .end: undefined);
          } else {
            var position = {top: arg. position .top, left: Math .max (0, arg .position .left - 750)};
            TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, position);
          }
        } else
          this._addMonthsGraph (arg .name, [this._categories .get (arg .id)], true, arg .position);
      else if (arg .name == '_budgetHistoryGraph')
        async (this, this._addHistoryGraph) ([] .concat (arg .id), true, arg .position);
    } else if (eventType == NavigateViewEvent .BUDGET_TABLE_CLICK && arg .id && isNaN (arg .id)) {
      if (['_budgetTable', '_activityTable'] .includes (arg .name)) {
        if (arg .altClick) {
          var today    = Types .date .today();
          var dates    = {}
          dates .start = arg .col && arg .col <= 12? Types .date .addMonthStart (this._budget .getStartDate(), arg .col -1) : Types .date .monthStart (today);
          dates .end   = Types .date .monthEnd (dates .start);
          switch (arg .name) {
            case '_budgetTable':
              BudgetProgressHUD .show (arg .id, arg .html, arg .position, this._accounts, this._variance, arg .col && arg .col <= 12? dates .end: undefined);
              break;
            case '_activityTable':
              TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, arg .position);
              break;
          }
        } else
          this._addMonthsTable (arg .name, [this._categories .get (arg .id)], true, true, arg .position);
      } else if (arg .name == '_budgetHistoryTable') {
      console.log (arg);
        async (this, this._addHistoryTable) ([] .concat (arg .id), true, true, arg .position);
      }
    } else if (eventType == NavigateViewEvent .PROGRESS_GRAPH_TITLE_CLICK && arg .data .length) {
      var id = this._categories .get (arg .data [0]._id) .parent ._id;
      BudgetProgressHUD .show (id, arg .html, arg .position, this._accounts, this._variance);
    }
  }

  _addBudgetYearTotalsGraph (toHtml) {
    this._view .addBudgetYearGraph (this._budget, toHtml);
  }

  /**
   * Get data for root and its children
   *   returns {
   *     cols:   array of column headers
   *     months: number of months (for computing average)
   *     income: total income
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
  _getData (roots, getAmounts, getIncome, model, dates, includeYearly) {
    var months = dates .length;
    var cols   = dates .map (d => {return Types .dateM .toString (d .start)});
    if (includeYearly)
      cols .push ('Yr');
    var groups      = [];
    var defaultRoots = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    for (let root of roots || defaultRoots) {
      var rows = [];
      var cats = root .children || [];
      for (let cat of cats .sort ((a,b) => {return a .sort < b .sort? -1: 1})) {
        rows .push ({
          name:     cat .name || '',
          id:       cat._id,
          isCredit: this._budget .isCredit (cat),
          isGoal:   this._budget .isGoal   (cat),
          amounts:  getAmounts (cat, dates, includeYearly)
        });
      }
      var other = (getAmounts (root, dates, includeYearly)) .map ((rt, i) => {
        return {value: rt .value - rows .reduce ((t,rw) => {return t + rw .amounts [i] .value}, 0)}
      });
        rows .push ({
          name: 'Other',
          id:    99,
          isCredit: this._budget .isCredit (root),
          isGoal:   this._budget .isGoal   (root),
          amounts:  other
        })
      groups .push ({name: root .name, rows: rows .filter (r => {return r .amounts .find (a => {return a != 0})})});
    }
    return {
      cols:       cols,
      dates:      dates,
      months:     months,
      startBal:   this._budget .getStartCashBalance(),
      highlight:  cols .indexOf (Types .dateM .toString (Types .dateMY .today())),
      income:     getIncome(),
      groups:     groups,
      model:      model,
      getIncome:  getIncome,
      getAmounts: getAmounts
    }
  }

  _getBudgetData (roots, includeYearly) {
    var st     = this._budget .getStartDate();
    var dates  = [];
    while (st <= this._budget .getEndDate()) {
      dates .push ({start: st, end: Types .dateMY .monthEnd (st)});
      st = Types .dateMY .addMonthStart (st, 1);
    }
    var getAmounts = cat => {
      var amounts = [];
      for (let date of dates) {
        var amount = this._budget .getAmount (cat, date .start, date .end);
        amounts .push ({
          id:    cat._id,
          value: (amount .month && amount .month .amount || 0) * (this._budget .isCredit (cat)? -1: 1)
        });
      }
      if (includeYearly) {
        var amount = this._budget .getAmount (cat, this._budget .getStartDate(), this._budget .getEndDate());
        amounts .push ({
          id:    cat._id,
          value: (amount .year && amount .year .amount || 0) * (this._budget .isCredit (cat)? -1: 1)
        });
      }
      return amounts;
    }
    var getIncome  = () => {
      return - this._budget .getAmount (
        this._budget .getIncomeCategory(), this._budget .getStartDate(), this._budget .getEndDate()
      ) .amount
    }
    return this._getData (roots, getAmounts, getIncome, 'SchedulesModel', dates, includeYearly);
  }

  _tableUpdater (eventType, model, ids, dataset, roots, includeYearly, updateView) {
    var defaultRoots = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    if (model == dataset .model) {
      if (eventType == ModelEvent .UPDATE)
        for (let id of ids) {
          for (let root of roots || defaultRoots) {
            var affectedCat = (root .children || []) .find (cat => {
              return cat._id == id || this._categories .getDescendants (cat) .find (d => {return d._id == id})
            });
            if (affectedCat)
              break;
          }
          if (affectedCat)
            updateView ({update: {
              id:       affectedCat._id,
              name:     affectedCat .name,
              amounts:  dataset .getAmounts (affectedCat, dataset .dates, true)
            }})
        }
      else
        updateView ({replace: this._getData (roots, dataset .getAmounts, dataset .getIncome, dataset .model, dataset .dates, includeYearly)});
    }
  }

  _addMonthsGraph (name, roots, popup, position, dataset, toHtml) {
    if (! dataset) {
      if (name == '_budgetMonthsGraph')
        dataset = this._getBudgetData (roots, true);
      else if (name == '_activityMonthsGraph')
        dataset = this._getActualsData (roots);
    }
    if (dataset .cols .length == 13)
      dataset = {
        cols:     dataset .cols .slice (0, -1) .concat ('Yr Ave'),
        dates:    dataset .dates,
        startBal: dataset .startBal,
        groups:   dataset .groups .map (g => {
          return {
            name: g .name,
            rows: g. rows .map (r => {
              return {
                name:    r.name, id: r.id, isCredit: r.isCredit, isGoal: r.isGoal,
                amounts: r. amounts .slice (0, -1) .concat ({
                  id:    r .id,
                  value: r. amounts [r. amounts .length -1] .value / 12
                })
              }
            })
          }
        })
      }
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater ((eventType, model, ids) => {
        this._tableUpdater (eventType, model, ids, dataset, roots, false, updateView)
      });
      var updateView = this._view .addMonthsGraph (name, dataset, popup, position, () => {
        this._deleteUpdater (updater);
      }, toHtml);
    }
  }

  _addMonthsTable (name, roots, skipFoot, popup, position, dataset, toHtml) {
    if (! dataset) {
      if (name == '_budgetTable')
        dataset = this._getBudgetData (roots, true);
      else if (name == '_activityTable')
        dataset = this._getActualsData (roots);
    }
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater ((eventType, model, ids) => {
        this._tableUpdater (eventType, model, ids, dataset, roots, true, updateView)
      });
      var updateView = this._view .addBudgetTable (name, dataset, skipFoot, popup, position, () => {
        this._deleteUpdater (updater);
      }, true, toHtml);
    }
  }

  _getYearData (root, blackouts, getAmount, model) {
    var start = this._budget .getStartDate();
    var end   = this._budget .getEndDate();
    var cats = (root .children || []) .map (cat => {
      return {
        name:   cat .name || '',
        id:     cat._id,
        amount: getAmount (cat)
      }
    }) .filter (c => {return c .amount > 0})
    var other = getAmount (root) - cats .reduce ((t,c) => {return t + c .amount}, 0);
    if (other != 0) {
      cats .push ({
        name: 'Other',
        id:   99,
        amount: other
      })
    }
    if (blackouts) {
      var amounts = blackouts .map (b => {return getAmount (b)});
      var catAmts = cats .reduce ((s,c) => {return s + c .amount}, 0);
      var unalloc = Math .max (0, amounts [0] - amounts [1] - catAmts);
      var other   = amounts [1];
      cats .push ({
        name:     'Unallocated',
        id:       100,
        amount:   unalloc
      })
      cats .push ({
        name:     blackouts [1] .name,
        id:       101,
        amount:   other,
        blackout: true
      })
    }
    return {
      cats:      cats,
      name:      root .name,
      root:      root,
      blackouts: blackouts,
      model:     model,
      getData:   () => {return this._getYearData (root, blackouts, getAmount, model)},
      getAmount: getAmount,
    }
  }

  _getBudgetYearData (root, blackouts) {
    var getAmount = c => {
      return this._budget .getAmount (c, this._budget .getStartDate(), this._budget .getEndDate()) .amount * (this._budget .isCredit (c)? -1: 1)
    }
    return this._getYearData (root, blackouts, getAmount, 'SchedulesModel')
  }

  _addYearCategoriesGraph (name, root, blackouts, popup, position, direction) {
    switch (name) {
      case '_budgetChart':
        var data = this._getBudgetYearData (root, blackouts);
        break;
      case '_activityChart':
        var data = this._getActualsYearData (root, blackouts);
        break;
    }
    if ((!popup || data .cats .length > 1) && data .cats .find (c => {return c .amount != 0}))
      var updater = this._addUpdater ((eventType, model, ids) => {
        if (model == data .model)
          if (eventType == ModelEvent .UPDATE && ! ids .includes (data .root._id))
            for (let id of ids) {
              var affectedCat = data .cats .find (cat => {
                return cat .id == id || this._categories .getDescendants (this._categories .get (cat .id)) .find (d => {
                  return d._id == id
                })
              });
              if (affectedCat) {
                affectedCat = this._categories .get (affectedCat .id);
                updateView ({update: {
                  name:   affectedCat .name,
                  id:     affectedCat._id,
                  amount: data .getAmount (affectedCat)
                }});
              } else if (data .blackouts) {
                var amounts = data .blackouts .map (b => {return data .getAmount (b)});
                var catAmts = data .cats .reduce ((s,c) => {return  s + (isNaN (c .id)? c .amount: 0)}, 0);
                var unalloc = Math .max (0, amounts [0] - amounts [1] - catAmts);
                var other   = amounts [1];
                updateView ({update: {id: 100, amount: unalloc}})
                updateView ({update: {id: 101, amount: other, name: data .blackouts [1] .name}})
              }
            }
          else {
            data .getData();
            updateView ({replace: data});
          }
      })
      if (data .cats .length)
        var updateView = this._view .addDoughnut (data, name, popup, position, direction, () => {
          this._deleteUpdater (updater);
        });
 }

  _addYearCategoriesGraphs (name, toHtml) {
    var income  = this._budget .getIncomeCategory();
    var savings = this._budget .getSavingsCategory();
    var expense = this._budget .getExpenseCategory();
    this._view .addGroup (name + 's', toHtml);
    for (let root of [income, savings, expense])
      this._addYearCategoriesGraph (name, root, root == savings && [income, expense]);
  }

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

  _addProgressGraph (root, side, popup, position, labelWidth, includeMonths=true, includeYears=true) {

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
      if (months && months .length)
        updateMonthView = this._view .addToProgressGraph (progressGraph, root .name + ' this Month', months, labelWidth);
      if (years && years .length)
        updateYearView  = this._view .addToProgressGraph (progressGraph, root .name + ' this Year (at any time)', years, labelWidth);

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
      var updater = this._addUpdater ((eventType, model, ids) => {
        var affected = eventType != ModelEvent .UPDATE || ids .includes (root._id) || amounts .find (a => {
          return ids .includes (a .cat._id) || this._categories .getDescendants (a .cat) .find (d => {return ids .includes (d._id)});
        })
        if (affected) {
          var oldMonths = months, oldYears = years;
          getAllData();
          if ((oldMonths .length == 0) != (months .length == 0) || (oldYears .length == 0) != (years .length == 0)) {
            this._view .emptyProgressGraph (progressGraph);
            addGraphsToView();
          } else {
            if (months .length)
              updateMonthView (months, labelWidth, root .name + ' this Month');
            if (years .length)
              updateYearView (years,  labelWidth, root .name + ' this Year (at any time)');
          }
        }
      });
      var progressGraph = this._view .addProgressGraph (side, popup, position, () => {this._deleteUpdater (updater)}, () => {
        this._deleteUpdater (updater);
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
    var roots      = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    var labelWidth = this._getProgressGraphLabels (roots);
    for (let root of roots) {
      if (root == this._budget .getExpenseCategory()) {
        this._addProgressGraph (root, 'left', false, undefined, labelWidth, true, false)
        this._addProgressGraph (root, 'bottom', false, undefined, labelWidth, false, true)
      } else
        this._addProgressGraph (root, 'right', false, undefined, labelWidth, true, true)
    }
  }

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
    var defaultParents  = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    parentIds           = parentIds || (defaultParents .map (p => {return p._id}));
    var historicBudgets = yield* this._budget .getHistoricBudgets();
    var historicAmounts = [];
    for (let budget of historicBudgets)
      historicAmounts .push (yield* this._history .getAmounts (budget._id, parentIds));
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
        for (let cat of (parent .children || []))
          amounts .push ({
            id:       cat._id,
            name:     cat .name,
            sort:     cat .sort,
            isCredit: this._budget .isCredit (cat),
            isGoal:   this._budget .isGoal   (cat),
            amount:   this._budget .getAmount (cat, budget .start, budget .end) .amount * (this._budget .isCredit (cat)? -1: 1)
          });
        var parentAmount = this._budget .getAmount (parent, budget .start, budget .end) .amount * (this._budget .isCredit (parent)? -1: 1);
        var otherAmount  = parentAmount - amounts .reduce ((t,a) => {return t + a .amount}, 0);
        if (otherAmount != 0)
          amounts .push ({
            name:     'Other',
            sort:     amounts .reduce ((max,a) => {return Math .max (max, a .sort)}, 0) + 1,
            isCredit: this._budget .isCredit (parent),
            isGoal:   this._budget .isGoal   (parent),
            amount:   otherAmount
          })
      }
    }
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
          rows: Array .from (cats [i] .values()) .sort ((a,b) => {return a.sort<b.sort? -1: 1}) .map (cat => {
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
    if (model == 'SchedulesModel') {
//      if (eventType == ModelEvent .UPDATE)
//        for (let id of ids) {
//          for (let root of roots || defaultRoots) {
//            var affectedCat = (root .children || []) .find (cat => {
//              return cat._id == id || this._categories .getDescendants (cat) .find (d => {return d._id == id})
//            });
//            if (affectedCat)
//              break;
//          }
//          if (affectedCat)
//            updateView ({update: {
//              id:       affectedCat._id,
//              name:     affectedCat .name,
//              amounts:  this._getHistoryDataForCat (affectedCat, dataset .dates, true)
//            }})
//        }
//      else
        async (this, this._updateHistoryView) (parentIds, updateView);
    }
  }

  *_updateHistoryView (parentIds, updateView) {
    updateView ({replace: yield* this._getHistoryData (parentIds)})
  }

  *_addHistoryGraph (parentIds, popup, position, dataset, toHtml) {
    dataset = dataset || (yield* this._getHistoryData (parentIds));
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater ((eventType, model, ids) => {
        this._budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, false, updateView)
      });
      var updateView = this._view .addHistoryGraph (dataset, popup, position, () => {
        this._deleteUpdater (updater);
      }, toHtml);
    }
  }

  *_addHistoryTable (parentIds, skipFoot, popup, position, dataset, toHtml) {
    dataset = dataset || (yield* this._getHistoryData (parentIds));
    dataset .cols = dataset .cols .map (c => {return c .slice (-4)})
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater ((eventType, model, ids) => {
        this._budgetHistoryUpdater (eventType, model, ids, dataset, parentIds, true, updateView)
      });
      var updateView = this._view .addHistoryTable (dataset, skipFoot, popup, position, () => {
        this._deleteUpdater (updater);
      }, toHtml);
    }
  }

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
      [AccountType .INVSETMENT, 'Non-Registered Investments'],
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
        . entries())
        . map (e => {
          return {
            name:    accounts .find (a => {return a[0] == e[0]}) [1],
            type:    e [0],
            curBal:  e [1] .curBal,
            amounts: e [1] .amounts
          }
        })
    }
  }

  _addNetWorthGraph (dataset, toHtml) {
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
    this._view .addNetWorthGraph (dataset, toHtml);
  }
  
  _addNetWorthTable (dataset, toHtml) {
    this._view .addNetWorthTable (dataset, toHtml);
  }
  
  _addUpdater (updater) {
    this._updaters .push (updater);
    return updater;
  }

  _deleteUpdater (updater) {
    this._updaters = this._updaters .filter (u => {return u != updater});
  }

  _update (eventType, model, ids) {
    for (let updater of this._updaters)
      updater (eventType, model, ids);
  }

  /** Activity... **/

  _getActualsYearData (root, blackouts) {
    var getAmount = c => {
      return this._actuals .getAmountRecursively (c, this._budget .getStartDate(), this._budget .getEndDate()) * (this._budget .isCredit (c)? -1: 1);
    }
    return this._getYearData (root, blackouts, getAmount, 'ActualsModel')
  }

  _getActualsData (roots) {
    var st     = this._budget .getStartDate();
    var dates  = [];
    while (st <= this._budget .getEndDate()) {
      dates .push ({start: st, end: Types .dateMY .monthEnd (st)});
      st = Types .dateMY .addMonthStart (st, 1);
    }
    var getAmounts = cat => {
      var amounts = [];
      for (let date of dates) {
        amounts .push ({
          id:    cat._id,
          value: this._actuals .getAmountRecursively (cat, date .start, date .end) * (this._budget .isCredit (cat)? -1: 1)
        });
      }
      return amounts;
    }
    var getIncome = () => {
      return - this._actuals .getAmountRecursively (
        this._budget .getIncomeCategory(), this._budget .getStartDate(), this._budget .getEndDate()
      );
    }
    return this._getData (roots, getAmounts, getIncome, 'ActualsModel', dates, false);
  }

  _addActivity (headYear, headGraph, headTable) {
    this._addYearCategoriesGraphs ('_activityChart', headYear);
    var dataset = this._getActualsData (undefined);
    this._addMonthsGraph ('_activityMonthsGraph', undefined, undefined, undefined, dataset, headGraph);
    this._addMonthsTable ('_activityTable', undefined, undefined, undefined, undefined, dataset, headTable);
  }

  /** ...Activity **/

  *addHtml (toHtml) {
    this._toHtml = toHtml;
    this._view .addHtml                        (toHtml);
    this._view .addHeading                     ('Progress', 'Your Progress');
    this._addProgressGraphs                    ();
    var by = this._view .addHeading            ('Plan', 'Your Plan for the Year', 'Year');
    this._addBudgetYearTotalsGraph             (by);
    this._addYearCategoriesGraphs              ('_budgetChart');
    var bg = this._view .addHeading            (null, 'Your Plan by Month', 'Chart');
    var bt = this._view .addHeading            (null, 'Your Plan by the Numbers', 'Numbers');
    var ay = this._view .addHeading            ('Activity', 'Your Activity this Year', 'Year');
    var ag = this._view .addHeading            (null, 'Your Activity by Month', 'Chart');
    var at = this._view .addHeading            (null, 'Your Activity by the Numbers', 'Numbers');
    var hg = this._view .addHeading            ('Perspective', 'Historical Perspective', 'Chart');
    var ht = this._view .addHeading            (null, 'History by the Numbers', 'Numbers');
    var wg = this._view .addHeading            ('Wealth', 'Your Monitary Net Worth', 'Graph');
    var wt = this._view .addHeading            (null, 'Your Net Worth by the Numbers', 'Numbers');
    var dataset = this._getBudgetData          (undefined, true);
    this._addMonthsGraph                       ('_budgetMonthsGraph', undefined, undefined, undefined, dataset, bg);
    this._addMonthsTable                       ('_budgetTable', undefined, undefined, undefined, undefined, dataset, bt);
    this._addActivity                          (ay, ag, at);
    var dataset = yield* this._getHistoryData  ();
    yield* this._addHistoryGraph               (undefined, undefined, undefined, dataset, hg);
    yield* this._addHistoryTable               (undefined, undefined, undefined, undefined, dataset, ht);
    var dataset = yield* this._getNetWorthData ();
    this._addNetWorthGraph                     (dataset, wg);
    this._addNetWorthTable                     (dataset, wt);
  }
}
