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
  }

  delete() {
    this._catModel .delete();
    this._schModel .delete();
    if (this._accModel)
      this._accModel .delete();
  }

  _onCatModelChange (eventType, doc, arg, source) {
    this._onModelChange (eventType, doc, arg, this._catModel, source);
  }

  _onSchModelChange (eventType, doc, arg, source) {
    this._onModelChange (eventType, doc, arg, this._schModel, source);
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
      for (let cat of cats) {
        cat._id    = this._joinMI (this._catModel, cat._id);
        cat.parent = this._joinMI (this._catModel, cat.parent);
      }
      for (let sch of schs) {
        sch._id      = this._joinMI (this._schModel, sch._id);
        sch.category = this._joinMI (this._catModel, sch.category);
      }
      this._categories = new Schedules (cats, schs, this._budget);
      return this._categories;
    }
  }

  getCategories() {
    return this._categories;
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
    if (mis .model == this._schModel && siblings .length == 1 && Types .dateMYorYear .isBlank (siblings [0] .start)) {
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

  /**
   *
   */
  async insert (data, pos) {
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
        cat = await this._catModel .insert (data);
        if (! cat) return;
      } else {
        data .budgets = cat .budgets .includes (bid)? cat .budgets: cat .budgets .concat (bid);
        promises .push (this._catModel .update (cat._id, {
          parent:  data .parent,
          sort:    data .sort,
          budgets: data .budgets
         }));
      }
      insertedIds .push (cat._id);
      if (sortUpdate .length)
        promises .push (this._catModel .updateList (sortUpdate));
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
      let sch = await this._schModel .insert (data);
      if (sch)
        insertedIds .push (this._joinMI (this._schModel, sch._id));
      if (sortUpdate .length)
        promises .push (this._schModel .updateList (sortUpdate));
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
        mi  = sch .category._id;
        mis = this._splitMI (mi);
      } else
        result = await mis .model .remove (mis .id);
    }
    if (mis .model == this._catModel) {
      let cat = this._categories .get (mi);
      let bid = this._budget .getId();
      let cl  = [cat] .concat (this._categories .getDescendants (cat));
      let ul  = cl .map (c => {
        return {
          id:     c._id,
          update: {budgets: c .budgets .filter (b => {return b != bid})}
        }
      });
      let sl = cl .reduce ((l,c) => {
        return l .concat ((c .schedule || []) .map (s => {return this._splitMI (s._id) .id}));
      }, []);
      let accModel = this._actModel .getAccountsModel();
      let accounts = accModel .getAccounts();
      let al = cl
        .map (c => {
          if (c .account) {
            let account = accounts .find (a => {return a._id == c .account});
            if (account) {
              for (let field of ['category', 'disCategory'])
                if (account [field] == c._id)
                  return {id: account._id, update: {[field]: null}}
            }
          }
        })
        .filter (u => {return u});
      let accUpd = al .length == 0 || accModel .getModel() .updateList (al);
      let schUpd = sl .length == 0 || this._schModel .removeList (sl);
      let catUpd = ul .length == 0 || this._catModel .updateList (ul);
      result = (await sl) && (await cl);
    }
    return result;
  }

  async hasTransactions (cat) {
    let query = {
      category: {$in: [cat] .concat (this._categories .getDescendants (cat)) .map (c => {return c._id})},
      date:     {$gte: this._budget .getStartDate(), $lte: this._budget .getEndDate()}
    }
    return this._actModel .hasTransactions (query);
  }

  isCredit (cat) {
    return cat .parent? this .isCredit (cat .parent): cat .credit;
  }

  isGoal (cat) {
    return cat .parent? this .isGoal (cat .parent): cat .goal;
  }

  _getAmount (cat, start, end, includeDescendants) {
    var isCredit = this .isCredit (cat);
    var ga = (cats, start, end, getOtherMonths) => {
      var rs = {amount: 0};
      for (let cat of cats || []) {
        var am = 0;
        var om = 0;
        var sp = [];
        var yr = false;
        for (let sch of cat .schedule || []) {
          yr |= Types .dateMYorYear .isYear (sch .start);
          let inRange = Types .dateMYorYear .inRange (
            sch .start, sch .end, sch .repeat, sch .limit,
            start, end, this._budget .getStartDate(), this._budget .getEndDate()
          );
          if (inRange)
            am += (isCredit? -1: 1) * inRange * (sch .amount || 0);
          else if (getOtherMonths) {
            let fyStart = Types .dateFY .getFYStart (start, this._budget .getStartDate(), this._budget .getEndDate());
            let fyEnd   = Types .dateFY .getFYEnd   (start, this._budget .getStartDate(), this._budget .getEndDate());
            let inRange = Types .dateMYorYear .inRange (
              sch .start, sch .end, sch .repeat, sch .limit,
              fyStart, fyEnd,
              this._budget .getStartDate(), this._budget .getEndDate()
            );
            if (inRange)
              om += (isCredit? -1: 1) * inRange * (sch .amount || 0);
          }
        }
        var ds = includeDescendants? ga (cat .children, start, end, yr || getOtherMonths): {amount: 0};
        if (yr) {
          var amt                = Math [isCredit? 'min': 'max'] (am, ds .amount);
          rs .amount            += amt;
          rs .year               = (rs .year || {amount: 0, allocated: 0, unallocated: 0});
          rs .year .amount      += Math [isCredit? 'min': 'max'] (am, ds .amount + ((ds .otherMonths && ds .otherMonths) || 0))
                                   - (((ds .month && ds .month .amount) || 0) + ((ds .otherMonths && ds .otherMonths) || 0));
          rs .year .allocated   += ds .amount + (ds .otherMonths || 0);
          rs .year .unallocated += am - (ds .amount + (ds .otherMonths || 0));
          if (ds .month) {
            rs .month = rs .month || {};
            for (let p in ds .month || {})
              rs .month [p] = (rs .month [p] || 0) + ds .month [p];
          }
        } else {
          rs .amount            += am + ds .amount;
          rs .month              = (rs .month || {amount: 0});
          rs .month .amount     += am + ((ds .month && ds .month .amount) || 0);
          rs .otherMonths        = (rs .otherMonths || 0) + (ds .otherMonths || 0);
          if (ds .year) {
            rs .year = rs .year || {};
            for (let p in ds .year)
              rs .year [p] = (rs .year [p] || 0) + ds .year [p];
          }
        }
        if (om)
          rs .otherMonths = (rs .otherMonths || 0) + om;
      }
      return rs;
    }
    return ga ([cat], start, end);
  }

  /**
   * Get budget amount directly allocated to this individual category (non-recursively)
   */
  getIndividualAmount (cat, start = this._budget .getStartDate(), end = this._budget .getEndDate()) {
    return this._getAmount (cat, start, end, false);
  }

  /**
   * Get budget amount for category in period (recursively)
   */
  getAmount (cat, start = this._budget .getStartDate(), end = this._budget .getEndDate()) {
    return this._getAmount (cat, start, end, true);
  }
}

var ScheduleType = {
  NONE:  0,
  MONTH: 1,
  YEAR:  2,
  NOT_NONE: [1,2]
}

class Schedules extends Categories {
  constructor (cats, schs, budget) {
    super (cats, budget);
    for (let s of schs) {
      if (this._index .get (s .category)) {
        this._index .set (s._id, s);
        this._addParentLink (s, 'category', 'schedule');
      }
    }
  }

  getType (cat) {
    for (let s of cat .schedule || []) {
      if (Types .date .isYear (s .start))
        return ScheduleType .YEAR;
      else if (Types .date .isMonth (s .start))
        return ScheduleType .MONTH;
    }
    return ScheduleType .NONE;
  }

  hasType (cat, type) {
    let typeMatch = catType => {return Array .isArray (type)? type .includes (catType): catType == type}
    if (cat == null)
      return false
    else if (typeMatch (this .getType (cat)))
      return true;
    else
      return ((cat .children || []) .concat (cat .zombies || [])) .find (c => {
        return this .hasType (c, type);
      }) != null
  }
}
