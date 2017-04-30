class VarianceModel extends Observable {
  constructor (budget, actuals) {
    super();
    this._budget          = budget;
    this._actuals         = actuals;
    this._budgetObserver  = this._budget  .addObserver (this, this._onModelChange);
    this._actualsObserver = this._actuals .addObserver (this, this._onActualsModelChange);
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
    var cat  = this._budget .getCategories() .get (id);
    var data = {date: [], budget: [], actual: []}
    for (let st = this._budget .getStartDate(); st <= date; st = Types .date .addMonthStart (st, 1)) {
      var period = {cur: {start: st, end: Math .min (Types .date .monthEnd (st), date)}};
      var amount = this._getAmountDown (cat, period);
      data .date   .push (period .cur);
      data .budget .push (amount .month? amount .month .budget .cur: 0);
      data .actual .push ((amount .month? amount .month .actual .cur: 0) + (amount .none? amount .none .actual .cur: 0));
    }
    if (includePriorYear) {
      let homonyms = (cat .parent && (cat .parent .children || []) .concat (cat .parent .zombies || []) .filter (c => {return c .name == cat .name})) || [];
      data .priorYear = [];
      for (let st = Types .date .addYear (this._budget .getStartDate(), -1); st < Types .date .addYear (date, -1); st = Types .date .addMonthStart (st, 1)) {
        let actual = homonyms .reduce ((a, cat) => {
          return a + this._actuals .getAmountRecursively (cat, st, Types .date .monthEnd (st)); 
        }, 0)
        data .priorYear .push (actual * (this._budget .isCredit (cat)? -1: 1));
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
      return {
        amounts: {
          preBudgetedActual: isYear? Math .max (0, amount .budget .prev - pAvlForC): Math .min (pOver, amount .budget .cur),
          curBudgetedActual: Math .max (0, Math .min (amount .actual .cur, cAvl)),
          preOverActual:     Math .max (0, pOver - amount .budget .cur),
          curOverActual:     Math .max (0, amount .actual .cur    - cAvl),
          prevAvailable:     pAvl,
          curAvailable:      Math .max (0, avl - pAvl),
          available:         avl
        },
        isCredit: isCredit,
        isGoal:   isGoal,
        isYear:   isYear
      }
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

  _getScheduleTypeName (cat) {
    switch (this._budget .getCategories() .getType (cat)) {
      case ScheduleType .NONE:
        return 'none';
      case ScheduleType .MONTH:
        return 'month';
      case ScheduleType .YEAR:
        return 'year';
    }
  }

  _allocateNoneAmounts (amount) {

  }

  /**
   * Get budget and actuals amounts for category
   */
  _getAmount (cat, period, skip, excludeChild) {
    var isCredit  = this._budget .isCredit    (cat);
    var isGoal    = this._budget .isGoal      (cat);
    var type      = this._getScheduleTypeName (cat);
    var amount    = {};
    amount [type] = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}};
    for (let per in period) {
      amount [type] .actual [per] = this._actuals .getAmount           (cat, period [per] .start, period [per] .end, skip);
      amount [type] .budget [per] = this._budget  .getIndividualAmount (cat, period [per] .start, period [per] .end) .amount;
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
   */
  _getAmountDown (cat, period, skip, excludeChild) {
    var type      = this._getScheduleTypeName (cat);
    var amount    = this._getAmount (cat, period, skip, excludeChild);
    var chiAmount = (cat .children || [])
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
      var t = ['none', 'month', 'year'] .reduce ((t,sch) => {
        return t + ['prev', 'cur'] .reduce ((t,per) => {return t + ((chiAmount [sch] && chiAmount [sch] .budget [per]) || 0)}, 0);
      }, 0);
      amount .year .budget .prev = Math .max (0, amount .year .budget .prev - t);
      amount .year .budget .cur  = 0;
    }

    // If we have a type, then move any "none" actuals to this type
    if (type != 'none') {
      if (! chiAmount [type])
        chiAmount [type] = {actual: {prev: 0, cur: 0}, budget: {prev: 0, cur: 0}};
      chiAmount [type] .actual = ['prev', 'cur'] .reduce ((o,per) => {
        return (o [per] = chiAmount [type] .actual [per] + ((chiAmount .none && chiAmount .none .actual [per]) || 0)) != null && o;
      }, {});
      chiAmount .none = undefined;
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
      var amount   = this._getAmount   (cat .parent, period, skip);
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
      if (unalloc .prev > 0 || unalloc .cur > 0) {

        // get amounts for children
        var children = (cat .parent .children || []) .map (child => {
          return {cat: child, amount: this._getAmountDown (child, period, skip)};
        });
        // compute total current budget, prorating year if not skip (i.e., proportional alloc)
        var monthsInPeriod = Types .date._difMonths (period .cur .end, period .prev .start);
        // compute children's budget, actual and available
        var thisBudget, totalBudget=0, thisActual, totalActual=0, thisAvail, totalAvail=0;
        for (let child of children) {
          var budget = ['month', 'year'] .reduce ((t, sch) => {
            if (child .amount [sch]) {
              var a = child .amount [sch] .budget .prev;
              if (sch == 'month')
                a += child .amount [sch] .budget .cur;
              else if (!skip && sch == 'year')
                a = (a * monthsInPeriod) / 12;
            } else
              var a = 0;
            return t + a;
          }, 0);
          var actual = ['prev', 'cur'] .reduce ((t, per) => {
            return t + ['none', 'month', 'year'] .reduce ((t, sch) => {
              return t + ((child .amount [sch] && child .amount [sch] .actual [per]) || 0);
            }, 0)
          }, 0);
          var avail = Math .max (0, budget - actual);
          if (child .cat == cat) {
            thisBudget = budget;
            thisActual = actual;
            thisAvail  = avail;
          }
          totalBudget += budget;
          totalActual += actual;
          totalAvail  += avail;
        }
        // distributed unallocated amount to children
        var alloc = ['prev', 'cur'] .reduce ((o, per) => {
          var totalAlloc = Math .min (unalloc [per], totalAvail);
          if (skip) {
            //  to other children first
            var otherAvail = totalAvail - thisAvail;
            var otherAlloc = Math .min (unalloc [per], otherAvail);
            var thisAlloc  = Math .min (thisAvail, unalloc [per] - otherAlloc);
          } else {
            //  proportionally
            var thisAlloc = totalAvail != 0? Math .round (totalAlloc * thisAvail / totalAvail): 0;
          }
          var overAlloc = totalBudget != 0?  Math .round ((unalloc [per] - totalAlloc) * thisBudget / totalBudget): 0;
          return (o [per] = thisAlloc + overAlloc) != null && o;
        }, {})
        alloc .addCats = upAmount .addCats .concat (alloc .prev + alloc .cur != 0? [cat .parent ._id]: [])
      } else
        var alloc = {prev: 0, cur: 0, addCats: upAmount .addCats}


      // get nearest category with a non-null schedule
      alloc .nearestType        = this._getScheduleTypeName (cat .parent);
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
   * getAmount
   *    skip = [[cat_id, date, amount]]
   *      if skip is non-null
   *        - amount is removed from actuals for specified cat and date
   *        - parent amounts distriute to  other children first
   *        - budgetless categories report schedule of respoinsible parent
   *      if skip is null
   *        - parent amounts distriute proportionally
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
        end:   Math .max (period .prev .start, Types .date .monthEnd   (date))
      }
    var cat = this._budget .getCategories() .get (id);

    // get amounts for category and its descendants
    var amount = this._getAmountDown (cat, period, skip);

    // incorporate amount from ancestor or use ancesor if this is budgetLess and skip
    var amountUp = this._getAmountUp (cat, period, skip);
    if (amount .isBudgetless && skip && amountUp .nearestCatWithType)
      return this .getAmount (amountUp .nearestCatWithType._id, date, skip);
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
            amount .none  .actual [per]  = 0;
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
      }

    // calculate and return variance
    var variance = ['month', 'year'] .reduce ((o,sch) => {
      if (amount [sch])
        o [sch] = this._calculateVariance (amount [sch], amount .isCredit, amount .isGoal, sch == 'year', amount .isBudgetless);
      return o;
    }, {})
    variance .available = ['month', 'year'] .reduce ((t,sch) => {
      return t + ((variance [sch] && variance [sch] .amounts .available) || 0);
    }, 0);
    if (! amount .isBudgetless) {
      if (variance .month)
        variance .month .percentComplete = Types .date ._day (date) /
                                           (Types .date .monthEnd (date) - Types .date .monthStart (date) + 1);
      if (variance .year)
        variance .year .percentComplete = (Types .date .subDays (date, this._budget .getStartDate()) + 1) /
                                          (Types .date .subDays (this._budget .getEndDate(), this._budget .getStartDate()) + 1);
    }
    variance .addCats = amountUp .addCats;
    return variance;
  }

}
