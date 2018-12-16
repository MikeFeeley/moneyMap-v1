/**
 * Schedules Model
 *    budget      id of budget associated with this schedule
 *    category    id of category
 *    start       starting date or blank if empty schedule
 *    end         ending date, blank for one-time, or '...' for no end
 *    amount      dollar amount
 *    repeat      true/false indicates whether schedule repeats annually (N/A if end is '...')
 *    repeatEnd   repeats iff repeat && !repeatEnd || start <= end_date_of_fiscal_year(repeatEnd)
 *    notes       descriptive notes
 *    sort        automatically maintained sort order
 */

class SchedulesModel extends Observable {
  constructor (budget, actModel) {
    super();
    this._budget   = budget;
    this._catModel = new Model ('categories');
    this._schModel = new Model ('schedules');
    this._actModel = actModel;
    this._catModel .addObserver (this, this._onCatModelChange);
    this._schModel .addObserver (this, this._onSchModelChange);
    this._catModel .parent   = 'parent';
    this._catModel .children = 'children';
    this._schModel .parent   = 'category';
    this._schModel .children = 'schedule';
    this._accModel = this._actModel .getAccountsModel();
    this._accObserver = this._accModel .addObserver (this, this._onAccModelChange);
  }

  delete() {
    this._catModel .delete();
    this._schModel .delete();
    this._accModel .deleteObserver (this._accObserver);
  }

  _onCatModelChange (eventType, doc, arg, source) {
    this._onModelChange (eventType, doc, arg, this._catModel, source);
  }

  _onSchModelChange (eventType, doc, arg, source) {
    this._onModelChange (eventType, doc, arg, this._schModel, source);
  }

  _onAccModelChange (eventType, arg) {
    if (eventType == AccountsModelEvent .CATEGORY_CHANGE)
      this._notifyObservers (ModelEvent .UPDATE, {_id: arg .id}, {});
  }

  _onModelChange (eventType, doc, arg, model, source) {
    if (this._categories) {
      for (let col of [doc, arg])
        for (let f in col)
          if (['_id', '_original_' + model .parent, model .parent] .includes (f))
            col [f] = this._joinMI (f == '_id'? model: this._catModel, col [f]);
      this._categories._onModelChange (eventType, doc, arg, model .parent, model .children, source);
    }
    this._notifyObservers (eventType, doc, arg, source);
  }

  _splitMI (mi) {
    return {
      model: mi[0] == 's'? this._schModel: this._catModel,
      id:    mi[0] == 's'? mi .slice (1): mi
    }
  }

  _joinMI (model, id) {
    return id? (model==this._catModel? '': 's') .concat (id): id;
  }

  /**
   * Called by Presenter
   */
  async find (catQuery, schQuery) {
    if (this._budget) {
      (schQuery = schQuery || {}) .budget = this._budget .getId();
      var cats  = this._catModel .find (catQuery);
      var schs  = this._schModel .find (schQuery);
      cats      = await cats;
      schs      = await schs;

      // ROBUSTNESS: Check that budget roots really exist
      cats .push (... await this._budget .checkRoots (this._catModel));

      for (let cat of cats) {
        cat._id    = this._joinMI (this._catModel, cat._id);
        cat.parent = this._joinMI (this._catModel, cat.parent);
      }
      for (let sch of schs) {
        sch._id      = this._joinMI (this._schModel, sch._id);
        sch.category = this._joinMI (this._catModel, sch.category);
      }
      this._categories = new Schedules (cats, schs, this);
      return this._categories;
    }
  }

  getCategories() {
    return this._categories;
  }

  getActuals() {
    return this._actModel;
  }

