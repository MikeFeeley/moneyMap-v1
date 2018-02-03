class ScheduleEntry extends List {

  constructor (name, accounts, variance, options = {}) {
    let budget = variance .getBudget();
    super (budget .getSchedulesModel(), new ScheduleEntryView (name, options, accounts, variance), options);
    this._budget     = budget;
    this._variance   = variance;
    this._categories = this._model .getCategories();
    this._accounts   = accounts;
  }

  delete() {
    this._view .delete();
  }

  async _onModelChange (eventType, doc, arg, source) {
    if (this._categories) {
      var calcDepth = cat => {return cat? calcDepth (cat .parent) + 1: 0}
      var parentChange = arg && (typeof arg .parent != 'undefined' || typeof arg .category != 'undefined');
      if (source != this._view && eventType == ModelEvent .UPDATE && parentChange)
        this._moveTuple (doc._id, arg .parent || arg .category);
      if (this._options .depthLimit) {
        if ((eventType == ModelEvent .UPDATE && parentChange) || eventType == ModelEvent .INSERT) {
          var cat   = this._categories .get (doc._id)
          var depth = calcDepth (cat);
          if (eventType == ModelEvent .INSERT && depth > this._options .depthLimit)
            return;
          else if (eventType == ModelEvent .UPDATE) {
            this._removeTuple (cat._id);
            this._addCats     ([cat], depth - 1);
          }
        }
      }
      var skip = eventType == ModelEvent .INSERT && this._options .scheduleOnly &&
        (!doc .category || ! this._options .scheduleOnly .includes (doc .category ._id));
      if (skip)
        return;
      await super._onModelChange (eventType, doc, arg, source);
      var updateTotals = cat => {
        if (cat) {
          var amt  = this._model .getAmount (cat, this._options .startDate, this._options .endDate);
          var sign = this._model .isCredit (cat)? -1: 1;
          this._view .update (cat._id, {
            total:       amt .amount * sign,
            unallocated: this._categories .getType (cat) == ScheduleType .YEAR && amt. year && amt .year .allocated
              ? amt .year .unallocated : 0,
            _computedAmount: amt
          });
          updateTotals (cat .parent);
        }
      };
      updateTotals (this._categories .get (doc .category || doc._id));
      if (doc .parent)
        updateTotals (this._categories .get (doc .parent));
      if (arg && arg._original_parent)
        updateTotals (this._categories .get (arg._original_parent));
      if (arg && (arg .account || arg._original_account || (arg .budgets && doc .account))) {
        let account = this._accounts .getAccount (arg .account || arg._original_account || doc .account);
        if (account .incCategory)
          updateTotals (this._categories .get (account .incCategory));
      }
      if (eventType == ModelEvent .UPDATE && arg .budgets) {
        let bid = this._budget .getId();
        if (! arg .budgets .includes (bid))
          this._removeTuple (doc._id);
        else if (! arg ._original_budgets .includes (bid)) {
          let cat = this._categories .get (doc._id)
          if (! this._options .depthLimit || this._options .depthLimit >= calcDepth (cat))
            this._addTuple (cat);
        }
      }
      if (eventType == ModelEvent .UPDATE && arg .start != null && doc._id && source != this._view)
        this._setVisibility (doc._id, arg);
      if (this._options .setFocus) {
        this._view .selectTupleWithId (doc._id, {field: this._view._getFieldHtml (doc._id, 'name')});
        this._options .setFocus = false;
      }
    }
  }

  _setVisibility (id, update) {
    var sch = this._categories .get (id);
    if (sch && sch .category) {
      var upd = Object .keys (sch) .reduce ((u,s) => {u [s] = sch [s]; return u}, {});
      if (update)
        upd [update .fieldName] = update .value;
      var isStartBlank  = Types .dateMYorYear .isBlank    (upd .start);
      var isStartYear   = Types .dateMYorYear .isYear     (upd .start);
      var isEndInfinity = Types .dateEndMY    .isInfinity (upd .end);
      var isRepeat      = upd .repeat;
      var enabled = {
        limit:  !isStartBlank && !isEndInfinity && isRepeat,
        repeat: !isStartBlank && !isEndInfinity,
        amount: !isStartBlank,
        end:    !isStartBlank && !isStartYear,
        notes:  !isStartBlank
      }
      for (let f in enabled)
        this._view .setFieldEnabled (id, f, enabled [f]);
    }
  }

  async _onViewChange (eventType, arg) {
    if (this._options.noInsertInside && arg && arg .pos && arg .pos .inside)
      arg .pos .inside = undefined;
    switch (eventType) {

      case ListViewEvent .MOVE:
        var target = this._categories .get (arg .id);
        // if limited to single category then move within it only
        if (this._options .categoriesOnlyWithParent)
          arg .pos .inside = target .parent ._id;
        else if (this._options .scheduleOnly)
          arg .pos .inside = target .category ._id;
        // Prevent moving category to schedule or schedule to category
        else if (arg .pos .inType && arg .type != arg .pos .inType) {
          this._view .cancelMove (arg .id);
          return;
        }
        var inside = arg .pos .inside && this._categories .get (arg .pos .inside);
        if (target .category && (!inside || inside .category)) {
          // Prevent nesting schedules
          this._view .cancelMove (arg.id);
          return;
        }
        this._move (arg .id, arg .pos, this._view);
        break;

      case ListViewEvent .UPDATE:
        if (arg .fieldName == 'start')
          if (Types .dateMYorYear .isYear (arg .value)) {
            let mismatch = this._categories .get (arg .id) .category .schedule .find (s => {
              return s._id != arg.id && s.start && ! Types .dateMYorYear .isYear (s.start)
            });
            if (mismatch) {
              this._view .setFieldError (arg.id, arg .fieldName, 'Yearly and monthly budget allocations can not be combined.');
              eventType = ListViewEvent .CANCELLED;
            }
          } else if (! Types .dateMYorYear .isBlank (arg .value)) {
            let mismatch = this._categories .get (arg.id) .category .schedule .find (s => {
              return s._id != arg.id && s.start && Types .dateMYorYear .isYear (s.start)
            });
            let hasChildren = (this._categories .get (arg.id) .category .children || []) .length > 0;
            if (mismatch) {
              this._view .setFieldError (arg.id, arg .fieldName, 'Yearly and monthly budget allocations can not be combined.');
              eventType = ListViewEvent .CANCELLED;
            }
          }
        if (arg .fieldName == 'start' || arg .fieldName == 'end') {
          let cat = this._categories .get (arg .id);
          let st  = this._view .getFieldValue (arg .id, 'start');
          let en  = this._view .getFieldValue (arg .id, 'end');
          if (st === undefined)
            st = cat .start;
          if (en === undefined)
            en = cat .end;
          if (en != '...' && en  && st > en) {
            this._view .setFieldError (arg .id, arg.fieldName, arg .fieldName == 'start'? 'Start is after end': 'End is before Start');
            eventType = ListViewEvent .CANCELLED;
          } else {
            let otherFieldName  = arg .fieldName == 'start'? 'end': 'start';
            let otherFieldValue = this._view .getFieldValue (arg .id, otherFieldName);
            if (this._view .isFieldError (arg .id, otherFieldName) && otherFieldValue !== 'undefined') {
              this .updateField (arg .id, otherFieldName, otherFieldValue);  // XXX Assumes view gets updated; true now, but might change
            }
          }
        }
        if (arg .fieldName == 'name')
          this._view .showTipNameChange (arg .id);
        if (eventType != ListViewEvent .CANCELLED)
          this ._setVisibility (arg.id, arg);
        break;

      case ListViewEvent .INSERT:
        if (arg .lineType == 'scheduleLine' && arg .pos .inside && ! this._options .scheduleOnly) {
          arg .lineType = 'categoryLine';
          arg.pos.id    = this._categories .get (arg.pos.id) .category ._id;
        }
        break;

      case ListViewEvent .REMOVE:
        var target = this._categories .get (arg);
        var prohibited =
          this._options .noRemoveCategoryWithNonBlankSchedule &&
          target .schedule &&
          this._categories .getType (target) != ScheduleType .NONE;
        if (prohibited) {
          this._view .flagTupleError (arg);
          eventType = ListViewEvent .CANCELLED;
        }
        if (this._options .noRemoveLastSchedule && target .category && (target .category .schedule || []) .length == 1) {
          this._onViewChange (ListViewEvent .UPDATE, {id: arg, fieldName: 'start', value: ''});
          eventType = ListViewEvent .CANCELLED;
        }
        if (await this._model .hasTransactions (target)) {
          this._view .flagTupleError  (arg);
          this._view .showTipNoRemove (arg);
          eventType = ListViewEvent .CANCELLED;
        }
        break;

      case ListViewEvent .FIELD_CLICK:
        if (this._options .onFieldClick)
          this._options .onFieldClick (arg .id, arg .name, arg .html .parent() .parent(), {top: 50, left: 50});
        break;
    }
    super._onViewChange  (eventType, arg);
  }

  async _insert (lineType, pos) {
    if (lineType == 'scheduleLine')
      pos .inside = false;
    var insert = (await this._model .insert ({}, pos)) [0];
    this._view .selectTupleWithId (insert._id, {first: true});
  }

  async _remove (id) {
    if (! (await this._model .remove (id)))
      this._view .flagTupleError (id);
  }

  async _move (id, pos, source) {
    await this._model .move (id, pos, source);
  }

  addHtml (toHtml) {
    this._view .addHtml (toHtml);
    if (this._options .categoriesOnlyWithParent)
      for (let p of this._options .categoriesOnlyWithParent)
        for (let c of this._categories .get (p) .children || [])
          this._addTuple (c);
    else if (this._options .scheduleOnly) {
      for (let c of this._options .scheduleOnly) {
        for (let s of this._categories .get (c) .schedule || [])
          this._addTuple (s);
      }
    } else
      this._addCats (this._categories .getRoots());
  }

  _addCats (cats, depth = 0) {
    if (!this._options .depthLimit || depth < this._options .depthLimit)
      for (let cat of cats || []) {
        this ._addTuple (cat);
        for (let sch of cat.schedule || [])
          this ._addTuple (sch);
        if (cat.children && cat.children.length)
          this._addCats (cat.children, depth + 1);
      }
  }

  _addTuple (doc) {
    var type = doc .category? 'scheduleLine': 'categoryLine';
    var data = this._view .getLineData (type, doc);
    var skip =
      (this._options .categoriesOnlyWithParent &&
        (type != 'categoryLine' || ! this._options .categoriesOnlyWithParent .find (id => {return doc .parent && doc .parent ._id == id})));
    skip |= this._options .categoriesOnly && type != 'categoryLine';
    if (! skip) {
      if (type == 'categoryLine') {
        var amt               = this._model .getAmount (doc, this._options .startDate, this._options .endDate);
        var sign              = this._model .isCredit (doc)? -1: 1;
        data .total           = amt .amount;
        data .unallocated     = this._categories .getType (doc) == ScheduleType .YEAR && (amt .year && amt .year .allocated)
          ? amt .year .unallocated: 0;
        data ._computedAmount = amt;
        if (this._model .isCredit (doc)) {
          data .total          = - data .total;
          data .unallocated    = - data .unallocated;
        }
      }
      if (! this._options .selectCategory || this._options .selectCategory (data)) {
        var parent = doc [type == 'categoryLine'? 'parent': 'category'];
        this._view .addTuple (type, data, parent && parent ._id);
        this._setVisibility   (data._id);
      }
    }
  }

  _moveTuple (id, pid) {
    var doc = this._categories .get (id);
    if (doc) {
      var type = doc .category? 'scheduleLine': 'categoryLine';
      this._view .moveTuple (type, id, pid);
    }
  }

  _removeTuple (id) {
    super ._removeTuple (id);
    var cat = this._categories .get (id);
    if (cat)
      this._view .removeTupleIds (this._categories .getDescendants (cat) .map (d => {return d._id}));
  }
}
