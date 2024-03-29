class VarianceModel extends Observable {
  constructor (budget, actuals) {
    super();
    this._budget           = budget;
    this._actuals          = actuals;
    this._budgetObserver   = this._budget  .addObserver (this, this._onModelChange);
    this._actualsObserver  = this._actuals .addObserver (this, this._onActualsModelChange);
    this._accountsModel    = this._actuals .getAccountsModel();
  }

  delete() {
    this._budget  .deleteObserver (this._budgetObserver);
    this._actuals .deleteObserver (this._actualsObserver);
  }

  _onActualsModelChange (eventType, doc, arg, source) {
    this._notifyObservers (eventType, doc, arg, source, this._actuals);
  }

  _onModelChange (eventType, doc, arg, source, model) {
    this ._notifyObservers (eventType, doc, arg, source, model);
  }

  getBudget() {
    return this._budget;
  }

  getActuals() {
    return this._actuals;
  }

  getAmountByMonth (id, date, includePriorYear) {
    const cat = this._budget.getCategories ().get (id);
    const data = {date: [], budget: [], actual: []};
    const bs = this._budget.getStartDate ();
    const be = this._budget.getEndDate ();
    const st = Types.dateFY.getFYStart (date, bs, be);
    const en = Types.dateFY.getFYEnd (date, bs, be);
    for (let dt = st; dt <= en; dt = Types.date.addMonthStart (dt, 1)) {
      const period = {cur: {start: dt, end: Math.min (Types.date.monthEnd (dt), date)}};
      const amount = this._getAmountDown (cat, period);
      data .date   .push (period .cur);
      data .budget .push (amount .month? amount .month .budget .cur: 0);
      data .actual .push ((amount .month? amount .month .actual .cur: 0) + (amount .none? amount .none .actual .cur: 0));
    }
    if (includePriorYear) {
      let homonyms = (cat .parent && (cat .parent .children || []) .concat (cat .parent .zombies || []) .filter (c => {return c .name == cat .name})) || [];
      data .priorYear = [];
      const ps = Types.date.addYear (st, - 1);
      const pe = Types.date.addYear (en, - 1);
      for (let dt = ps; dt < pe; dt = Types.date.addMonthStart (dt, 1)) {
        if (st < be) {
          const actual = homonyms.reduce ((a, cat) => a + this._actuals.getAmountRecursively (cat, dt, Types.date.monthEnd (dt)), 0)
          data.priorYear.push (actual * (this._budget.isCredit (cat) ? - 1 : 1));
        } else {
          const amount = this._budget.getAmount (cat, dt, Types.date.monthEnd (dt));
          data.priorYear.push (amount.month ? amount.month.amount * (this._budget.isCredit (cat) ? - 1 : 1) : 0);
        }
      }
    }
    return data;
  }

  _calculateVariance (amount, isCredit, isGoal, isYear, isBudgetless) {
    if (isBudgetless) {
      return {
        amounts: {
          budgetlessActual: amount .actual .cur
        },
        isCredit:     isCredit,
        isGoal:       isGoal,
        isYear:       isYear,
        isBudgetless: true
      }
    } else {
      if (amount .actual .prev < 0 && amount .actual .cur > 0) {
        var a = Math .min (-amount .actual .prev, amount .actual .cur);
        amount .actual .prev += a;
        amount .actual .cur -= a;
      } else if (amount .actual .prev > 0 && amount .actual .cur < 0) {
        var a = Math .min (-amount .actual .cur, amount .actual .prev);
        amount .actual .cur += a;
        amount .actual .prev -= a;
      }
      var pOver    = amount .actual .prev > amount .budget .prev? amount .actual .prev - amount .budget .prev: 0;
      var pAvlForC = amount .actual .prev < amount .budget .prev? amount .budget .prev - amount .actual .prev: 0;
      var cAvl     = Math .max (0, amount .budget .cur - pOver + pAvlForC);
      var avl      = Math .max (0, (amount .budget .prev + amount .budget .cur) - (amount .actual .prev + amount .actual .cur))
      var pAvl     = isYear? 0: Math .max (0, amount .budget .prev - amount .actual .prev - amount .actual .cur);
      let variance = {
        amounts: {
          preBudgetedActual: isYear? Math .max (0, amount .budget .prev - pAvlForC): Math .min (pOver, amount .budget .cur),
          curBudgetedActual: Math .max (0, Math .min (amount .actual .cur, cAvl)),
          preOverActual:     Math .max (0, pOver - amount .budget .cur),
          curOverActual:     Math .max (0, amount .actual .cur    - cAvl),
          prevAvailable:     pAvl,
          curAvailable:      Math .max (0, avl - pAvl),
          available:         avl
        },
        isCredit:        isCredit,
        isGoal:          isGoal,
        isYear:          isYear,
      }
      let total = Object .keys (variance .amounts) .reduce ((t,k) => {return t + (k!='available'? variance .amounts [k]: 0)}, 0)
      let over  = variance .amounts .preOverActual + variance .amounts .curOverActual;
      variance .percentInBudget = 1 - (total== 0? 0: over / total);
      return variance;
    }
  }

  _addAmounts (a, b) {
    var s = {};
    for (let sch of ['none', 'month', 'year'])
      if (a [sch] || b [sch])
        for (let typ of ['actual', 'budget'])
          for (let per of ['prev', 'cur']) {
            if (! s [sch])
              s [sch] = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}}
            s [sch] [typ] [per] = ((a [sch] && a [sch] [typ] [per]) || 0) + ((b [sch] && b [sch] [typ] [per]) || 0);
          }
    s .isBudgetless = a .isBudgetless && b .isBudgetless;
    s .isCredit     = a .isCredit     || b .isCredit;
    s .isGoal       = a .isGoal       || b .isGoal;
    if (a .otherMonths || b .otherMonths)
      s .otherMonths = (a .otherMonths || 0) + (b .otherMonths || 0);
    return s;
  }

  _getZeroAmount() {
    return {isBudgetless: true}
  }

  _toggleSignForAmount (a) {
    for (let sch of ['none', 'month', 'year'])
      for (let typ of ['actual', 'budget'])
        for (let per of ['prev', 'cur'])
          if (a [sch])
            a [sch] [typ] [per] *= -1;
  }

  _getScheduleTypeName (cat, period) {
    switch (this._budget.getCategories ().getType (cat, undefined, period.start)) {
      case ScheduleType .NONE:
        return 'none';
      case ScheduleType .MONTH:
        return 'month';
      case ScheduleType .YEAR:
        return 'year';
    }
  }

  /**
   * Get budget and actuals amounts for category
   */
  _getAmount (cat, period, skip) {
    var isCredit  = this._budget .isCredit    (cat);
    var isGoal    = this._budget .isGoal      (cat);
    var type = this._getScheduleTypeName (cat, period.cur);
    var amount    = {};
    amount [type] = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}};
    for (let per in period) {
      amount [type] .actual [per] = this._actuals .getAmount (cat, period [per] .start, period [per] .end, skip);
      const budget = this._budget  .getIndividualAmount (cat, period [per] .start, period [per] .end);
      amount [type] .budget [per] = budget [type]? budget [type] .amount: 0;
      if (type == 'year' && budget .month && budget .month .amount != 0) {
        if (! amount .month)
          amount .month = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}};
        amount .month .budget [per] = budget .month .amount;
      }
    }
    // if category has both types, then favour applying to monthly
    if (amount .month && amount .year) {
      if (amount .month .budget .prev > 0 && amount .year .actual .prev > 0) {
        let deal = 0;
        const fyStart = Types .dateFY .getFYStart (period .prev .start, this._budget .getStartDate(), this._budget .getEndDate());
        for (let st = fyStart; st < period .prev .end; st = Types .date .addMonthStart (st, 1)) {
          const en = Types .date .monthEnd (st);
          const ac = this._actuals .getAmount (cat, st, en, skip);
          const bu = this._budget  .getIndividualAmount (cat, st, en);
          deal += Math .min (ac, bu .month .amount);
        }
        amount .month .actual .prev += deal;
        amount .year  .actual .prev -= deal;
      } else if (amount .month .budget .cur > 0 && amount .year .actual .cur > 0) {
        const deal = Math .min (amount .month .budget .cur, amount .year .actual .cur);
        amount .month .actual .cur += deal;
        amount .year  .actual .cur -= deal;
      }
    }
    if (this._budget .getCategories() .getType (cat, undefined, undefined, true) .includes (ScheduleType .MONTH)) {
      let budgetEndDate = this._budget .getEndDate();
      if (period .cur .end != budgetEndDate) {
          amount .otherMonths = this._budget .getIndividualAmount (cat, Types .date .addMonthStart (period .cur .end, 1), budgetEndDate) .amount;
      }
    }
    amount .isBudgetless = type == 'none';
    amount .isCredit     = isCredit;
    amount .isGoal       = isGoal;

    if (isCredit)
      this._toggleSignForAmount (amount);
    return amount;
  }

  /**
   * Get budget and actual amounts for category and its children
   *   transactionFocused
   *     true:  variance based on actuals
   *            category actuals are those allocated to this category only
   *            only unallocated / unused budget amounts from descendants and ancestors propagate
   *     false: variance accumulates through hierarchy
   *            each category summarizes its descendants and handles unallocated amounts from ancestors
   */
  _getAmountDown (cat, period, skip, excludeChild, transactionFocused) {
    let   type      = this._getScheduleTypeName (cat, period.cur);
    let   amount    = this._getAmount (cat, period, skip);
    const chiAmount = (cat .children || []) .concat (cat .zombies || [])
      .filter (c => {return c != excludeChild})
      .reduce ((a, c) => {
        return this._addAmounts (a, this._getAmountDown (c, period, skip));
      }, this._getZeroAmount());

    // if we don't have a type and all children have the same type, assume their type
    if (type == 'none') {
      if (chiAmount .month && ! chiAmount .year) {
        type = 'month';
        amount .month = amount .none;
        amount .none  = undefined;
      } else if (chiAmount .year && ! chiAmount .month) {
        type = 'year';
        amount .year = amount .none;
        amount .none = undefined;
      }
    }
    // if our type is 'year' then children subtract from us
    if (type == 'year') {
      const chiTotal = ['none', 'month', 'year'] .reduce ((t,sch) => {
        return t + ['prev', 'cur'] .reduce ((t,per) => {return t + ((chiAmount [sch] && chiAmount [sch] .budget [per]) || 0)}, 0);
      }, 0);
      if (amount .year .budget .prev) {
        amount .year .budget .prev = Math .max (0, amount .year .budget .prev - chiTotal - (chiAmount .otherMonths || 0));
        amount .year .budget .cur  = 0;
      } else
        amount .year .budget .cur = Math .max (0, amount .year .budget .cur - chiTotal - (chiAmount .otherMonths || 0));
    }


    // If we have a type, then move any "none" actuals to this type
    if (type != 'none' && chiAmount .none) {
      for (const per of ['prev', 'cur'])
        amount [type] .actual [per] += chiAmount .none .actual [per] || 0;
      delete chiAmount .none;
    }

    // If transactionFocused then only excess available budget propagates from children
    if (transactionFocused)
      for (let sch of ['none','month','year'])
        for (let per of ['prev','cur'])
          if (chiAmount [sch]) {
            chiAmount [sch] .budget [per] = Math .max (0, chiAmount [sch] .budget [per] - chiAmount [sch] .actual [per]);
            chiAmount [sch] .actual [per] = 0;
          }

    amount        = this._addAmounts (amount, chiAmount);
    amount .type  = type;
    return amount;
  }

  /**
   * getAmountUp
   *    Look up hierarchy for (a) first ancestor that has a type and (b) unallocated actuals
   *    If skip != null then actuals are allocated proportionally else they go first to other children
   */
  _getAmountUp (cat, period, skip) {

    if (cat .parent) {
      // compute unallocated amount to distribute to children
      var amount = this._getAmount (cat .parent, period, skip);
      const categories = this._budget .getCategories();
      const parentType = categories .getType (cat .parent, undefined, period .cur .start);
      // subtract children if this is a yearly budget
      if (parentType == ScheduleType .YEAR)
        amount .year .budget .prev = Math .max (0, amount .year .budget .prev - (cat .parent .children || []) .concat (cat .parent .zombies || []) .reduce ((t,c) => {
          return t + this._budget .getIndividualAmount(c) .amount;
        }, 0));
      var upAmount = this._getAmountUp (cat .parent, period, skip);
      var budget   = ['month', 'year'] .reduce ((t,sch) => {
        if (amount [sch])
          return t + amount [sch] .budget .prev + (sch == 'month'? amount [sch] .budget .cur: 0);
        else
          return t;
      }, 0);
      var unalloc = ['prev', 'cur'] .reduce ((o,per) => {
        var actual = ['none', 'month', 'year'] .reduce ((t, sch) => {
          return t + (amount [sch]? amount [sch] .actual [per]: 0)
        }, 0) + upAmount [per];
        var use = Math .min (actual, budget);
        budget -= use;
        return (o [per] = actual - use) != null && o;
      }, {});

      // compute portion of unalloc for THIS child
      if (parentType == ScheduleType .NONE && (unalloc .prev > 0 || unalloc .cur > 0)) {

        // get amounts for children
        var children = (cat .parent .children || []) .concat (cat .parent .zombies || []) .map (child => {
          return {cat: child, amount: this._getAmountDown (child, period, skip)};
        });

        // compute total current budget, prorating year if not skip (i.e., proportional alloc)
        var monthsInPeriod = Types .date._difMonths (period .cur .end, period .prev .start);
        // compute children's budget, actual and available
        var thisBudget, totalBudget=0, thisActual, totalActual=0, thisAvail=[], totalAvail=[0,0];
        for (let child of children) {
          var budget = ['month', 'year'] .reduce ((t, sch) => {
            if (child .amount [sch]) {
              var a = [child .amount [sch] .budget .prev, 0];
              if (sch == 'month')
                a[0] += child .amount [sch] .budget .cur;
              else if (!skip && sch == 'year') {
                let pr = (a[0] * monthsInPeriod) / 12;
                a[1] = a[0] - pr;
                a[0] = pr;
              }
            } else
              var a = [0,0];
            t[0] += a[0];
            t[1] += a[1];
            return t;
          }, [0,0]);
          var actual = ['prev', 'cur'] .reduce ((t, per) => {
            return t + ['none', 'month', 'year'] .reduce ((t, sch) => {
              return t + ((child .amount [sch] && child .amount [sch] .actual [per]) || 0);
            }, 0)
          }, 0);
          var avail = [Math .max (0, budget[0] - actual), 0];
          avail [1] = Math .max (0, budget[1] - Math .max (0, actual - budget[0]));
          if (child .cat == cat) {
            thisBudget = budget[0];
            thisActual = actual;
            thisAvail  = avail;
          }
          totalBudget    += budget[0];
          totalActual    += actual;
          totalAvail [0] += avail [0];
          totalAvail [1] += avail [1];
        }
        // distributed unallocated amount to children
        //   - for yearly amounts first try to fit pro-rated amount, then full year
        var alloc = ['prev', 'cur'] .reduce ((o, per) => {
          let thisAlloc  = 0;
          let totalAlloc = [];
          for (let i = 0; i < 2; i++) {
            totalAlloc [i] = Math .min (unalloc [per], totalAvail [i]);
            if (skip) {
              //  to other children first
              var otherAvail = totalAvail [i] - thisAvail [i];
              var otherAlloc = Math .min (unalloc [per], otherAvail);
              thisAlloc     += Math .min (thisAvail [i], unalloc [per] - otherAlloc);
            } else {
              //  proportionally
              thisAlloc += totalAvail [i] != 0? Math .round (totalAlloc [i] * thisAvail [i] / totalAvail [i]): 0;
            }
            unalloc [per] -= totalAlloc [i];
          }
          totalAlloc    = totalAlloc [0] + totalAlloc [1];
          let overAlloc = totalBudget != 0?  Math .round (unalloc [per] * thisBudget / totalBudget): 1.0 / children .length;
          return (o [per] = thisAlloc + overAlloc) != null && o;
        }, {})
        alloc .addCats = upAmount .addCats .concat (alloc .prev + alloc .cur != 0? [cat .parent ._id]: []);
      } else
        var alloc = {prev: 0, cur: 0, addCats: upAmount .addCats}

      // get nearest category with a non-null schedule
      alloc.nearestType = this._getScheduleTypeName (cat.parent, period.cur);
      alloc .nearestCatWithType = cat .parent;
      if (alloc .nearestType == 'none') {
        alloc .nearestType        = upAmount .nearestType;
        alloc .nearestCatWithType = upAmount .nearestCatWithType;
      }
     return alloc;

    } else
      return {prev: 0, cur: 0, nearestType: 'none', addCats: []}
  }

  /**
   * getAmountUpDown
   */
  _getAmountUpDown (cat, period, skip) {

    // get amounts for category and its descendants
    var amount = this._getAmountDown (cat, period, skip);

    // incorporate amount from ancestor or use ancestor if this is budgetLess and skip
    var amountUp = this._getAmountUp (cat, period, skip);
    if (amount .isBudgetless && skip && amountUp .nearestCatWithType)
      return this._getAmountUpDown (amountUp .nearestCatWithType, period, skip);
    for (let per of ['prev', 'cur'])
      amount [amount .type] .actual [per] += amountUp [per];

    // compute month/year ratio if dealing none into both year and month
    if (amount .none && amount .month && amount .year) {
      var monthsInPeriod = Types .date._difMonths (period .cur .end, period .prev .start)
      var noneActual     = amount .none  .actual .prev + amount .none  .actual .cur;
      var yearBudget     = amount .year  .budget .prev * monthsInPeriod / 12;
      var yearActual     = amount .year  .actual .prev + amount .year  .actual .cur;
      var monthBudget    = amount .month .budget .prev + amount .month .budget .cur;
      var monthActual    = amount .month .actual .prev + amount .month .actual .cur;
      var totalBudget    = yearBudget + monthBudget;
      var yearAvail      = Math .max (0, yearBudget  - yearActual);
      var monthAvail     = Math .max (0, monthBudget - monthActual);
      var totalAvail     = yearAvail + monthAvail;
      var noneAvail      = Math .min (noneActual, totalAvail);
      var yearAvailP     = totalAvail?  yearAvail  / totalAvail: 0;
      var yearOverP      = totalBudget? yearBudget / totalBudget: 0;
      var percentYear    = (yearAvailP * noneAvail + yearOverP * (noneActual - noneAvail)) / noneActual;
    }

    // deal all none actuals into year or month
    for (let per of ['prev', 'cur'])
      if (amount .none && amount .none .actual [per] != 0) {
        if ((amount .month && amount .month .budget [per] != 0) || (amount .year && amount .year .budget .prev != 0)) {
          if (! amount .month || amount .month .budget [per] == 0)
            amount .year .actual [per] += amount .none .actual [per];
          else if (! amount .year || amount .year .budget [per] == 0)
            amount .month .actual [per] += amount .none .actual [per];
          else {
            amount .year  .actual [per] += Math .round (amount .none .actual [per] * percentYear);
            amount .month .actual [per] += Math .round (amount .none .actual [per] * (1 - percentYear));
          }
        } else if (amountUp .nearestType != 'none') {
          if (! amount [amountUp .nearestType])
            amount [amountUp .nearestType] = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}}
          amount [amountUp .nearestType] .actual [per] += amount .none .actual [per];
        } else {
          if (! amount .month)
            amount .month = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}};
          amount .month .actual [per] += amount .none .actual [per];
        }
        amount .none  .actual [per]  = 0;
      }

    // deal year over into month available if possible
    if (amount .year && amount .month) {
      let yearAvailable = amount .year .budget .prev;
      for (const per of ['prev', 'cur']) {
        yearAvailable -= amount .year .actual [per];
        if (yearAvailable < 0) {
          const monthAvailable = Math .max (0, amount .month .budget [per] - amount .month .actual [per]);
          if (monthAvailable > 0) {
            const deal = Math .min (-yearAvailable, monthAvailable);
            amount .year .actual [per] -= deal;
            amount .month .actual [per] += deal;
          }
        }
      }
    }

    return {amount: amount, addCats: amountUp .addCats};
  }

  /**
   * getAmount
   *    skip = [[cat_id, date, amount]]
   *      if skip is non-null
   *        - amount is removed from actuals for specified cat and date
   *        - parent amounts distribute to other children first
   *        - budgetless categories report schedule of responsible parent
   *      if skip is null
   *        - parent amounts distribute proportionally
   *        - budgetless categories report as budgetless
   */
  getAmount (id, date, skip) {
    var period = {
      prev: {
        start: this._budget .getStartDate(),
        end:   Types .date .monthEnd (Types .date .addMonthStart (date, -1))
      }
    };
    period
      .cur = {
        start: Math .max (period .prev .start, Types .date .monthStart (date)),
        end:   date
      }
    var upDown   = this._getAmountUpDown (this._budget .getCategories() .get (id), period, skip);
    var variance = ['month', 'year'] .reduce ((o,sch) => {
      if (upDown .amount [sch])
        o [sch] = this._calculateVariance (upDown .amount [sch], upDown .amount .isCredit, upDown .amount .isGoal, sch == 'year', upDown .amount .isBudgetless);
      return o;
    }, {})
    variance .available = ['month', 'year'] .reduce ((t,sch) => {
      return t + ((variance [sch] && variance [sch] .amounts .available) || 0);
    }, 0);
    if (! upDown. amount .isBudgetless) {
      if (variance .month)
        variance .month .percentComplete = Types .date ._day (date) /
                                           (Types .date .monthEnd (date) - Types .date .monthStart (date) + 1);
      if (variance .year)
        variance .year .percentComplete = (Types .date .subDays (date, this._budget .getStartDate()) + 1) /
                                          (Types .date .subDays (this._budget .getEndDate(), this._budget .getStartDate()) + 1);
    }
    variance .addCats = upDown .addCats;
    return variance;
  }

  /**
   * Helper for getVarianceList (Below)
   */
  _getVarianceListByPeriod (cats, period, transactionFocused) {
    let vs = []
    for (let cat of (cats && ([] .concat (cats)) || [])) {
      let children = this._getVarianceListByPeriod (cat .children, period, transactionFocused);
      if (transactionFocused || this._budget .getCategories() .getType (cat) != ScheduleType .NONE) {
        let amount   = transactionFocused? this._getAmountDown (cat, period, null, null, true): this._getAmountUpDown (cat, period) .amount;
        let variance = ['prev', 'cur'] .reduce ((o,per) => {
          o [per] = ['month', 'year'] .reduce ((total, sch) => {
            return total + (amount [sch]? amount [sch] .budget [per] - amount [sch] .actual [per]: 0);
          }, 0);
          return o;
        }, {})
        let a = variance .prev + variance .cur;
        if (amount .year && a > 0)
          a = Math .max (0, a - this._budget .getAmount (cat, period .cur .end) .year .allocated);
        if (! transactionFocused) {
          let ch = children .reduce ((t,c) => {
            t .prev   += c .prev;
            t .cur    += c .cur;
            return t;
          }, {amount: 0, prev: 0, cur: 0});
          a -= ch .amount;
          variance .prev -= ch .prev;
          variance .cur  -= ch .cur;
        }
        vs .push ({cat: cat, amount: a, prev: variance .prev, cur: variance .cur});
      }
      vs = vs .concat (children);
    }
    return vs;
  }

  /**
   * Returns a list of variances for all categories in the family headed by ids that have a budget as of specified date range
   */
  getVarianceList (cats, dates, transactionFocused = false) {
     dates .start = dates .start || this._budget .getStartDate();
     dates .end   = dates .end   || this._budget .getEndDate();
     var period = {
      prev: {
        start: dates .start,
        end:   Types .date .monthEnd (Types .date .addMonthStart (dates .end, -1))
      }
    };
    period
      .cur = {
        start: Math .max (dates .start, Types .date .monthStart (dates .end)),
        end:   dates.end
      }
    return this._getVarianceListByPeriod (cats, period, transactionFocused);
  }
}