  /**
   * Move to new position.  
   * Tricky case is moving last schedule from category or adding schedule to an "empty" category;
   * in these cases either add or remove empty schedule.
   */
  async move (mi, pos, source) {
    var mis      = this._splitMI (mi);
    var target   = this._categories .get (mi);
    if (pos .inside)
      var siblings = this._categories .get (pos .inside) [mis .model .children];
    else
      var siblings = this._categories .getRoots();
    var result   = true;
    if (mis .model == this._schModel && target .category .schedule .length == 1 && target .category ._id != pos .inside) {
      var data = {
        budget:   this._budget .getId(),
        category: this._splitMI (target .category ._id) .id
      }
      await this._schModel .insert (data);
    }
    if (mis .model == this._schModel && siblings .length == 1 && Types .dateMYorYear .isBlank (siblings [0] .start) && target .category ._id != pos .inside) {
      var result = await this._schModel .remove (this._splitMI (siblings [0] ._id) .id);
      if (result)
        pos .before = undefined;
    }
    var changes  = [];
    var data     = {};
    data .sort   = pos .before
      ? this._categories .get (pos .before) .sort
      : (siblings || []) .reduce ((m,s) => {return Math.max (m, s.sort)}, 0) + 1;
    let sortUpdateList = (siblings || [])
      .filter (s => {return s .sort >= data .sort})
      .map    (s => {return {id: this._splitMI (s._id) .id, update: {sort: s.sort + 1}}});
    if (sortUpdateList .length)
      await mis .model .updateList (sortUpdateList, source);
     if (pos .inside && (! target [mis .model .parent] || target [mis .model .parent] ._id != pos .inside))
      data [mis .model .parent] = this._categories .get (pos .inside);
    else if (! pos .inside && target [mis .model .parent])
      data [mis .model .parent] = null;
    changes .push (this .update (mi, data, source));
    for (let c of changes)
      await c;
  }

  /**
   *
   */
  async update (mi, data, source) {
    let mis = this._splitMI (mi);
    if (data [mis .model .parent])
      data [mis .model .parent] = this._splitMI (data [mis .model .parent] ._id) .id;
    return await mis.model.update (mis.id, data, source);
  }

  async updateCategorySort (cat, sort) {
    await this._catModel .update (cat._id, {sort: sort});
    let ul = (cat .parent .children || [])
      .filter (c => {return c .sort >= sort})
      .map    (c => {return {id: c._id, update: {sort: c .sort + 1}}})
    if (ul .length)
      await this._catModel .updateList (ul);
  }

  /**
   * Right now this is only needed when reactivating a zombie category
   */
  async ensureCategoryHasSchedule (cat) {
    if (! cat .schedule)
      await this._schModel .insert ({category: cat._id, budget: this._budget .getId()});
  }

  /**
   *
   */
  async insert (data, pos, source) {
    let updateSort = (ref, siblings) => {
      let sort = pos .inside
        ? (pos .before?         0: siblings .reduce ((m, e) => {return Math .max (m, e .sort || 0)}, 0) + 1)
        : (pos .before? ref .sort: (ref .sort || 0) + 1);
      let sortUpdate = siblings
        .filter (e => {return e .sort >= sort})
        .map    (e => {return {id: this._splitMI (e._id) .id, update: {sort: (e .sort || 0) + 1}}});
      return [sort, sortUpdate];
    }
    let mis = this._splitMI (pos .id);
    let bid = this._budget .getId();
    let promises = [], insertedIds = [];
    if (mis .model == this._catModel) {
      let ref      = this._categories .get (pos .id);
      let parent   = pos .inside? ref: ref .parent
      data .parent = parent._id;
      let siblings = parent .children || [];
      let cat      = data .name && (parent .zombies || []) .find (z => {return z .name == data .name});
      let sortUpdate;
      [data .sort, sortUpdate] = updateSort (ref, siblings);
      if (! cat) {
        data .budgets = [bid];
        cat = await this._catModel.insert (data);
        if (! cat) return;
      } else {
        data .budgets = cat .budgets .includes (bid)? cat .budgets: cat .budgets .concat (bid);
        promises .push (this._catModel .update (cat._id, {
          parent:  data .parent,
          sort:    data .sort,
          budgets: data .budgets
        }, source));
      }
      insertedIds .push (cat._id);
      if (sortUpdate .length)
        promises.push (this._catModel.updateList (sortUpdate, source));
      pos  = {inside: true, id: cat._id};
      data = {}
    }
    if (pos .id) {
      let ref        = this._categories .get (pos .id);
      let cat        = pos .inside? ref: ref .category;
      let siblings   = cat .schedule || [];
      let sortUpdate;
      [data .sort, sortUpdate] = updateSort (ref, siblings);
      data .budget   = bid;
      data .category = cat._id;
      let sch = await this._schModel.insert (data);
      if (sch)
        insertedIds .push (this._joinMI (this._schModel, sch._id));
      if (sortUpdate .length)
        promises.push (this._schModel.updateList (sortUpdate, source));
    }
    await Promise .all (promises);
    return insertedIds;
  }

