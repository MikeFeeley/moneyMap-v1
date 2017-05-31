class SchedulesModel extends Observable {
  constructor (budget) {
    super();
    this._budget   = budget;
    this._catModel = new Model ('categories');
    this._schModel = new Model ('schedules');
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
  *find (catQuery, schQuery) {
    (schQuery = schQuery || {}) .budget = this._budget .getId();
    var cats    = this._catModel .find (catQuery);
    var schs    = this._schModel .find (schQuery);
    cats     = yield* cats;
    schs     = yield* schs;
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

  getCategories() {
    return this._categories;
  }

  /**
   * Move to new position.  
   * Tricky case is moving last schedule from category or adding schedule to an "empty" category;
   * in these cases either add or remove empty schedule.
   */
  *move (mi, pos, source) {
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
      yield* this._schModel .insert (data);
    }
    if (mis .model == this._schModel && siblings .length == 1 && Types .dateMYorYear .isBlank (siblings [0] .start)) {
      var result = yield* this._schModel .remove (this._splitMI (siblings [0] ._id) .id);
      if (result)
        pos .before = undefined;
    }
    var changes  = [];
    var data     = {};
    data .sort   = pos .before
      ? this._categories .get (pos .before) .sort
      : (siblings || []) .reduce ((m,s) => {return Math.max (m, s.sort)}, 0) + 1;
    for (let s of siblings || [])
      if (s.sort >= data .sort)
        changes .push (mis .model .update (this._splitMI (s._id) .id, {sort: s.sort + 1}, source));
    if (pos .inside && (! target [mis .model .parent] || target [mis .model .parent] ._id != pos .inside))
      data [mis .model .parent] = this._categories .get (pos .inside);
    else if (! pos .inside && target [mis .model .parent])
      data [mis .model .parent] = null;
    changes .push (this .update (mi, data, source));
    for (let c of changes)
      yield* c;
  }

  /**
   *
   */
  *update (mi, data, source) {
    let mis = this._splitMI (mi);
    if (data [mis .model .parent])
      data [mis .model .parent] = this._splitMI (data [mis .model .parent] ._id) .id;
    return yield* mis.model.update (mis.id, data, source);
  }

  /**
   *
   */
  *insert (data, pos) {
    var mis = this._splitMI (pos .id);
    if (mis .model == this._schModel)
      data.budget  = this._budget .getId();
    else
      data.budgets = [this._budget .getId()];
    if (pos .inside) {
      data [mis .model .parent] = mis .id;
      var siblings              = this._categories .get (pos .id) [mis .model .children] || [];
      data .sort                = pos .before? 0: siblings .reduce ((m,s) => {return Math.max (m, s .sort)}, 0) + 1;
    } else {
      var ref                   = this._categories .get (pos .id);
      if (ref [mis .model .parent])
        data [mis .model .parent] = this._splitMI (ref [mis .model .parent] ._id) .id;
      var siblings              = this._categories .getSiblings (ref, mis .model .parent, mis .model .children) .concat (ref);
      data .sort                = (ref .sort || 0) + (pos .before? 0: 1);
    }
    var changes = [];
    for (let s of siblings || [])
      if (s.sort >= data .sort)
        changes .push ({id: this._splitMI (s._id) .id, update: {sort: s.sort + 1}})
    yield* mis .model .updateList (changes);
    yield* mis .model .insert (data);
    if (data._id) {
      var ids = [this._joinMI (mis. model, data._id)];
      if (mis .model == this._catModel) {
        data = {budget: this._budget .getId(), category: data._id, sort: 0};
        yield* this._schModel .insert (data);
        if (data._id)
          ids .push (this._joinMI (this._schModel, data._id));
      }
    }
    return ids;
  }

  /**
   *
   */
  *remove (mi) {
    var result = true;
    var mis = this._splitMI (mi);
    Model .newUndoGroup();
    if (mis .model == this._schModel) {
      var sch = this._categories .get (mi);
      if (sch .category && (sch .category .schedule || []) .length == 1 && (sch .category .schedule || []) .includes (sch)) {
        mi  = sch .category._id;
        mis = this._splitMI (mi);
      } else
        var result = yield* mis .model .remove (mis .id);
    }
    if (mis .model == this._catModel) {
      var cat = this._categories .get (mi);
      var bid = this._budget .getId();
      var cl  = [cat] .concat (this._categories .getDescendants (cat));
      var ul  = cl .map (c => {
        return {
          id:     c._id,
          update: {budgets: c .budgets .filter (b => {return b != bid})}
        }
      });
      var sl  = cl. reduce ((l,c) => {
        return l .concat ((c .schedule || []) .map (s => {return this._splitMI (s._id) .id}));
      }, []);
      result = (yield* this._catModel .checkUpdateList (ul));
      if (! result && sch)
        yield* this._schModel .update (this._splitMI (sch._id) .id, {amount: 0, start: 0, end: 0, limit: 0, repeat: 0});
      if (result)
        result = (yield* this._schModel .removeList (sl));
      if (result)
        result = (yield* this._catModel .updateList (ul));
    }
    return result;
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
            let inRange = Types .dateMYorYear .inRange (
              sch .start, sch .end, sch .repeat, sch .limit,
              this._budget .getStartDate(), this._budget .getEndDate(), this._budget .getStartDate(), this._budget .getEndDate()
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
          rs .year .amount      += amt - (((ds .month && ds .month .amount) || 0) + ((ds .otherMonths && ds .otherMonths) || 0));
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
}
