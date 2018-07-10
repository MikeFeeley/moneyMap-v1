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
    this._accountsModel .delete();
    if (this._progressView)
      this._progressView .remove();
    if (this._planView)
      this._planView .remove();
    if (this._realityView)
      this._realityView .remove();
  }

  prime() {
    // hack needed because monthly popups can be generated from other views before first nav view is created
    // when that is fixed, prime() can be removed
    this._progressView = new NavigateView (this._accounts, this._variance);
    this._progressView .addObserver       (this, this._onViewChange);
  }

  async addProgressHtml (toHtml) {
    if (!this._progressView)
      this.prime();
    this._progressView .addHtml (toHtml, noAnimateSidebar => {
      this._clearUpdatersForView (this._progressView);
      this._addProgressSidebar (undefined, noAnimateSidebar)
      this._addProgressGraphs();
    });
  }

  async addPlanHtml (toHtml) {
    this._planView = new NavigateView (this._accounts, this._variance);
    this._planView .addObserver       (this, this._onViewChange);
    this._planView .addHtml           (toHtml, async () => {
      this._clearUpdatersForView           (this._planView);
      this._addBudgetYearTotalsGraph       (this._planView);
      await this._addYearCategoriesGraphs  ('_budgetChart', this._planView);
      await this._addMonthsGraph           ('_budgetMonthsGraph', this._planView);
      await this._addMonthsTable           ('_budgetTable', this._planView);
    })
  }

  async addRealityHtml (toHtml) {
    this._realityView = new NavigateView (this._accounts, this._variance);
    this._realityView .addObserver       (this, this._onViewChange);
    this._realityView .addHtml           (toHtml, async () => {
      this._clearUpdatersForView          (this._realityView);
      await this._addYearCategoriesGraphs ('_activityChart', this._realityView);
      await this._addMonthsGraph          ('_activityMonthsGraph', this._realityView);
      await this._addMonthsTable          ('_activityTable', this._realityView);
    })
  }

  async _getModelValues() {
    await this._actuals .findHistory ();
    if (this._historicBalances === undefined)
      this._historicBalances = (await this._balances .find({})) || null
    if (this._rates === undefined)
      this._rates = (await this._parameters .find ({name: 'rates'})) [0] || {apr: 0, inflation: 0, presentValue: false}
  }


  async _aph() {
    await this._getModelValues();
    this._clearUpdatersForView                      (this._perspectiveView);
    let sc = this._perspectiveView .addContainer    ('_sliderHeader');
    this._perspectiveView .addHeading               ('Compare Years', '', sc);
    let lv = this._perspectiveView .addSubHeading   ('', '', sc);
    this._perspectiveView .addSubHeading            ('&ndash;', '', sc);
    let rv = this._perspectiveView .addSubHeading   ('', '', sc);
    this._historySliderLeft  = undefined;
    this._historySliderRight = undefined;
    let ds = await this._getHistoryData             ();
    this._addHistorySlider (
      this._perspectiveView, ds, sc, lv, rv,
      await this._addHistoryGraph (undefined, undefined, undefined, this._perspectiveView, ds, undefined),
      await this._addHistoryTable (undefined, undefined, undefined, undefined, undefined, this._perspectiveView, ds, undefined)
    );
  }

  addPerspectiveHtml (toHtml) {
    this._perspectiveView = new NavigateView (this._accounts, this._variance);
    this._perspectiveView .addObserver       (this, this._onViewChange);
    this._perspectiveView .addHtml (toHtml,  () => {this._aph()})
  }

  async _anwh() {
    await this._getModelValues();
    this._netWorthSliderLeft  = undefined;
    this._netWorthSliderRight = undefined;
    var ds = await this._getNetWorthData ();
    this._clearUpdatersForView                   (this._netWorthView);
    let sc = this._netWorthView .addContainer    ('_sliderHeader');
    this._netWorthView .addHeading               ('Net Worth', '', sc);
    let lv = this._netWorthView .addSubHeading   ('', '', sc);
    this._netWorthView .addSubHeading            ('&ndash;', '', sc);
    let rv = this._netWorthView .addSubHeading   ('', '', sc);
    this._addNetworthSlider (
      this._netWorthView, ds, sc, lv, rv,
      this._addNetWorthGraph                      (this._netWorthView, ds),
      await this._addNetWorthTable                (this._netWorthView, ds)
    );
  }

  addNetWorthHtml (toHtml) {
    this._netWorthView = new NavigateView (this._accounts, this._variance);
    this._netWorthView .addObserver       (this, this._onViewChange);
    this._netWorthView .addHtml           (toHtml, () => {this._anwh()})
  }

  async _onModelChange (eventType, doc, arg, source, model) {
    const modelName = model .constructor .name;
    let   ids;
    switch (modelName) {
      case 'ActualsModel':
        ids = (doc .category && [doc .category]) || [];
        if (eventType == ModelEvent .UPDATE && arg._original_category != null)
          ids .push (arg._original_category);
        break;
      case 'SchedulesModel':
        // TODO might need to also update progress right sidebar if its empty
        ids = [doc .category || doc._id];
        break;
      default:
        ids = [doc._id] || [];
        break;
    }
    const skip =
      (eventType == ModelEvent .INSERT && modelName == 'SchedulesModel' && doc .category) ||
      (eventType == ModelEvent .UPDATE && modelName == 'SchedulesModel' && arg && arg .sort != null);
    await this._update (eventType, modelName, ids, doc, skip);
  }




  /**
   * Handle interation with view (drilling on click)
   */
  async _onViewChange (eventType, arg) {

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
        arg .id     = arg .id .split ('other_');
        let isOther = arg .id .length > 1;
        arg .id     = arg .id [arg .id .length - 1];
        var root = this._categories .get (arg .id);
        var t    = arg .title .split (' ');
        var im   = t [t .length -1] == 'Month';
        if (arg .altClick || isOther || ! this._addProgressGraph (root, arg .html, true, arg .position, undefined, im, ! im))
          BudgetProgressHUD .show (root._id, arg .html, arg .position, this._accounts, this._variance);
      } else {
        var today = Math .min (Types .dateMY .today(), this._budget .getEndDate());
        var dates  = {
          start: Types .dateMY .monthStart (today),
          end:   Types .dateMY .monthEnd   (today)
        }
        let sel = arg .data .find (d => {return d._id == arg .id});
        if (arg .altClick)
          TransactionHUD .showCategory (arg .id, dates, this._accounts, this._variance, arg .html, {top: arg .position .top, left: 0}, sel .hasMonth, sel .hasYear, sel .addCats);
        else
          await this._addMonthsGraph ('_activityMonthsGraph', arg.view, [arg .id], true, arg .position, arg .html, sel .hasMonth, sel .hasYear, sel .addCats);
      }

    } else if (eventType == NavigateViewEvent .PROGRESS_SIDEBAR_CLICK) {
      if (arg .type == 'pinned') {
        const html = isSafari? $('body'): $('html');
        const pos  = {top: html .scrollTop() + 68, left: html .scrollLeft() + 20};
        BudgetProgressHUD .show (arg .id, html, pos, this._accounts, this._variance, undefined, true);
      } else if (arg .type == 'pinned_icon')
        PinnedCategories .getInstance() .remove (arg .id);
      else if (arg .altClick)
        await this._addMonthsGraph ('_budgetMonthsGraph', arg.view, [arg .id], true, arg .position, arg .html);
      else
        await this._addMonthsGraph ('_activityMonthsGraph', arg.view, [arg .id], true, arg .position, arg .html);

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
          if (arg .id .startsWith ('leaf_'))
            arg .id = arg .id .split ('_') [1];
          await this._addMonthsGraph (name, arg .view, [arg .id], true, position, html, undefined, undefined, undefined, undefined, arg .colorIndex);
        }
      } else
        await this._addYearCategoriesGraph (arg .name, [arg .id], null, arg .view, true, arg .position, arg .direction);

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_CLICK && arg .id) {
      /* Monthly or History Graph (Budget or Actual) */
      if (arg .name .startsWith ('_budgetMonthsGraph') || arg .name .startsWith('_activityMonthsGraph')) {
        let sel = arg .data && arg .data .reduce ((s,d) => {return s || d .rows .find (r => {return r .id == arg .id})}, null);
        let im  = sel && sel .hasMonth;
        let iy  = sel && sel .hasYear;
        if (arg .altClick) {
          let id = arg .id .split ('_') .slice (-1) [0];
          var today = Types .date .today();
          if (! arg .date) {
            arg .date = {};
            arg .date .start = arg .labelIndex < 12? Types .date .addMonthStart (this._budget .getStartDate(), arg .labelIndex) : Types .date .monthStart (today);
            arg .date .end   = Types .date .monthEnd (dates .start);
          }
          if (arg .name .startsWith ('_budgetMonthsGraph')) {
            BudgetProgressHUD .show (id, arg .html, arg .position, this._accounts, this._variance, arg .labelIndex < 12? arg .date .end: undefined);
          } else
            TransactionHUD .showCategory (arg .id, arg .date, this._accounts, this._variance, arg .html, arg .position, im, iy, sel && sel .addCats);
        } else {
          if (arg .id .includes ('budget_')) {
            let id   = arg .id .split ('_') .slice (-1) [0];
            let date = arg .labelIndex < 12
              ? Math .min(Types .date. today(), Types .date .monthEnd (Types .date .addMonthStart (this._budget .getStartDate(), arg . labelIndex)))
              : undefined;
            BudgetProgressHUD .show (id, arg .html, arg .position, this._accounts, this._variance, date);
          } else {
            arg .date .start = arg .date .start? Types .dateFY .getFYStart (arg .date .start, this._budget .getStartDate(), this._budget .getEndDate()): this._budget .getStartDate();
            arg .date .end   = arg .date .end?   Types .dateFY .getFYEnd   (arg .date .end,   this._budget .getStartDate(), this._budget .getEndDate()): this._budget .getEndDate();
            await this._addMonthsGraph (arg .name, arg .view, [arg .id], true, arg .position, arg .html, true, iy, sel && sel .addCats, arg .date, arg .colorIndex);
          }
        }
      } else if (arg .name == '_budgetHistoryGraph' && arg .id .length >= 1 && arg .id [0]) {
        if (arg .altClick) {
          if (arg .date) {
            if (arg .date .end > this._budget .getStartDate()) {
              let activeId = arg .id .find (i => {let cat= this._categories .get (i); return cat && cat .budgets .includes (this._budget .getId())})
              if (activeId)
                BudgetProgressHUD .show (activeId, arg .html, arg .position, this._accounts, this._variance);
            } else if (arg .id) {
              TransactionHUD .showCategory (arg.id[0], arg .date, this._accounts, this._variance, arg .html, arg .position);
            }
          }
        } else {
          await this._addHistoryGraph (arg .id, true, arg .position, arg .view, await this._getHistoryData (arg .id, undefined, true), arg .html, arg .colorIndex);
        }
      } else if (arg .name == '_budgetHistoryGraph_months') {
        let name = (arg .date .start < this._budget .getStartDate()? '_activity': '_budget') + 'MonthsGraph';
        await this._addMonthsGraph (name, arg .view, arg .id, true, arg .position, arg .html, true, true, [], arg .date);
      }

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_PREV_NEXT) {
      let dates = {
        start: Types .date .addMonthStart (arg .dates [0] .start, 12 * (arg .prev? -1: 1)),
        end:   Types .date .monthEnd (Types .date .addMonthStart (arg .dates .slice (-1) [0] .end, 12 * (arg .prev? -1: 1)))
      };
      let name = dates .start < this._budget .getStartDate()
        ? '_activityMonthsGraph' + ' ' + arg .name
        : dates .start > this._budget .getEndDate()
          ? '_budgetMonthsGraph' + ' ' + arg .name
          : arg .name .split (' ') .slice (-1) [0];
      await this._addMonthsGraph (name, arg .view, arg .id, true, arg .position, arg .html, true, true, [], dates, undefined, arg .update);

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_GET_HISTORY) {
      await this._actuals .findHistory();
      await this._addHistoryGraph (arg .id, true, arg .position, arg .view, await this._getHistoryData (arg .id, undefined, true), arg .html, arg .colorIndex);

    } else if (eventType == NavigateViewEvent .BUDGET_GRAPH_TITLE_CLICK && arg .id) {
      /* Graph Title */
      if (arg .name == '_budgetHistoryGraph') {
        if (arg .altClick) {
          /* Parent Graph */
          let ids = Array .from (arg .id
            .map    (i => {
              let p = this._categories .get (i) .parent;
              if (p) {
                let gp = p .parent;
                return [p._id] .concat (gp? (gp .children .concat (gp .zombies || []) .filter (s => {return s .name == p .name}) .map (s => {return s._id})): [])
              }
            })
            .filter (l => {return l})
            .reduce ((s,l) => {return l .reduce ((s,i) => {return s .add (i)}, s)}, new Set()))
          await this._addHistoryGraph (ids, true, arg .position, arg .view, await this._getHistoryData(ids, undefined, true), arg .html);
        } else {
          /* Budget HUD */
          if (Array .isArray (arg .id))
            arg .id = arg .id .find (i => {let cat = this._categories .get(i); return cat && cat .budgets .includes (this._budget .getId())});
          if (arg .id)
            BudgetProgressHUD .show (arg .id .split ('_') .slice (-1) [0], arg .html, arg .position, this._accounts, this._variance);
        }
      } else {
        if (arg .altClick) {
          let parent = this._categories .get ([] .concat (arg .id) [0]) .parent;
          if (parent) {
            let sel = arg .data [0] .rows [1];
            let im  = sel && sel .hasMonth;
            let iy  = sel && sel .hasYear;
            arg .date .start = Types .dateFY .getFYStart (arg .date .start, this._budget .getStartDate(), this._budget .getEndDate());
            arg .date .end   = Types .dateFY .getFYEnd   (arg .date .end,   this._budget .getStartDate(), this._budget .getEndDate());
            await this._addMonthsGraph (arg .name, arg .view, [parent._id], true, arg .position, arg .html, im, iy, sel && sel .addCats, arg .date);
          }
        } else {
          if (Array .isArray (arg .id))
            arg .id = arg .id .find (i => {let cat = this._categories .get(i); return cat && cat .budgets .includes (this._budget .getId())});
          if (arg .id)
            BudgetProgressHUD .show (arg .id .split ('_') .slice (-1) [0], arg .html, arg .position, this._accounts, this._variance);
        }
      }

    } else if (eventType == NavigateViewEvent .BUDGET_TABLE_CLICK && arg .id) {

      /* Monthly or History Table (Budget or Actual) */
      if (arg .dataset .cols .length == 1 && arg .dataset .cols [0] == 'Yr')
        arg .date = [];
      let im = ! arg .date || ! Array .isArray (arg .date) || arg .date .length != 0;
      let iy = ! arg .date || ! im;
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
        } else {
          if (arg .date && arg .date .length == 0)
            arg .date = [{start: this._budget .getStartDate(), end: this._budget .getEndDate()}];
          await this._addMonthsTable (arg .name, arg .view, [arg .id], arg .date, true, true, arg .position, arg .html, undefined, undefined, im, iy);
        }
      } else if (arg .name == '_budgetHistoryTable' && arg .id .length >= 1 && arg .id [0]) {
        if (arg .altClick) {
          if (! arg .date || arg .date .end > this._budget .getStartDate()) {
            arg .date == arg .date || {start: this._budget .getStartDate(), end: this._budget .getEndDate()};
            let activeId = arg .id .find (i => {let cat= this._categories .get (i); return cat && cat .budgets .includes (this._budget .getId())});
            if (activeId)
              BudgetProgressHUD .show (activeId, arg .html, arg .position, this._accounts, this._variance);
          } else
            TransactionHUD .showCategory (arg.id [0], arg .date, this._accounts, this._variance, arg .html, arg .position);
        } else {
          let ids = [] .concat (arg .id);
          await this._addHistoryTable (ids, arg .date, true, true, arg .position, arg .view, await this._getHistoryData (ids, arg .date, true), arg .html);
        }
      }

    } else if (eventType == NavigateViewEvent .BUDGET_TABLE_TITLE_CLICK && arg .name == '_budgetHistoryTable') {
      let name, title;
      if (arg .date .start >= this._budget .getStartDate()) {
        name  = '_budgetTable';
        title = 'Budget for ';
      } else {
        name  = '_activityTable';
        title = 'Activity for ';
      }
      title += this._budget .getLabel (arg .date);
      await this._addMonthsTable (name, arg.view, undefined, arg .date, false, true, arg .position, arg .html, undefined, title);

    } else if (eventType == NavigateViewEvent .PROGRESS_GRAPH_TITLE_CLICK && arg .data .length) {
      /* Progress Graph Title */
      let parent = this._categories .get (arg .data [0]._id) .parent;
      if (parent)
        BudgetProgressHUD .show (parent._id, arg .html, arg .position, this._accounts, this._variance);

    } else if (eventType == NavigateViewEvent .NETWORTH_TABLE_CLICK) {
      if (arg .ids && arg .ids .length > 1) {
        this._addNetWorthTable (arg .view, await this._getNetWorthData (arg .ids, arg .label), true, arg .html, arg .position);
      } else {
        arg .id = arg .cats [0]._id;
        if (arg .column > arg .highlight)
          BudgetProgressHUD .show (arg .id, arg .html, arg .position, this._accounts, this._variance);
        else {
          let date = Types .dateDMY .fromString ('1-' + arg .label);
          let dateRange = {
            start: Types .dateFY .getFYStart (date, this._budget .getStartDate(), this._budget .getEndDate()),
            end:   Types .dateFY .getFYEnd   (date, this._budget .getStartDate(), this._budget .getEndDate())
          }
          TransactionHUD .showCategory (arg .id, dateRange, this._accounts, this._variance, arg .html, arg .position);
        }
      }
    } else if (eventType == NavigateViewEvent .NETWORTH_TABLE_ROW_CLICK) {
      let rows =  this._accounts .getAccounts() .filter (a => {return a .group == arg .id}) .map (a => {return a._id});
      if (rows .length > 1)
        this._addNetWorthTable (arg .view, this._filterNetWorthBySlider (await this._getNetWorthData (rows, arg .label)), true, arg .html, arg .position);
    }
  }




  /*******************************************/
  /***** GET BUDGET / ACTUAL INFORMATION *****/

  async _getPayees (cat, altDates) {
    const payeeTruncate = /\s\d|#|\(/;
    let   st = this._budget .getStartDate();
    let   en = this._budget .getEndDate();
    if (altDates) {
      st = altDates .start;
      en = altDates .end;
    }
    return (await this._actuals .getTransactions (cat, st, en))
      .map (tran => {
        let stop = tran .payee && tran .payee .match (payeeTruncate);
        return {
          payee:  (stop && stop .index? tran .payee .slice (0, stop .index): tran .payee) .split (' ') .slice (0,3) .join (' '),
          date:   tran .date,
          amount: (-(tran .credit || 0) + (tran .debit || 0))
        }
      })
      .sort ((a,b) => {return a .payee < b .payee? -1: a .payee == b .payee? (a .date < b .date? -1: a .date == b .date? 0: 1): 1})
      .reduce ((sum, tran) => {
        let month    = Types .date._yearMonth (tran .date);
        let curPayee = sum .slice (-1) [0];
        if (curPayee && curPayee .payee == tran .payee) {
          let cur = curPayee .amounts .find (a => {return a .month == month});
          if (! cur) {
            cur = {month: month, amount: 0}
            curPayee .amounts .push (cur);
          }
          cur .amount += tran .amount;
        } else
          sum .push ({payee: tran .payee, amounts: [{month: month, amount: tran .amount}]});
        return sum;
      }, [])
      .map (p => {return {
        payee:  'payee_' + p .payee + '_' + cat._id,
        amounts: p .amounts
      }});
  }

  async _getChildren (type, id, altDates) {
    let result;
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        if (id .includes ('other_'))
          result = []
        else {
          let cat = this._categories .get (id .split ('_') .slice (-1) [0]) || {};
          result = (cat .children || []) .concat (cat .zombies || []) .map (c => {return c._id});
        }
        if (type == NavigateValueType .BUDGET_YR_AVE_ACT)
          result = ['budget_' + id] .concat (result);
        return result

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        if (id .includes ('payee_'))
          return []
        else {
          const cat = this._categories .get (id .split ('_') .slice (-1) [0]);
          let children = (cat .children || []) .concat (cat .zombies || []);
          if (id .includes ('other_'))
            children = children .filter (c => ! this._categories .hasType (c, ScheduleType .NOT_NONE));
          let result = children .map (c=> c._id);
          if (type == NavigateValueType .ACTUALS_BUD)
            result = ['budget_' + id] .concat (result);
          return result;
        }
    }
  }

  async _getAmounts (type, id, isCredit, dates, includeMonths = true, includeYears = true, addCats, altDates) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        if (type == NavigateValueType .BUDGET_YR_AVE_ACT && id .includes ('budget_')) {
          let cat = this._categories .get (id .split ('_') .slice (-1) [0]);
          return await Promise .all ((dates .filter (d => {return d .start <= Types .date .today()}) .map (async date => {
            let value = this._actuals .getAmountRecursively (cat, date .start, date .end) * (this._budget .isCredit (cat)? -1: 1);
            if (id .includes ('other_'))
              value -= (await this._getChildren (type, id, altDates)) .reduce ((t, c) => {
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
          })))
        } else {
          let cat = this._categories .get (id .split ('_') .slice (-1) [0]);
          let amounts;
          if (includeMonths)
            amounts = dates .map (date => {
              let a = this._budget .getAmount (cat, date .start, date .end);
              return {
                id:    cat._id,
                value: (a .month && a .month .amount || 0) * (isCredit? -1: 1)
              }
            });
          else
            amounts = [];
          if ((dates .length == 12 || dates .length == 1) && includeYears) {
            let st = Types .dateFY .getFYStart (dates[0] .start, this._budget .getStartDate(), this._budget .getEndDate());
            let en = Types .dateFY .getFYEnd   (dates[0] .start, this._budget .getStartDate(), this._budget .getEndDate());
            let yrAmount = this._budget .getAmount (cat, st, en);
            amounts .push ({
              id:    cat._id,
              value: (yrAmount .year && yrAmount .year .amount || 0) * (isCredit? -1: 1)
            })
          }
          if ((type == NavigateValueType .BUDGET_YR_AVE || type == NavigateValueType .BUDGET_YR_AVE_ACT))
            amounts [amounts .length -1] .value /= 12;
          if (dates .length == 1)
            amounts = [{id: cat._id, value: ((amounts [0] || {}) .value || 0) + ((amounts [1] || {}) .value || 0)}]
          return amounts;
        }

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        if (id .payee) {
          let realId = id .payee .split ('_') .slice (-1) [0];
          return dates .map (date => {
            let s = Types .date._yearMonth (date .start);
            let e = Types .date._yearMonth (date .end);
            return {
              id:    realId,
              value: id .amounts .reduce ((t,a) => {return t + (a .month >= s && a .month <= e? a .amount: 0)}, 0) * (isCredit? -1: 1)
            }
          })
        } else {
          let ida = id .split ('_');
          let cat = this._categories .get (ida .slice (-1) [0]);
          if (type == NavigateValueType .ACTUALS_BUD && id .includes ('budget_'))
            return dates .filter (d => {return d .start <= Types .date .today()}) .map (date => {
              let va = this._variance .getAmount (cat._id, date .start - 1);
              let ma = includeMonths && va .month? va .month .amounts .available || 0: 0;
              let ya = includeYears  && va .year?  va .year  .amounts .available || 0: 0;
              return {id: id, value: ma + ya}
            })
          else {
            if (dates .slice (-1) [0] .end < Types .date .addMonthStart (this._budget .getStartDate(), -12))
              await this._actuals .findHistory();
            let isOther = id .includes ('other_');
            let tc = [cat];
            return dates .map (date => {
              let value;
              if (isOther)
                value = tc .reduce ((t, cat) => {
                  return t + this._actuals .getAmount (cat, date .start, date .end, null, includeMonths, includeYears, addCats) * (isCredit? -1: 1)
                }, 0);
              else
                value = tc .reduce ((t, cat) => {
                  return t + this._actuals .getAmountRecursively (cat, date .start, date .end, null, includeMonths, includeYears, addCats) * (isCredit? -1: 1)
                }, 0);
              return {
                id:    altDates? tc .map (cat => {return cat._id}): cat._id,
                value: value
              }})
          }
        }
    }
  }

  _getIncome (type, start = this._budget .getStartDate(), end = this._budget .getEndDate()) {
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        return - [this._budget .getIncomeCategory(), this._budget .getWithdrawalsCategory()] .reduce ((t,c) => {
          return t + this._budget .getAmount (c, start, end) .amount
        }, 0);
      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
      return - [this._budget .getIncomeCategory(), this._budget .getWithdrawalsCategory()] .reduce ((t,c) => {
        return t + this._actuals .getAmountRecursively (c, start, end)
      }, 0);
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

  _getNote (type, id, includeMonths, includeYears, altDates) {
    let yr = '';
    if (altDates) {
      let dt = [] .concat (altDates);
      let start = dt [0] .start;
      let end   = dt .slice (-1) [0] .end;
      if (start == Types .date .addMonthStart (this._budget .getStartDate(), -12))
        yr = ' Last Year';
      else if (start != this._budget .getStartDate())
        yr = ' for ' + BudgetModel .getLabelForDates (start, end);
    }
    switch (type) {
      case NavigateValueType .BUDGET: case NavigateValueType .BUDGET_YR_AVE: case NavigateValueType .BUDGET_YR_AVE_ACT:
        return 'Budget' + yr;

      case NavigateValueType .ACTUALS: case NavigateValueType .ACTUALS_BUD:
        let getRoot  = c => {return c.parent? getRoot (c .parent): c}
        let ym       = includeMonths && !includeYears? ' Monthly ': !includeMonths && includeYears? ' Anytime ': '';
        let gn       = getRoot (this._categories .get (id .split ('_') .slice (-1) [0])) .name;
        return 'Actual ' + ym + gn + yr;
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

  async _getChildrenData (type, id, dates, includeMonths = true, includeYears = true, addCats = [], altDates) {
    if (id .includes ('leaf_'))
      return {data: []}
    else {
      let getAmounts  = async id => {return await this._getAmounts (type, id, isCredit, dates, includeMonths, includeYears, addCats, altDates)}
      let thisCat     = this._categories .get (id .split ('_') .slice (-1) [0]);
      let isCredit    = this._budget .isCredit (thisCat);
      let isGoal      = this._budget .isGoal   (thisCat);
      let thisAmounts = await this._getAmounts (type, id, isCredit, dates, includeMonths, includeYears, addCats, altDates);
      let children = [], realChildren;
      let processChildren = async childrenIds => {
        children = children .concat (
          (await Promise .all (childrenIds .map (async cid => {return {cat: cid .payee || cid, amounts: await getAmounts (cid)}})))
            .filter (child => {return child .amounts .find (a => {
              return a .value != 0  || [] .concat (a .id) .find (i => {return i .startsWith ('budget_')})
            })})
          );
        realChildren = children .filter (child => {return ! child .cat .startsWith ('budget_')});
      }
      await processChildren (await this._getChildren (type, id, altDates));
      if ([NavigateValueType .ACTUALS, NavigateValueType .ACTUALS_BUD] .includes (type) && realChildren .length == 0) {
        let payees = await this._getPayees (thisCat, altDates);
        if (id .includes ('payee_')) {
          await processChildren (payees .filter (p => {return p .payee == id}));
          thisAmounts = children && children [0]? children [0] .amounts: [];
          children = [];
          realChildren = [];
        } else
          await processChildren (payees);
      }
      if (realChildren .length == 1 && ! realChildren [0] .cat .includes ('_')) {
         let isLeaf = (await this._getChildren (type, realChildren [0] .cat, altDates))
          .filter (cat       => {return ! cat .startsWith ('budget_')})
          .filter (async cat => {return (await getAmounts (cat)) .find (a => {return a .value != 0})})
          .length == 0;
        if (isLeaf)
          children [0] .cat = 'leaf_' + children [0] .cat;
      } else if (realChildren .length == 0)
        children .push ({cat: 'leaf_' + id, amounts: thisAmounts});
      let data = children .map (child => {
        let hasMonth, hasYear;
        let cat = this._categories .get (child .cat .split ('_') .slice (-1) [0]);
        return {
          name:     this._getName (type, child .cat) || '',
          id:       child .cat,
          isCredit: isCredit,
          isGoal:   isGoal,
          hasMonth: includeMonths,
          hasYear:  includeYears,
          amounts:  child .amounts,
          type:     child .cat .includes ('budget_') && 'line'
        }
      });
      let hasOther;
      if (! id .includes ('other_')) {
        let totals = data   .reduce ((t,d) => {return ! d .id .includes ('budget_')? d .amounts .map ((a,i) => {return (t[i] || 0) + a .value}): t}, []);
        let others = totals .map    ((t,i) => {return thisAmounts [i] .value - t});
        hasOther   = others .find   (o     => {return o != 0}) != null;
        if (hasOther)
          data .push ({
            name:     'Other',
            id:       'other_' + thisCat._id,
            isCredit: isCredit,
            isGoal:   isGoal,
            amounts:  others .map (o => {return {id: 'other_' + thisCat._id, value: o}})
          })
      }
      let bd = data .find (d => {return d .id .includes ('budget_')});
      if (bd && ! bd .amounts .find (a => {return a .value != 0}))
        data .splice (data .indexOf (bd), 1);
      return {
        data:      data,
        getUpdate: async (eventType, model, ids) => {
          let needReplace = {needReplace: true};
          if (this._getModels (type) .includes (model)) {
            if (eventType == ModelEvent .UPDATE && ids .length == 0)
              return
            else if (eventType == ModelEvent .UPDATE) {
              return (await Promise .all (ids .map (async eid => {
                let aff;
                if (data && data .length && data [0] .id .startsWith ('payee_'))
                  aff = [{id: eid}];
                else
                  aff = data .filter (e => {
                    let i =  e. id .split ('_') .slice (-1) [0];
                    return i == eid || (! e .id .includes ('other_') && this._categories .getDescendants (this._categories .get (i)) .find (d => {return d._id == eid}))
                  });
                if (aff .length) {
                  let up = (await Promise .all (aff .map (async af => {
                    let aid     = af .id .split ('_') .slice (-1) [0];
                    let newData = await this._getChildrenData (type, id, dates, includeMonths, includeYears, addCats, altDates);
                    if (hasOther == (newData .data .length && newData .data [newData .data .length - 1] .id .includes ('other_'))) {
                      let newAff = newData .data .filter (d => {return d .id .split ('_') .slice (-1) [0] == aid});
                      if (newAff .length == 0)
                        return {needUpdate: true, affected: aid}
                      else
                        return newAff .map (a => {return {update: {id: a .id, name: a .name, amounts: a .amounts}}})
                    } else
                      return needReplace
                  })))
                    .reduce ((c,e) => {c = c .concat (e); return c}, [])
                  if (up .find (u => {return u .needReplace}))
                    return [needReplace]
                  else
                    return up;
                }
              }))) .reduce ((l,e) => {return e? l .concat (e): l}, [])
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
   *       name:          name for this group
   *       hasNoParent:   true iff category that roots this group has no parent
   *       isZombie:      true iff category is zombie
   *       stackPosition: [i,j] where i is stack number and j is position in stack (ordered left to right, bottom to top)
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
  async _getData (
    type,
    dates,
    ids           = [this._budget .getWithdrawalsCategory()._id, this._budget .getIncomeCategory()._id, this._budget .getSavingsCategory()._id, this._budget .getExpenseCategory()._id],
    includeMonths = true,
    includeYears  = true,
    addCats       = []
  ) {
    let altDates = dates && (dates .start != this._budget .getStartDate()) && dates;
    if (!dates || (dates .start && dates .end != Types .date .monthEnd (dates .start))) {
      var st = dates? dates .start: this._budget .getStartDate();
      var en = dates? dates .end:   this._budget .getEndDate();
      dates  = [];
      while (st <= en) {
        dates .push ({start: st, end: Types .dateMY .monthEnd (st)});
        st = Types .dateMY .addMonthStart (st, 1);
      }
    } else
      dates = [] .concat (dates);
    let isYear = dates .length == 1 && Types .date._month (dates [0] .start) != Types .date._month (dates [0] .end);
    var months = isYear? 0: dates .length;
    var cols   = isYear? []: dates .map (d => {return Types .dateM .toString (d .start)});
    var groups = (await Promise .all (ids
      .map (async id => {
        let data          = await this._getChildrenData (type, id, dates, includeMonths, includeYears, addCats, altDates);
        let stackPosition = ids .length > 1 &&
          (id == this._budget .getIncomeCategory()._id? [0,0]:
            id == this._budget .getWithdrawalsCategory()._id? [0,1]:
              id == this._budget .getExpenseCategory()._id? [1,0]: [1,1]);
        let cat = this._categories .get (id .split ('_') .slice (-1) [0]);
        return {
          id:            id,
          name:          this._getName (type, id),
          stackPosition: stackPosition,
          note:          this._getNote (type, id, includeMonths, includeYears, altDates),
          rows:          data .data,
          getUpdate:     data .getUpdate,
          hasNoParent:   cat .parent == null,
          isZombie:      ! cat .budgets .includes (this._budget .getId())
        }
      })));
    let note = groups [0] && groups [0] .note;
    groups = groups
      .filter (g => {return g .rows .find (r => {return r .amounts .find (a => {return a .value != 0})})})
    if ((type == NavigateValueType .BUDGET_YR_AVE_ACT || type == NavigateValueType .ACTUALS_BUD) && groups .length > 1)
      groups = groups .map (g => {
        g .rows = g .rows .filter (r => {return ! r .id .includes ('budget_')})
        return g;
      })
    if (dates .length == 12 || dates .length == 0 || isYear) {
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
      subnote:   note,
      groups:    groups,
      startBal:  this._actuals .getCashFlowBalance (dates [0] .start),
      highlight: highlight > 0? highlight: undefined,
      income:    this._getIncome (type, dates [0] .start, dates [dates .length - 1] .end),
      getUpdate: async (eventType, model, eventIds) => {
        let update = [];
        for (let g of groups) {
          if (this._getModels (type) .includes (model) && eventIds .includes (g .id))
            update .push ({update: {id: g .id, name: this._getName (type, g .id)}})
          let u = await g .getUpdate (eventType, model, eventIds);
          if (u && u .length) {
            if (u [0] .needReplace)
              u = [{replace: await this._getData (type, dates, ids, includeMonths, includeYears, addCats)}]
            update = update .concat (u) .concat ({updateIncome: this._getIncome (type, dates [0] .start, dates [dates .length - 1] .end)});
          }
        }
        return update;
      }
    }
  }

  async _getMonthsData (type, dates, ids, includeMonths, includeYears, addCats) {
    let data = await this._getData (type, dates, ids, includeMonths, includeYears, addCats);
    let parentUpdate = data .getUpdate;
    data .getUpdate = async (e,m,i) => {
      let up = await Promise .all ((await parentUpdate (e,m,i)) .map (async u => {
        if (u .needUpdate)
          return {replace: await this._getData (type, dates, ids, includeMonths, includeYears, addCats)}
        else
          return u;
      }))
      let re = up .find (u => {return u .replace});
      return re? [re]: up;
    }
    return data;
  }

  /**
   * Add GRAPH (either budget or actual) showing children of specified root list
   */
  async _addMonthsGraph (name, view, ids, popup, position, toHtml, includeMonths=true, includeYears=true, addCats=[], dates=null, startColor=0, viewUpdater) {
    var type    = name .startsWith ('_budget')? NavigateValueType .BUDGET_YR_AVE_ACT: NavigateValueType .ACTUALS_BUD;
    var dataset = await this._getMonthsData (type, dates, ids, includeMonths, includeYears, addCats);
    const nothingToShow = ! dataset .groups .find (g =>
      g .rows .find (r =>
        r .amounts .find (a =>
          (Array.isArray (a .id) || ! a .id .startsWith ('budget_')) && a .value != 0
     )));
    if (nothingToShow)
      return;
    if (!ids || ids .length > 1) {
      let dt = dates && [] .concat (dates);
      let start = dt && dt [0] .start;
      let end   = dt && dt .slice (-1) [0] .end;
      let year;
      if (!dt || start == this._budget .getStartDate())
        year = 'This Year';
      else if (start == Types .date .addYear (this._budget .getStartDate(), -1))
        year = 'Last Year';
      else if (start != this._budget .getStartDate())
        year = ' for ' + BudgetModel .getLabelForDates (start, end);
      dataset .note = (type ==  NavigateValueType .BUDGET_YR_AVE_ACT? 'Budget ': 'Activity ') + year;
    }
    let updateView;
    if (viewUpdater) {
      let multipleGroups = dataset .groups .length > 1;
      let rows = dataset .groups .reduce ((rows, group) => {
        return rows .concat (group .rows || []) .map (r => {r .multipleGroups = multipleGroups; r .stackPosition = group .stackPosition; return r});
      }, [])
      viewUpdater ([
        {name:      name},
        {update:    {id: ids, note: ids .length > 1? dataset .note: dataset .subnote}},
        {dates:     dataset .dates},
        {highlight: dataset .highlight || false},
        {updateAll: rows .map (row => {return {update: row}})}
      ]);
    } else if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, async (eventType, model, ids) => {
        let update = await dataset .getUpdate (eventType, model, ids);
        if (update)
          updateView (update);
      });
      let oneBar = dataset .groups .length == 1 && dataset .groups [0] .rows .filter (r => {return ! r .id .startsWith ('budget_')}) .length == 1;
      updateView = view .addMonthsGraph (name, dataset, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml, oneBar? startColor: 0);
    }
  }

  /**
   * Add TABLE (either budget or actual) showing children of specified root list
   */
  async _addMonthsTable (name, view, ids, dates, skipFoot, popup, position, toHtml, col, title, includeMonths, includeYears) {
    var dataset = await this._getMonthsData (name .includes ('budget')? NavigateValueType .BUDGET: NavigateValueType .ACTUALS, dates, ids, includeMonths, includeYears);
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      var updater = this._addUpdater (view, async (eventType, model, ids) => {
        let update = await dataset .getUpdate (eventType, model, ids);
        if (update)
          updateView (update);
      });
      var updateView = view .addBudgetTable (name, dataset, dataset .cols .length == 1, skipFoot, popup, position, toHtml, () => {
        this._deleteUpdater (view, updater);
      }, ! dates || ! skipFoot, title);
    }
  }






  /***************************************/
  /**** YEARLY BUDGET OR ACTUAL GRAPH ****/

  async _getYearsData (type, id, blackouts) {
    var getBlackouts = async (d) => {
      var boAmts  = await Promise .all (blackouts .map (async b => {return (await this._getAmounts (type, b._id, this._budget .isCredit (b), dates)) [0]}));
      var amts    = d .reduce ((s,c) => {return s + c .amounts[0] .value}, 0);
      var inAmt   = boAmts .slice (0, -1) .reduce ((t,a) => {return t + a .value}, 0);
      var outAmt  = boAmts [boAmts .length - 1] .value
      var unalloc = Math .max (0, inAmt - outAmt - amts);
      return {
        data: [{
          id:      'unallocated_',
          name:    'Unallocated',
          amounts: [{id: 'unallocated_', value: unalloc}]
        }, {
          id:       'blackout_' + boAmts [boAmts .length - 1] .id,
          name:     blackouts [boAmts .length - 1] .name,
          amounts:  [boAmts [boAmts .length - 1]],
          blackout: true
        }],
        getUpdate: async data => {
          let nb = await getBlackouts (data .data);
          return [{update: nb .data [0]}, {update: nb .data [1]}]
        }
      }
    }
    var dates = [{start: this._budget .getStartDate(), end: this._budget .getEndDate()}];
    var data  = await this._getChildrenData (type, id, dates);
    let blackoutData;
    if (blackouts) {
      blackoutData = await getBlackouts (data .data);
      for (let i = 0; i < 2; i++)
        if (blackoutData .data [i] .amounts [0] .value != 0)
          data .data .push (blackoutData .data [i]);
    }
    return {
      name: this._categories .get (id .split ('_') .slice (-1) [0]) .name,
      cats: data .data .map (c => {return {
        id:        c .id,
        name:      c .name,
        amount:    c .amounts [0] .value,
        blackout:  c .blackout,
      }}),
      getUpdate: async (e,m,i) => {
        let updates = await data .getUpdate (e,m,i);
        if (blackoutData)
          updates = (updates || []) .concat (await blackoutData .getUpdate (await this._getChildrenData (type, id, dates)));
        return updates;
      }
    }
  }

  async _addYearCategoriesGraph (name, ids, blackouts, view, popup, position, direction) {
    ids = ids
      .map    (id => {return id .startsWith ('leaf_')? id .split('_') [1]: id})
      .filter (id => {return ! id .includes ('_')});
    if (ids .length) {
      var type = name == '_budgetChart'? NavigateValueType .BUDGET: NavigateValueType .ACTUALS;
      var data = await Promise .all (ids .map (async (id,i) => {
        let data = await this._getYearsData (type, id, blackouts);
        if (i != 0)
          for (let c of data .cats) {
            c .name        = data .name + ': ' + c .name;
            c .isSecondary = true;
          }
        return data;
      }));
      data = data .reduce ((u,d) => {
        u .cats = (u .cats || []) .concat (d .cats);
        u .getUpdate = (u .getUpdate || []) .concat (d .getUpdate);
        if (! u .name)
          u .name = d .name;
        return u
      }, {})
      if (data .cats .length && (!popup || data .cats .length > 1 || ! data .cats [0] .id .includes ('leaf_'))) {
        let updater = this._addUpdater (view, async (eventType, model, ids) => {
          let update = (await Promise .all (data .getUpdate .map (async g => {return g (eventType, model, ids)})))
            .reduce ((update, u) => {
              return u? update .concat (u): update;
            }, [])
          if (update .length)
            updateView (update);
        })
        if (!! data .cats .find (c => c .amount != 0 && ! c .blackout))
          var updateView = view .addDoughnut (data, name, popup, position, direction, () => {
            this._deleteUpdater (view, updater);
          });
      }
    }
  }

  async _addYearCategoriesGraphs (name, view, toHtml) {
    var income      = this._budget .getIncomeCategory();
    var withdrawals = this._budget .getWithdrawalsCategory();
    var savings     = this._budget .getSavingsCategory();
    var expense     = this._budget .getExpenseCategory();
    view .addGroup (name + 's', toHtml);
    for (let root of [[income,withdrawals], [savings], [expense]])
      await this._addYearCategoriesGraph (name, root .map (r => {return r._id}), root .includes (savings) && [income, withdrawals, expense], view);
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
      amounts = (root .children || []) .concat (root .zombies || []) .map (cat => {return {
        cat:    cat,
        amount: this._variance .getAmount (cat._id, date)
      }});
      let total = ['month', 'year'] .reduce ((total, per) => {
        total [per] = amounts .reduce ((o, entry) => {
          if (entry .amount [per])
          if (entry .amount [per])
            for (let p of Object .keys (entry .amount [per] .amounts))
              o[p] = (o[p] || 0) + entry .amount [per] .amounts [p];
          return o
        }, {})
        if (total [per] .budgetlessActual) {
          let t = Array .from (Object .keys (total [per])) .reduce ((t,p) => {return t + total [per] [p]}, 0);
          if (t != total [per] .budgetlessActual)
            total [per] .budgetlessActual = t;
        }
        return total
      }, {})
      let rootAmount  = this._variance .getAmount (root._id, date);
      let otherAmount = ['month', 'year'] .reduce ((o,per) => {
        if (rootAmount [per]) {
          if (total [per] && total [per] .budgetlessActual) {
            o [per] = {budgetlessActual: (rootAmount [per] .amounts .curBudgetedActual || 0) - (total [per] .budgetlessActual || 0)};
          } else {
            o [per] = {};
            for (let p of Object .keys (rootAmount [per] .amounts))
              o [per] [p] = rootAmount [per] .amounts [p];
            for (let p of Object .keys (total [per]))
              o [per] [p] = (o [per] [p] || 0) - total [per] [p];
          }
        }
        return o;
      }, {});
      let oaTotal = ['month', 'year'] .reduce ((o,per) => {
        o [per] = (otherAmount [per]? Array .from (Object .keys (otherAmount [per])): []) .reduce ((t,p) => {
          return t + (otherAmount [per] [p] || 0);
        }, 0)
        return o
      }, {});
      let raTotal = ['month', 'year'] .reduce ((o,per) => {
        o [per] = (rootAmount [per]? Array .from (Object .keys (rootAmount [per] .amounts)): []) .reduce ((t,p) => {
          return t + rootAmount [per] .amounts [p];
        }, 0)
        return o
      }, {});
      if (Array .from (Object .keys (oaTotal)) .reduce ((t,p) => {return t + oaTotal [p]}, 0) > 0) {
        for (let per of ['month', 'year'])
          if (rootAmount [per]) {
            rootAmount [per] .amounts = (raTotal [per] != oaTotal [per]) && otherAmount [per];
            if (Math .abs (rootAmount [per]) == 1)
              rootAmount [per] = 0;
          }
        if (Array .from (Object .keys (rootAmount)) .reduce ((t,p) => t + oaTotal [p], 0) > 0)
          amounts .push ({
            cat: {
              _id:      'other_' + root._id,
              name:     'Other',
              children: []
            },
            amount: rootAmount
          })
      }
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

    var date    = Math .min (Types .dateMY .today(), this._budget .getEndDate());
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
          if (oldMonths .length != months .length || oldYears .length != years .length) {
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
    var roots      = [this._budget .getExpenseCategory(), this._budget .getSavingsCategory(), this._budget .getIncomeCategory(), this._budget .getWithdrawalsCategory()];
    var labelWidth = this._getProgressGraphLabels (roots);
    let rootsAdded;

    const addGraphs = () => {
      rootsAdded = [];
      for (let root of roots) {
        const added = this._addProgressGraph (root, null, false, undefined, labelWidth, true, true, true);
        if (added)
          rootsAdded .push (root);
      }
    }

    const showHelp = modal => this._progressView .addHelpTable (
      [
        'Use "Inbox" to start adding transactions to track your spending.',
        'Use "Plan" to start planning a budget.',
        'On any page ...'
      ], [
        ['Search transactions',               'CMD + F'],
        ['Show help',                         'CMD + /'],
        ['Deep deeper into graphs or tables', 'Click or ALT + Click or bars, names or values']
      ],
      modal
    );

    const updater = this._addUpdater (this._progressView, (eventType, model, ids) => {
      if (model == 'ActualsModel') {
        const affectedRoots = ids
          .map    (id => this._categories .getPath (this._categories .get (id)) [0])
          .reduce ((a,e) => a .concat (e), [])
        if (affectedRoots .length && ! affectedRoots .find (r => rootsAdded .includes (r))) {
          this._progressView .removeProgressGraphs();
          this._progressView .removeHelpTable();
          addGraphs();
        }
      }
    });

    addGraphs();
    Help .add ('Progress', showHelp);
    if (rootsAdded .length == 0)
      showHelp (false);
  }





  /****************************/
  /***** PROGRESS SIDEBAR *****/

  _addPinnedCategories() {
    const updateView = this._progressView .addProgressSidebarGroup ([{icon: 'lnr-pushpin'},' Pinned Categories'], '');
    const pinnedCategories = PinnedCategories .getInstance();
    const update = () => {
      const cats = pinnedCategories .get() .map (cid => this._categories .get (cid) || cid)
      for (const cat of cats)
        if (typeof cat != 'object')
          pinnedCategories .remove (cat);
      updateView (cats
        .filter (cat => typeof cat == 'object')
        .map    (cat => ({id: cat._id, name: cat .name, icon: 'lnr-cross', type: 'pinned'}))
      );
    }
    pinnedCategories .setObserver (update);
    update();
    return update;
  }

  _addBigPicture() {
    let updateView = this._progressView .addProgressSidebarGroup('Savings this Year', '');
    let update = varianceList => {
      let sav = this._budget .getAmount (this._budget .getSavingsCategory())     .amount;
      let inc = this._budget .getAmount (this._budget .getIncomeCategory())      .amount;
      let exp = this._budget .getAmount (this._budget .getExpenseCategory())     .amount;
      let wth = this._budget .getAmount (this._budget .getWithdrawalsCategory()) .amount;
      let ovp = varianceList .reduce ((t,v) => {return t + (v .prev < 0? v .prev: 0)}, 0);
      let ovc = varianceList .reduce ((t,v) => {
        let a = Math .max (0, v .prev) + v .cur;
        return t + (a < 0? a: 0)
      }, 0);
      let ovr = ovp + ovc;
      let una = -(inc + (sav + exp));
      let list = [];
      if (sav > 0)
        list .push ({name: 'Planned Savings', amount: sav});
      if (una < -50 || una > 50)
        list .push ({
          name:    una > 0? 'Unallocated Income' : 'Over-Allocated Income',
          tooltip: una > 0? 'Planned income not allocated in budget.': 'Budget allocation exceeds planned income.',
          amount:  una
        })
      else
        una = 0;
      if (ovr < -50)
        list .push ({
          name: 'Over Budget',
          nameTooltip:
            'Over ' +
            (ovp < -50?              ' ' + Types .moneyDZ .toString (-ovp) + ' last month': '') +
            (ovp < -50 && ovc < -50? ' plus': '') +
            (ovc < -50?              ' ' + Types .moneyDZ .toString (-ovc) + ' this month': '') + '.',
          amount: ovr
        })
      else
        ovr = 0;
      let stc = this._actuals .getCashFlowBalance (this._budget .getStartDate());
      if (stc < -50 || stc > 50) {
        let tt =
            'End of year ' +
            Types .moneyDZ .toString (Math .abs (stc + una + ovr)) +
            ' cash-flow ' +
            (stc + una + ovr < 0? ' deficit.': stc + una + ovr == 0? 'balance.': 'surplus.');
        list .push ({
          name:    'Starting Cash Flow',
          amount:  stc,
          tooltip: tt
        });
      }
      if (wth < 0)
        list .push ({name: 'Savings Withdrawals', amount: wth});
      if (sav + una + ovr + wth)
        list .push ({name: 'Projected Savings', amount: sav + una + ovr + wth});
      if (inc != 0)
        list .push ({name: 'Income Saved', percent: (sav + una + ovr + wth) * 1.0 / (-inc)});
      updateView (list);
    }
    return update;
  }

  _addTopVariance (title, tooltip, choose, getAmount, flag, sortOrder=1) {
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
        .sort ((a,b) => {return a .amount > b .amount? -sortOrder: a .amount == b .amount? 0: sortOrder})
      updateView (list);
    }
    return update;
  }

  _addProgressSidebar (toHtml, noAnimateSidebar) {
    this._progressView .addProgressSidebar (noAnimateSidebar);
    const pinnedCategoriesUpdate = this._addPinnedCategories();
    let bigPictureUpdate = this._addBigPicture();
    let issuesUpdate = this._addTopVariance (
      'Budget Issues',
      'Top over-budget amounts this month and last.',
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
      let endOfLastMonth = Types .date .monthEnd (Types .date .addMonthStart (Types .date .today(), -1));
      let toLastMonthVar = Array .from (this._variance .getVarianceList ([this._budget .getExpenseCategory()], {end: endOfLastMonth}, true)
        .concat           (this._variance .getVarianceList ([this._budget .getExpenseCategory()], {end: Types .date .today()}, true))
        .filter           (v => {return v .amount < 50})
        .reduce ((m,v) => {
          let e = m .get (v .cat._id);
          m .set (v .cat._id, {cat: v .cat, amount: Math .min (v .amount, e? e .amount: 0)});
          return m;
        }, new Map()) .values())
      let toTodayVar = this._variance .getVarianceList ([this._budget .getExpenseCategory()], {end: Types .date .today()}, true);
      let savings    = this._variance .getVarianceList ([this._budget .getExpenseCategory()], {end: Types .date .today()}) .map (v => {return {cat: v .cat, amount: v .prev + (v .cur < 0? v .cur: 0)}});
      let futureVar  = this._variance .getVarianceList ([this._budget .getExpenseCategory()], {start: Types .date .addMonthStart (Types .date .today(), 1)});
      bigPictureUpdate (toTodayVar);
      issuesUpdate     (toLastMonthVar);
      savingsUpdate    (savings);
      futureUpdate     (futureVar);
    }
    update();
    this._addUpdater (this._progressView, {force: true, updater: (e,m,i) => update()});
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
   *       stackPosition: [i,j] i is stack # and j is position in stack
   *       hasNoParent: true iff category rooting this group has no parent
   *       isZombie:    true iff category rooting this group is a zombie
   *       rows: [{
   *         name:    name for this row
   *         id:      category id(s) for this row
   *         isCredit: true iff this is a credit amount
   *         amounts: array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */
  async _getHistoryData (parentIds, date, filter) {
    const defaultParents  = [this._budget .getWithdrawalsCategory(), this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    parentIds           = (parentIds || (defaultParents .map (p => {return p._id}))) .filter (pid => ! pid .includes ('_'));
    // get historic amounts
    const historicYears = this._actuals .getHistoricYears();
    let historicAmounts = [];
    for (const year of historicYears) {
      historicAmounts .push (Promise .all (parentIds .map (async pid => {
        const parent   = this._categories .get  (pid);
        const isCredit = this._budget .isCredit (parent);
        const isGoal   = this._budget .isGoal   (parent);
        const children = (parent .children || []) .concat (parent .zombies || []);
        const amounts  = Array .from (children .reduce ((m,c) => {
          let a = this._actuals .getAmountRecursively (c, year .start, year .end) * (isCredit? -1: 1);
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
        }, new Map()) .values());
        let parentAmount = this._actuals .getAmountRecursively (parent, year .start, year .end) * (isCredit? -1: 1);
        let otherAmount  = parentAmount - amounts .reduce ((t,a) => {return t + a .amount}, 0);
        if (otherAmount != 0)
          amounts .push ({
            id:       'other_' + parent._id,
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
      })))
    }
    historicAmounts = await Promise .all (historicAmounts);
    // compute future budgets
    let budgets = [];
    for (let y = 0; y < PreferencesInstance .get() .futureYears; y++)
      budgets .push (this._budget .getDescriptor (y))
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
        for (let cat of (parent .children || [])) {
          let ba = this._budget .getAmount (cat, budget .start, budget .end);
          amounts .push ({
            id:       cat._id,
            name:     cat .name,
            sort:     cat .sort,
            isCredit: isCredit,
            isGoal:   isGoal,
            amount:   ba .amount * (isCredit? -1: 1),
            grossAmount: ba .grossAmount && ba .grossAmount * (isCredit? -1: 1)
          });
        }
        var parentAmount = this._budget .getAmount (parent, budget .start, budget .end) .amount * (isCredit? -1: 1);
        var otherAmount  = parentAmount - amounts .reduce ((t,a) => {return t + a .amount}, 0);
        if (otherAmount != 0)
          amounts .push ({
            id:       'other_' + parent._id,
            name:     'Other',
            isCredit: isCredit,
            isGoal:   isGoal,
            amount:   otherAmount
          })
      }
    }
    // combine history and future and normalize to category name
    budgets       = historicYears .concat (budgets);
    budgetAmounts = historicAmounts .concat (budgetAmounts);
    budgetAmounts = budgetAmounts .map (ba => {
      return Array .from (ba .reduce ((m, a) => {
        let e = m .get (a .name);
        if (e) {
          e .amounts = e .amounts .concat (a .amounts);
          e .id      = e .id      .concat (a .id);
        } else {
          a .id = [] .concat (a.id);
          m.set (a .name, a);
        }
        return m;
      }, new Map()) .values())
    });
    // get name-normalized parent id list
    let normalizedIds = Array .from (budgetAmounts .reduce ((s,ba) => {
      return ba .reduce ((s, a) => {return s .add (a .id .join ('$'))}, new Set ())
    })) .map (ba => {return ba .split ('$')});
    // invert list from [period,cats] to [cat,periods] for each parent
    var cats = normalizedIds .map (pid => {return budgetAmounts .reduce ((map, budgetAmount) => {
      return (budgetAmount .find (ba => {return ba .id .find (i => {return pid .includes (i)})}) || {amounts: []}) .amounts
        .reduce ((m,a) => {
          if (a .amount != 0) {
            let e = m .get (a .name);
            if (e && ! e .sort)
              e .sort = a.sort;
            if (!e)
              m .set (a .name, a);
          }
          return m
        }, map)
    }, new Map())});
    // compute return values
    let groups = normalizedIds .map ((pid, i) => {
      let pids   = pid .sort() .join ('$');
      let parent = new Map();
      for (let ba of budgetAmounts) {
        let p = (ba .find (as => {return as .id .find (i => {return pid .includes (i)}) && as .name}));
        if (p)
          parent .set (p .id .join ('$'), p .name);
      }
      let stackPosition = normalizedIds .length > 1 &&
        (pid == this._budget .getIncomeCategory()._id? [0,0]:
          pid == this._budget .getWithdrawalsCategory()._id? [0,1]:
            pid == this._budget .getExpenseCategory()._id? [1,0]: [1,1]);
      let cat = this._budget .getCategories() .get (pid [0]);
      return {
        name:          Array .from (parent .values()) [0],
        stackPosition: stackPosition,
        id:            Array .from (parent .keys()) [0] .split('$'),
        hasNoParent:   cat .parent == null,
        isZombie:      ! cat .budgets .includes (this._budget .getId()),
        rows:          Array .from (cats [i] .values())
          .sort ((a,b) => {return a.sort==null? 1: b.sort==null? -1: a.sort<b.sort? -1: 1})
          .map (cat => {
            var ids = Array .from (budgetAmounts .reduce ((s,ba) => {
              return ba [i] .amounts .reduce ((s,a) => {
                if (a .name == cat .name)
                  s .add (a .id);
                return s;
              }, s)
            }, new Set()));
            return {
              name:        cat .name,
              id:          ids,
              isCredit:    cat .isCredit,
              isGoal:      cat .isGoal,
              amounts:  budgetAmounts .map (ba => {
                var group = ba .find (as => {return as .id .sort () .join ('$') == pids});
                if (group) {
                  let a = group .amounts
                    .filter (a => {return a .name == cat .name})
                    .reduce ((o,e) => {
                      o .id .push (e .id);
                      o .amount += e .amount;
                      o .grossAmount = e .grossAmount && (o .grossAmount || 0) + e .grossAmount
                      return o;
                    }, {id: [], amount: 0, grossAmount: undefined});
                  return {
                    id:    a .id,
                    value: a .amount,
                    gross: a .grossAmount
                  }
                } else
                  return {value: 0}
              })
            }
          })
      }
    });
    let result = {
      cols:      budgets .map (b => {return b .label}),
      dates:     budgets .map (b => {return {start: b .start, end: b .end}}),
      highlight: historicYears .length,
      groups:    groups,
      getUpdate: async eventIds => {
        let update  = [];
        let newData = await this._getHistoryData (parentIds, date, filter);
        for (let g of newData .groups) {
          if (eventIds .includes (g .id))
            update .push ({update: {id: g .id, name: g .name}});
          for (let r of g .rows)
            update .push ({update: {id: r .id, name: r .name, amounts: r .amounts}});
        }
        return update;
      }

    }
    result .startBal = [this._actuals .getCashFlowBalance (this._budget .getStartDate()) - historicAmounts .reduce ((t, year) => {
      return t + year .reduce ((t, root) => {
        return t + root .amounts .reduce ((t, a) => {return t + (a .isCredit? 1: -1) * a .amount}, 0)
      }, 0)
    }, 0)];
    for (let i = 1; i < result .cols .length; i++)
      result .startBal [i] = result .startBal [i-1] + result .groups .reduce ((t,g) => {
        return t + g .rows .reduce ((t,r) => {
          return t + r .amounts [i-1] .value * (r .isCredit? 1: -1)
        }, 0)
      }, 0)
    if (filter)
      result = this._filterHistoryBySlider (result);
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
    for (let g of result .groups)
      g .rows = g .rows .filter (r => {
        return r .amounts .find (a => {return a .value != 0})
      });
    return result;
  }

  _filterHistoryBySlider (dataset) {
    let first = this._historySliderLeft;
    let last  = this._historySliderRight && this._historySliderRight + 1;
    if (first == null || last == null) {
      let cbi = dataset .cols .indexOf (this._budget .getLabel());
      if (cbi < 0)
        cbi = 0;
      first = first || Math .max (cbi-5, 0);
      last  = last  || Math .min (cbi+5, dataset .cols .length-1);
    }
    dataset .cols     = dataset .cols .slice  (first, last);
    dataset .dates    = dataset .dates .slice (first, last);
    dataset .startBal = dataset .startBal .slice (first, last);
    for (let g of dataset .groups)
      for (let r of g .rows)
        r .amounts = r .amounts .slice (first, last);
    dataset .highlight -= first;
    dataset .groups = dataset .groups .filter (g => {return g .rows .find (r => {return r .amounts .find (a => {return a.value != 0})})})
    return dataset;
  }

  _addHistorySlider (view, dataset, toHtml, leftValue, rightValue, graphUpdater, tableUpdater) {
    let cbi = dataset .cols .indexOf (this._budget .getLabel());
    if (cbi < 0)
      cbi = 0;
    view .addSlider ({
      left:  {min:   0,                       start: NavigateSavedHistorySlider? NavigateSavedHistorySlider[0]: Math .max (cbi-5, 0)},
      right: {max:   dataset .cols .length-1, start: NavigateSavedHistorySlider? NavigateSavedHistorySlider[1]: Math .min (cbi+5, dataset .cols .length-1)},
      keep:  {count: 2},
      onChange: (values, handle) => {
        this._historySliderLeft = Math .floor (values [0]);
        this._historySliderRight = Math .floor (values [1]);
        NavigateSavedHistorySlider = [this._historySliderLeft, this._historySliderRight];
        leftValue  .text (dataset .cols [this._historySliderLeft]);
        rightValue .text (dataset .cols [this._historySliderRight]);
        let rds       = Object .assign ({}, dataset);
        rds .cols     = rds .cols . slice (this._historySliderLeft, this._historySliderRight + 1);
        rds .dates    = rds .dates .slice (this._historySliderLeft, this._historySliderRight + 1);
        rds .startBal = rds .startBal .slice (this._historySliderLeft, this._historySliderRight + 1);
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
        for (let g of rds .groups)
          g .rows = g .rows .filter (r => {return r .amounts .find (a => {return a .value})})
        rds .groups = rds .groups .filter (g => {return g .rows .find (r => {return r .amounts .find (a => {return a .value != 0})})})
        if (graphUpdater)
          graphUpdater ([{filterCols: {start: this._historySliderLeft, end: this._historySliderRight}}]);
        if (tableUpdater)
          tableUpdater ([{replace: rds}]);
      }
    }, toHtml)
  }

  _filterNetWorthBySlider (dataset) {
    let first = this._netWorthSliderLeft || 0;
    let last  = this._netWorthSliderRight? this._netWorthSliderRight + 1: dataset .cols .length;
    dataset .cols  = dataset .cols .slice  (first, last);
    for (let r of dataset .rows) {
      r .amounts = r .amounts .slice (first, last);
      r .detail  = r .detail .slice (first, last);
    }
    dataset .highlight -= this._netWorthSliderLeft || 0;
    return dataset;
  }

  _addNetworthSlider (view, dataset, toHtml, leftValue, rightValue, graphUpdater, tableUpdater) {
    let cbi = dataset .cols .indexOf (Types .dateMY .toString (this._budget .getEndDate())) - 1;
    if (cbi < 0)
      cbi = 0;
    view .addSlider ({
      left:  {min: 0,                       start: NavigateSavedNetWorthSlider? NavigateSavedNetWorthSlider[0]: Math .max (cbi-5, 0)},
      right: {max: dataset .cols .length-1, start: NavigateSavedNetWorthSlider? NavigateSavedNetWorthSlider[1]: Math .min (cbi+10, dataset .cols .length-1)},
      keep:  {count: 2},
      onChange: (values, handle) => {
        this._netWorthSliderLeft = Math .floor (values [0]);
        this._netWorthSliderRight = Math .floor (values [1]);
        NavigateSavedNetWorthSlider = [this._netWorthSliderLeft, this._netWorthSliderRight];
        leftValue  .text (dataset .cols [this._netWorthSliderLeft]);
        rightValue .text (dataset .cols [this._netWorthSliderRight]);
        let rds = Object .assign ({}, dataset);
        rds .cols = rds .cols .slice (this._netWorthSliderLeft, this._netWorthSliderRight + 1);
        rds .rows = rds .rows .map (r => {
          r = Object .assign ({}, r);
          r .amounts = r .amounts .slice (this._netWorthSliderLeft, this._netWorthSliderRight + 1);
          r .detail  = r .detail  .slice (this._netWorthSliderLeft, this._netWorthSliderRight + 1);
          return r;
        })
        rds .highlight -= this._netWorthSliderLeft;
        graphUpdater ([{filterCols: {start: this._netWorthSliderLeft, end: this._netWorthSliderRight}}]);
        tableUpdater ([{replace: rds}]);
      }
    }, toHtml)
  }

  async _addHistoryGraph (parentIds, popup, position, view, dataset, toHtml, startColor) {
    if (! dataset)
      dataset = await this._getHistoryData (parentIds, date);
    if (dataset .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      const updater = this._addUpdater (view, async (eventType, model, ids) => {
        if (model == 'SchedulesModel' || model == 'ActualsModel')
          updateView (await dataset .getUpdate (ids));
      });
      const updateView = view .addHistoryGraph (dataset, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml, dataset .groups .length == 1 && dataset .groups [0] .rows .length == 1? startColor: 0);
      return updateView;
    }
  }

  async _addHistoryTable (parentIds, date, skipFoot, popup, position, view, dataset, toHtml) {
    if (! dataset)
      dataset = await this._getHistoryData (parentIds, date);
    const datasetCopy   = Object .assign ({}, dataset);
    if (datasetCopy .groups .reduce ((m,d) => {return Math .max (m, d .rows .length)}, 0)) {
      const updater = this._addUpdater (view, async (eventType, model, ids) => {
        dataset .groups   = await this._getHistoryData (parentIds, date, date) .groups;
        let ds            = JSON .parse (JSON .stringify (dataset));
        this._filterHistoryBySlider (ds)
        for (const g of ds .groups)
          g .rows = g .rows .filter (r => {return r .amounts .find (a => {return a .value != 0})});
        updateView ([{replace: ds}])
      });
      const updateView = view .addHistoryTable (datasetCopy, datasetCopy .cols .length == 1, skipFoot, popup, position, () => {
        this._deleteUpdater (view, updater);
      }, toHtml);
      return updateView;
    }
  }





  /*******************/
  /**** NET WORTH ****/

  /**
   * Parameters
   *   accountIds    list of accountIds or null to list all non-cashflow groups
   *   columnLabel   name of column or null to get data for all columns (from oldest history to furthest in future)
   * returns {
   *   cols:    array of column names (budgets)
   *   highlight:  hisDesc .length,
   *   rows: [{
   *      name:    account name
   *      amounts: array of amounts, one for each column
   *      detail: [{
   *       intAmt: a .intAmt,
   *       infAmt: a .infAmt,
   *       addAmt: a .add,
   *       subAmt: a .sub,
   *       addCat: a .addCat,
   *       subCat: a .subCat
   *     }]
   *   }]
   * }
   */


  async _getNetWorthData (accountIds, columnLabel) {

    // initialize
    let accounts = this._accounts .getAccounts()
      .filter (a => {return a .form == AccountForm .ASSET_LIABILITY})
      .sort   ((a,b) => {return a .sort < b .sort? -1: 1});
    let idIndex = accounts .map (a => {return a._id});
    let balances = this._historicBalances
      .filter (b => {return idIndex .find (aid => {return idIndex .includes (aid)})})
      .sort   ((a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1});
    let rows;
    if (! accountIds)
      rows = accounts .filter (a => {return a .form == AccountForm .ASSET_LIABILITY && a .type == AccountType .GROUP})
    else
      rows = accounts .filter (a => {return accountIds .includes (a._id)})
    let budgetStart = this._budget .getStartDate();
    let budgetEnd   = this._budget .getEndDate();

    // compute column dates; start at end of FY with oldest history or LAST FY if no history
    let today         = Types .date .today();
    let oldestHistory = balances .map (b => {return b .date}) .reduce ((m ,d) => {return m? d? Math .min (m,d): m: d}, null);
    let startDate     = Types .dateFY .getFYEnd (oldestHistory || Types .date .addMonthStart (today, -12), budgetStart, budgetEnd);
    let endDate = Types .date .addYear (Types .dateFY .getFYEnd (today, budgetStart, budgetEnd), PreferencesInstance .get() .futureYears || 0);
    let colDates = [];
    for (let d = startDate; d <= endDate; d = Types .date .addYear (d, 1))
      colDates .push(d);

     // compute balances
    let rowsData = rows .map (row => {
      let rowAccounts = row .type == AccountType .GROUP
        ? accounts .filter (a => {return a .group == row._id})
        : [row];
      let rowData = rowAccounts .length
        ? rowAccounts .map (account => {return account .getBalances (colDates)})
        : [Account .getZeroBalances (colDates)];
      return {
        id:     row._id,
        name:   row .name,
        curBal: rowData .reduce ((s,acc) => {return s + (acc .curBal || 0)}, 0),
        liquid: rowData .reduce ((s,acc) => {return s & (acc .liquid || false)}, true),
        amounts: rowData
          .reduce ((s, acc) => {return acc .amounts .map ((a, i) => {
            return (s[i] || 0) + (a || 0)
          })}, []),
        detail:  rowData
          .reduce ((s, acc) => {return acc .detail  .map ((d, i) => {
            let intAmt = ((d && d .intAmt) || 0), addIntAmt=0;
            if (acc .isLiability) {
              addIntAmt = intAmt;
              intAmt    = 0;
            }
            return {
              ids:    ((s[i] && s[i] .ids)    || []) .concat ((d && d .id) || []),
              intAmt: ((s[i] && s[i] .intAmt) || 0) + intAmt,
              infAmt: ((s[i] && s[i] .infAmt) || 0) + ((d && d .infAmt) || 0),
              addAmt: ((s[i] && s[i] .addAmt) || 0) + ((d && d .addAmt) || 0) + addIntAmt,
              subAmt: ((s[i] && s[i] .subAmt) || 0) + ((d && d .subAmt) || 0),
              addCat: ((s[i] && s[i] .addCat) || []) .concat ((d && d. addCat) || []),
              subCat: ((s[i] && s[i] .subCat) || []) .concat ((d && d. subCat) || [])
            }
          })}, [])
      };
    })
    let result = {
      cols:      colDates .map (d => {return Types .dateMY .toString (d)}),
      highlight: Types .date._year (budgetStart) - Types .date._year (startDate) + 1,
      rows:      rowsData
    }
    if (columnLabel) {
      let ci = result .cols .indexOf (columnLabel);
      if (ci != -1) {
        result .cols = [result .cols [ci]];
        result .rows = result .rows .map (row => {
          row .amounts = [row .amounts [ci]];
          row .detail  = [row .detail  [ci]];
          return row;
        })
      }
    }
    return result;
  }


  _addNetWorthGraph (view, dataset, toHtml) {
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
    let updater = this._addUpdater (view, (eventType, model, ids) => {
      if (['Accounts', 'ActualsModel', 'BalanceHistory'] .includes (model))
        updateView();
    })
    let updateView = view .addNetWorthGraph (dataset, toHtml, () => {
      this._deleteUpdater (view, updater);
    });
    return updateView;
  }

  async _addNetWorthTable (view, dataset, popup, html, position) {
    let updater = this._addUpdater (view, (eventType, model, ids) => {
      if (['Accounts', 'ActualsModel', 'BalanceHistory'] .includes (model)) {
        updateView();
      }
    })
    let updateView = view .addNetWorthTable (dataset, popup, html, position, () => {
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

  async _update (eventType, model, ids, doc, arg, skipLiveUpdate) {
    for (let view of this._updaters .keys()) {
      if (!view || !view .isVisible || view .isVisible()) {
        if (! skipLiveUpdate) {
          if (ui .isResponsive || view != this._progressView) {
            for (const updater of this._updaters .get (view))
              if (typeof updater != 'function')
                updater = updater .updater;
              updater (eventType, model, ids, doc, arg);
          } else {
            let delayed;
            for (const updater of this._updaters .get (view))
              if (typeof updater != 'function' && updater .force)
                updater .updater (eventType, model, ids, doc, arg);
              else
                delayed = true;
            if (delayed)
              ui .whenResponsive (view, () => view .refreshHtml());
          }
        }
      } else
        view .resetHtml();
    }
  }






  /**************************/
  /***** STATIC METHODS *****/

  static async showActualMonthGraph (id, dates, html, position, includeMonths=true, includeYears=true) {
    if (NavigateInstance && NavigateInstance._progressView)
      await NavigateInstance._addMonthsGraph ('_activityMonthsGraph', NavigateInstance._progressView, [id], true, position, html, includeMonths, includeYears, [], dates);
  }
  static async showBudgetMonthGraph (id, dates, html, position, includeMonths=true, includeYears=true) {
    if (NavigateInstance && NavigateInstance._progressView)
      await NavigateInstance._addMonthsGraph ('_budgetMonthsGraph', NavigateInstance._progressView, [id], true, position, html, includeMonths, includeYears, []);
  }
}

var NavigateInstance;
var NavigateSavedHistorySlider;
var NavigateSavedNetWorthSlider;

const NavigateValueType = {
  BUDGET:            0,
  BUDGET_YR_AVE:     1,
  BUDGET_YR_AVE_ACT: 2,
  ACTUALS:           3,
  ACTUALS_BUD:       4,
}

const NavigateValueType_BUDGET_TYPES = [NavigateValueType .BUDGET, NavigateValueType .BUDGET_YR_AVE, NavigateValueType .BUDGET_YR_AVE_ACT];