  /**
   *
   */
  async remove (mi) {
    let result = true;
    let mis = this._splitMI (mi);
    Model .newUndoGroup();
    if (mis .model == this._schModel) {
      let sch = this._categories .get (mi);
      if (sch .category && (sch .category .schedule || []) .length == 1 && (sch .category .schedule || []) .includes (sch)) {
        if (this .hasTransactions (sch .category)) {
          await mis .model .update (mis .id, {start: ''});
        } else {
          mi  = sch .category._id;
          mis = this._splitMI (mi);
        }
      } else
        result = await mis .model .remove (mis .id);
    }
    if (mis .model == this._catModel) {
      let cat = this._categories .get (mi);
      let bid = this._budget .getId();
      let cl  = [cat] .concat (this._categories .getDescendants (cat));

      // remove budget from cat and see if cat can be removed
      let ul = [], rl = [];
      for (let cat of cl) {
        let budgets = cat .budgets .filter (budget => {return budget != bid});
        let remove;
        if (budgets .length == 0) {
          await this._actModel .findHistory();
          remove = ! this._actModel .hasTransactions ([cat] .concat (this._categories .getDescendants (cat, true)));
        }
        if (remove)
          rl .push (cat._id)
        else if (budgets .length < cat .budgets .length)
          ul .push ({id: cat._id, update: {budgets: budgets}});
      }

      let sl = cl .reduce ((l,c) => {
        return l .concat ((c .schedule || []) .map (s => {return this._splitMI (s._id) .id}));
      }, []);
      let accounts = this._accModel .getAccounts();
      const al = cl
        .map (c => {
          if (c .account && c .budgets .filter (budget => budget != bid) .length == 0) {
            let account = accounts .find (a => {return a._id == c .account});
            if (account) {
              for (let field of ['category', 'disCategory', 'intCategory', 'incCategory', 'traCategory'])
                if (account [field] == c._id)
                  return {id: account._id, update: {[field]: null}}
            }
          }
        })
        .filter (u => {return u});
      let accUpd = al .length == 0 || this._accModel .getModel() .updateList (al);
      let schUpd = sl .length == 0 || this._schModel .removeList (sl);
      let catUpd = ul .length == 0 || this._catModel .updateList (ul);
      let catRem = rl .length == 0 || this._catModel .removeList (rl);
      result = (await accUpd) && (await schUpd) && (await catUpd) && (await catRem);
    }
    return result;
  }

  /**
   * return true iff cat or any of its descendants have a transaction in current budget year
   */
  hasTransactions (cat, start = this._budget .getStartDate(), end = this._budget .getEndDate()) {
    let cats = [cat] .concat (this._categories .getDescendants (cat));
    return this._actModel .hasTransactions (cats, start, end);
  }

  isCredit (cat) {
    return cat .parent? this .isCredit (cat .parent): cat .credit;
  }

  isGoal (cat) {
    return cat .parent? this .isGoal (cat .parent): cat .goal;
  }

  _getAmount (cats, start, end, includeDescendants, skipAccountCalculation, getOtherMonths, noRecursiveAccount) {
    const amount = {amount: 0, month: {amount: 0}, year: {amount: 0, allocated: 0, unallocated: 0}, otherMonths: 0};
    const getBalances = [];

    for (const cat of cats || []) {
      const isCredit = this .isCredit (cat);

      // get cat amount
      let catAmount = {amount: 0, month: {amount: 0}, year: {amount: 0, allocated: 0, unallocated: 0}, otherMonths: 0};
      let hasYear;
      for (const sch of cat .schedule || []) {
        const isYear = Types .dateMYorYear .isYear (sch .start);
        hasYear |= isYear;
        const inRange = Types .dateMYorYear .inRange (
          sch .start, sch .end, sch .repeat, sch .repeatEnd,
          start, end, this._budget .getStartDate(), this._budget .getEndDate()
        );
        if (inRange) {
          const schAmount = (isCredit? -1: 1) * inRange * (sch .amount || 0);
          catAmount .amount += schAmount;
          catAmount [isYear? 'year': 'month'] .amount += schAmount;
        }
        else if (getOtherMonths) {
          const fyStart = Types .dateFY .getFYStart (start, this._budget .getStartDate(), this._budget .getEndDate());
          const fyEnd   = Types .dateFY .getFYEnd   (start, this._budget .getStartDate(), this._budget .getEndDate());
          const inFyRange = Types .dateMYorYear .inRange (
            sch .start, sch .end, sch .repeat, sch .repeatEnd,
            fyStart, fyEnd,
            this._budget .getStartDate(), this._budget .getEndDate()
          );
          if (inFyRange)
            catAmount .otherMonths += (isCredit? -1: 1) * inFyRange * (sch .amount || 0);
        }
      }

      // get descendant amount
      let desAmount = includeDescendants
        ? this._getAmount (cat .children, start, end, includeDescendants, skipAccountCalculation, hasYear || getOtherMonths, true)
        : {amount: 0, month: {amount: 0}, year: {amount: 0, allocated: 0, unallocated: 0}, otherMonths: 0};

      // combine cat and descendant amounts
      if (hasYear) {
        const op = catAmount .amount < 0? 'min': 'max';
        catAmount .year .allocated   = desAmount .amount + desAmount .otherMonths;
        catAmount .year .unallocated = catAmount .year .amount - (desAmount .amount + desAmount .otherMonths);
        catAmount .amount            = Math [op] (catAmount .year .amount, desAmount .amount) + catAmount .month .amount;
        catAmount .year .amount      = Math [op] (catAmount .year .amount, desAmount .amount + desAmount .otherMonths) - (desAmount .month .amount + desAmount .otherMonths);
      } else {
        catAmount .year .allocated   = desAmount .year .allocated;
        catAmount .year .unallocated = desAmount .year .unallocated;
        catAmount .amount           += desAmount .amount;
        catAmount .year .amount      = desAmount .year .amount;
      }
      catAmount .month .amount += desAmount .month .amount;
      catAmount .otherMonths += desAmount .otherMonths;
      if (catAmount .grossAmount || desAmount .grossAmount)
        catAmount .grossAmount = (catAmount .grossAmount || 0) + (desAmount .grossAmount || 0);
      if (desAmount .getBalance)
        getBalances .push (desAmount .getBalance);

      // if account category, get account to adjust amount
      if (! skipAccountCalculation) {
        const getAccount = cat => cat && (cat .account || (! noRecursiveAccount && getAccount (cat .parent)));
        const accountId  = getAccount (cat);
        if (accountId) {
          let account = this._actModel .getAccountsModel() .getAccount (accountId);
          if (account) {
            const schAmount = catAmount .amount;
            catAmount .amount = account .getAmount (cat, start, end, schAmount);
            if (catAmount .year .amount != 0 && catAmount .month .amount == 0)
              catAmount .year .amount = catAmount .amount;
            else if (catAmount .year .amount == 0)
              catAmount .month .amount = catAmount .amount;
            else {
              const percentMonth = 1.0 * catAmount .month .amount / (catAmount .month .amount + catAmount .year .amount);
              catAmount .month .amount = Math .round (percentMonth * catAmount .amount);
              catAmount .year  .amount = Math .round ((1 - percentMonth) * catAmount .amount);
            }
            if (catAmount .otherMonths)
              catAmount .otherMonths = account .getAmount (cat, start, Types .dateFY .getFYEnd (start, this._budget .getStartDate(), this._budget .getEndDate()))
            catAmount .grossAmount = account .getGrossAmount (start, end, catAmount .amount, schAmount);
            getBalances .push (() => account .getBalance (start, end) .amount);
          }
        }
      }

      // add to running total for all cats
      amount .amount              += catAmount .amount;
      amount .month .amount       += catAmount .month .amount;
      amount .year .amount        += catAmount .year .amount;
      amount .otherMonths         += catAmount .otherMonths;
      amount .year .allocated     += catAmount .year .allocated;
      amount .year .unallocated   += catAmount .year .unallocated;
      if (catAmount .grossAmount)
        amount .grossAmount = (amount .grossAmount || 0) + catAmount .grossAmount;
    }
    amount .getBalance = () => getBalances .reduce ((t,e) => t + e(), 0);
    return amount;
  }

  /**
   * Get budget amount directly allocated to this individual category (non-recursively)
   */
  getIndividualAmount (cat, start = this._budget .getStartDate(), end = this._budget .getEndDate()) {
    return this._getAmount ([cat], start, end, false);
  }

  /**
   * Get budget amount for category in period (recursively)
   */
  getAmount (cat, start = this._budget .getStartDate(), end = this._budget .getEndDate(), skipAccountCalculation) {
    return this._getAmount ([cat], start, end, true, skipAccountCalculation);
  }
}

var ScheduleType = {
  NONE:  0,
  MONTH: 1,
  YEAR:  2,
  NOT_NONE: [1,2]
}

class Schedules extends Categories {
  constructor (cats, schs, model) {
    super (cats, model._budget);
    this._model = model;
    for (let s of schs) {
      if (this._index .get (s .category)) {
        this._index .set (s._id, s);
        this._addParentLink (s, 'category', 'schedule');
      }
    }
  }

  /**
   * Return category's type based on its schedule (ignoring descendants)
   *     noIndrectSchedule if true then does not include information that comes from account connected to category
   *     date              a date in fiscal year for which to examine schedules (default is current fiscal)
   *     reportBoth        if true returns an array that lists BOTH MONTH and YEAR for categories that have both
   *                       if false and category has BOTH, returns YEAR
   */
  getType (cat, noIndirectSchedule, date, reportBoth) {
    let hasMonth = false;
    let hasYear  = false;
    if (cat) {
      if (! noIndirectSchedule) {
        const getAccount = cat => cat && (cat .account || getAccount (cat .parent));
        const accountId = getAccount (cat);
        if (accountId) {
          let account = this._model._actModel .getAccountsModel() .getAccount (accountId);
          if (cat._id == account .category && account .intCategory)
            cat = this .get (account .intCategory);
          else if (cat._id == account .intCategory && account .incCategory)
            cat = this .get (account .incCategory);
        }
      }
      const bs = this._budget.getStartDate ();
      const be = this._budget.getEndDate ();
      const start = date ? Types.dateFY.getFYStart (date, bs, be) : bs;
      const end = date ? Types.dateFY.getFYEnd (date, bs, be) : be;
      for (let s of cat .schedule || [])
        if (Types.dateMYorYear .inRange (s.start, s.end, s.repeat, s.repeatEnd, start, end, start, end)) {
          if (Types.date.isYear (s.start, start, end))
            hasYear = true;
          else if (Types .date .isMonth (s .start))
            hasMonth = true;
        }
        if (! reportBoth && hasYear)
          return ScheduleType .YEAR;
    }
    const result = reportBoth && hasMonth && hasYear? [ScheduleType .MONTH, ScheduleType .YEAR]: hasMonth? ScheduleType .MONTH: ScheduleType .NONE;
    return reportBoth && ! Array .isArray (result)? [result]: result;
  }

  /**
   * Return TRUE iff specified category (or an of its descendants) has a schedule whose type is listed in the type parameter
   */
  hasType (cat, type, noIndirectSchedule, date) {
    const typeMatch = catTypes => !! catTypes .find (catType => Array .isArray (type)? type .find (t => catType == t): catType == type);
    if (cat == null)
      return false
    else if (typeMatch (this .getType (cat, noIndirectSchedule, date, true)))
      return true;
    else
      return ((cat .children || []) .concat (cat .zombies || [])) .find (c => {
        return this .hasType (c, type);
      }) != null
  }

  getActuals() {
    return this._model .getActuals();
  }
}
