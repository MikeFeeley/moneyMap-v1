/**
 * ScheduleEntry
 *     options = {
 *         --- presenter ---
 *         categories:                           [cat*],                       // include only cats and their descendants
 *         moveRootIsChild:                      boolean,
 *         depthLimit:                           number,
 *         scheduleOnly:                         [cat*],
 *         startDate:                            date,
 *         endDate:                              date,
 *         showTotal:                            {false, true, 'variance'},
 *         includeZombies:                       boolean,
 *         includeZombieActiveYears:             boolean,
 *         setFocus:                             boolean,
 *         noInsertInside:                       boolean,
 *         categoriesOnlyWithParent:             [cat*],
 *         noRemoveCategoryWithNonBlankSchedule: boolean,
 *         noRemoveLastSchedule:                 boolean,
 *         onFieldClick:                         function (id, name, html, pos),
 *         --- view ---
 *         protectRoot
 *     }
 */

class ScheduleEntry extends List {

  constructor (name, accounts, variance, options = {}) {
    let budget = variance .getBudget();
    if (options .categories && options .categories .length == 1)
      options .moveRootIsChild = true;
    super (budget .getSchedulesModel(), new ScheduleEntryView (name, options, accounts, variance), options);
    this._budget     = budget;
    this._variance   = variance;
    this._categories = this._model .getCategories();
    this._accounts   = accounts;
    this._actuals    = this._variance .getActuals();
    this._actualsObserver = this._actuals .addObserver (this, this._onActualsModelChange);
  }

  delete() {
    this._actuals .deleteObserver (this._actualsObserver);
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
            this._removeTuple   (cat._id);
            await this._addCats ([cat], depth - 1);
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
          const sign = this._model .isCredit (cat)? -1: 1;
          if (this._options .showTotal == 'variance')
            amt .amount = this._variance .getAmount (cat._id, this._options .endDate || this._budget .getEndDate()) .available * sign;
          this._view .update (cat._id, {
            total:       amt .amount * sign,
            unallocated: this._categories .getType (cat) == ScheduleType .YEAR && amt. year && amt .year .allocated
              ? amt .year .unallocated : 0,
            _computedAmount: amt
          });
          updateTotals (cat .parent);
        }
      };
      if (this._options .showTotal) {
        const cat = this._categories .get (doc .category? (doc .category._id || doc .category): doc._id);
        updateTotals (cat);
        if (arg && arg._original_parent)
          updateTotals (this._categories .get (arg._original_parent));
        if (arg && (arg .account || arg._original_account || (arg .budgets && doc .account))) {
          let account = this._accounts .getAccount (arg .account || arg._original_account || doc .account);
          if (account .incCategory)
            updateTotals (this._categories .get (account .incCategory));
        }
      }
      if (eventType == ModelEvent .UPDATE && arg .budgets) {
        let bid = this._budget .getId();
        if (! this._options .includeZombieActiveYears) {
          if (! arg .budgets .includes (bid))
            this._removeTuple (doc._id);
          else if (! arg ._original_budgets .includes (bid)) {
            let cat = this._categories .get (doc._id)
            if (! this._options .depthLimit || this._options .depthLimit >= calcDepth (cat))
              await this._addTuple (cat);
          }
        } else
          await this._updateZombieFields (doc._id);
      }
      if (eventType == ModelEvent .UPDATE && arg .start != null && doc._id && source != this._view)
        this._setVisibility (doc._id, arg);
      if (this._options .setFocus) {
        this._view .selectTupleWithId (doc._id, {field: this._view._getFieldHtml (doc._id, 'name')});
        this._options .setFocus = false;
      }
    }
  }

  async _onActualsModelChange (eventType, doc, arg, source) {
    if (arg)
      for (let cid of [doc .category, arg._original_category] .filter (x => {return x}))
        await this._updateZombieFields (cid);
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
        // if selecting a category subset, then these categories can not move
        if (this._options .categories && this._options .categories .includes (arg .id)) {
          this._view .cancelMove (arg .id);
          return;
          // if limited to single category then move within it only
        } else if (this._options.categoriesOnlyWithParent && target.parent)
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
        if (this._options .includeZombies) {
          if (! arg .pos || ! arg .pos .inside || (this._categories .isZombie (arg .pos .inside) && ! this._categories .isZombie (target._id))) {
            this._view .cancelMove (arg .id);
            return;
          }
        }
        // prevent combining yearly and monthly schedules
        if (arg.type == 'scheduleLine' && arg.pos.inType == 'scheduleLine') {
          const start = this._categories.get (arg.id).start;
          if (! Types.date.isBlank (start)) {
            const type = Types.date.isYear (start) ? ScheduleType.YEAR : ScheduleType.MONTH;
            const toType = this._categories.getType (this._categories.get (arg.pos.inside));
            if (type != toType && toType != ScheduleType.NONE) {
              this._view.cancelMove (arg.id);
              return;
            }
          }
        }
        this._move (arg .id, arg .pos, this._view);
        break;

      case ListViewEvent .UPDATE:
        if (arg.fieldName == 'start') {
          if (Types .dateMYorYear .isYear (arg .value)) {
            let mismatch = this._categories .get (arg .id) .category .schedule .find (s => {
              return s._id != arg.id && s.start && ! Types .dateMYorYear .isYear (s.start)
            });
            if (mismatch) {
              this._view.setFieldError (arg.id, arg.fieldName, 'Yearly and monthly budget allocations can not be combined.');
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
        if (arg .fieldName == 'name') {
          let cat = this._categories .get (arg .id);
          let end = Types .date .monthEnd (Types .date .addMonthStart (this._budget .getStartDate(), -1));
          if (this._categories .getActuals() .hasTransactions (cat, null, end))
            this._view .showTipNameChange (arg .id);
        }
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
        if (this._model .hasTransactions (target)) {
          this._view .flagTupleError  (arg);
          this._view .showTipNoRemove (arg);
          eventType = ListViewEvent .CANCELLED;
        }
        if (this._options .includeZombies && this._categories .isZombie (target._id)) {
          if ((target .budgets && target .budgets .length) || this._model .hasTransactions (target, null, null)) {
            this._view .flagTupleError  (arg);
            this._view .showTipNoRemoveZombie (arg);
            eventType = ListViewEvent .CANCELLED;
          }
        }
        break;

      case ListViewEvent .FIELD_CLICK:
        if (this._options .onFieldClick)
          this._options .onFieldClick (arg .id, arg .name, arg .html .parent() .parent(), {top: 50, left: 50});
        break;

      case ScheduleEntryViewEvent .REACTIVATE_ZOMBIE:
        await this._reactivateZombie (arg .id, arg .after);
        break;

      case ScheduleEntryViewEvent .SHOW_TRANSACTIONS:
        let cat = this._categories .get (arg .id);
        if (cat) {
          let activePeriod = this._actuals .getActivePeriod (cat);
          if (! activePeriod .none)
            TransactionHUD .showCategory (arg .id, activePeriod, this._accounts, this._variance, arg .html, arg .position);
        }
        break;
    }
    super._onViewChange  (eventType, arg);
  }

  async _insert (lineType, pos, source) {
    if (lineType == 'scheduleLine')
      pos .inside = false;
    var insert = (await this._model.insert ({}, pos, source)) [0];
    this._view .selectTupleWithId (insert._id, {first: true});
  }

  async _remove (id) {
    if (! (await this._model .remove (id)))
      this._view .flagTupleError (id);
  }

  async _move (id, pos, source) {
    await this._model .move (id, pos, source);
  }

  async addHtml (toHtml) {
    this._view .addHtml (toHtml);
    if (this._options .categoriesOnlyWithParent)
      for (let p of this._options .categoriesOnlyWithParent)
        for (let c of this._categories .get (p) .children || [])
          await this._addTuple (c);
    else if (this._options .scheduleOnly) {
      for (let c of this._options .scheduleOnly) {
        for (let s of this._categories .get (c) .schedule || [])
          await this._addTuple (s);
      }
    } else if (this._options .categories)
      await this._addCats (this._options .categories .map (cid => this._categories .get (cid)))
    else
      await this._addCats (this._categories .getRoots());
    if (toHtml .hasClass ('_list')) {
      const showHelp = () => this._view .addHelpTable (
        ['A budget plan consists of a hierarchical list of named categories.  ' +
        'You classify transactions by associating them with one of these categories.',
          'You assign a budget amount to a category by giving it (or one of its desendants) a schedule.  ' +
          'Each schedule is a list of budget amounts for a particular year, month, or range of months.  ' +
          'A category can have full-year, or monthly schedules, but not both.  ',
          "A category's budget is the aggregation of its descendants.  " +
          'If a category has a yearly schedule, then its descendants allocate that yearly budget.  ' +
          'If a category has a monthly schedule, then its descendants add to its budget.',
          'Get started ...'
        ],
        [
          ['Add sibling category or schedule',  'CMD + ENTER'],
          ['Add child category',                'CMD + ALT + ENTER'],
          ['Delete',                            'CMD + DELETE'],
          ['Enter schedule',                    'TAB to the Start field'],
          ['Budget for whole year',             'Enter a year number for Start'],
          ['Budget for single month',           'Enter month-year (e.g., Aug-19) and leave End date blank'],
          ['Budget for range of months',        'Enter values in Start and End fields'],
          ['Budget starting at month',          'Enter ... for End field'],
          ['Repeat budget in future years',     'CLICK Repeat and optionally Limit the number of years'],
          ['Reorganize',                        'CLICK and DRAG category or schedule to new location'],
          ['Show or Edit Historic Categories',  $('<scan>', {class: 'lnr-history'})]
        ]);
      Help .add ('Plan', showHelp);
      const conditionallyShowHelp = () => {
        let hasSchedule;
        for (let cat of this._categories .getRoots())
          if (this._categories .hasType (cat, ScheduleType .NOT_NONE)) {
            hasSchedule = true;
            break;
          }
        if (! hasSchedule)
          showHelp();
      }
      if (! this._options .includeZombies)
        conditionallyShowHelp();
      toHtml .closest ('.contents > div > div') .data ('visible', conditionallyShowHelp);
    }
  }

  async _addCats (cats, depth = 0) {
    const bs = this._budget.getStartDate ();
    const be = this._budget.getEndDate ();
    if (!this._options .depthLimit || depth < this._options .depthLimit)

      for (let cat of cats || []) {

        if (this._options.startDate && this._options.startDate > be) {

          const selectCandidates = cat => ({
            cat: cat,
            schedule: (cat.schedule || []).filter (s => Types.dateMYorYear.inRange (s.start, s.end, s.repeat, s.limit, this._options.startDate, Types.date.infinity (), bs, be)),
            children: (cat.children || []).map (c => selectCandidates (c))
          });
          const candidates = selectCandidates (cat);

          const markCandidates = candidate => {
            const chKeep = candidate.children.reduce ((chKeep, child) => markCandidates (child) || chKeep, false);
            candidate.keep = candidate.schedule.length > 0 || chKeep;
            return candidate.keep;
          }
          markCandidates (candidates);

          const addTuples = async candidate => {
            if (candidate.keep) {
              await this._addTuple (candidate.cat);
              for (const schedule of candidate.schedule)
                await this._addTuple (schedule);
              for (const child of candidate.children)
                await addTuples (child);
            }
          }
          await addTuples (candidates);

        } else {

          await this._addTuple (cat);
          for (const sch of cat.schedule || [])
            await this._addTuple (sch);
          if (cat.children && cat.children.length)
            await this._addCats (cat.children, depth + 1);
          if (this._options.includeZombies)
            if (cat.zombies && cat.zombies.length)
              await this._addCats (cat.zombies, depth + 1);
        }

      }
  }

  async _addTuple (cat) {
    var type = cat .category? 'scheduleLine': 'categoryLine';
    var data = this._view .getLineData (type, cat);
    var skip =
      (this._options .categoriesOnlyWithParent &&
        (type != 'categoryLine' || ! this._options .categoriesOnlyWithParent .find (id => {return cat .parent && cat .parent ._id == id})));
    skip |= this._options .categoriesOnly && type != 'categoryLine';
    if (! skip) {
      if (type == 'categoryLine' && this._options .showTotal) {
        var amt = this._model .getAmount (cat, this._options .startDate, this._options .endDate);
        if (this._options .showTotal == 'variance')
          amt .amount = this._variance .getAmount (cat._id, this._options .endDate || this._budget .getEndDate()) .available * (this._model .isCredit (cat)? -1: 1);
        data .total           = amt .amount;
        data .unallocated     = this._categories .getType (cat) == ScheduleType .YEAR && (amt .year && amt .year .allocated)
          ? amt .year .unallocated: 0;
        data ._computedAmount = amt;
        if (this._model .isCredit (cat)) {
          data .total          = - data .total;
          data .unallocated    = - data .unallocated;
        }
        if (this._options .categoriesOnlyWithParent && ! data .total) {
          if ((cat .children && cat .children .length) || this._categories .getType (cat) != ScheduleType .NONE)
            data .total = '...';
        }
      }
      if (this._options.includeZombies)
        data = await this._getZombieData (data, cat);
      let parent = cat [type == 'scheduleLine' ? 'category' : 'parent'];
      this._view.addTuple (type, data, parent && parent._id);
      this._setVisibility (data._id);
    }
  }

  async _getZombieData (data, cat) {
    let isZombie     = this._categories .isZombie (cat._id);
    let zombieActive = '';
    if (isZombie && this._options .includeZombieActiveYears) {
      await this._categories .getActuals() .findHistory();
      let activePeriod = this._categories .getActuals() .getActivePeriod ([cat]. concat (this._categories .getDescendants(cat, true)));
      if (! activePeriod .none) {
        zombieActive = 'Transactions: ' + Types .dateMYear .toString (activePeriod .start);
        if (Types .date._yearMonth (activePeriod .end) != Types .date._yearMonth (activePeriod .start))
          zombieActive += ' - ' + Types .dateMYear .toString (activePeriod .end)
        zombieActive += '';
      }
      if (cat .budgets .length) {
        zombieActive += (zombieActive .length? ' and ': '') + 'Budget' + (cat .budgets .length > 1? 's': '') + ': ' +
          cat .budgets .map (bid => {return this._budget .getName (bid)}) .join (', ')
      }
      if (zombieActive == '')
        zombieActive = 'Unused';
    }
    return {_id: data._id, _sort: data._sort, name: data .name, account: data .account, zombie: isZombie, zombieActive: zombieActive};
  }

  async _updateZombieFields (cid) {
    let cat  = this._categories .get (cid);
    let data = await this._getZombieData ({}, cat);
    this._view .updateField (cat._id, 'zombie', data .zombie);
    this._view .updateField (cat._id, 'zombieActive', data .zombieActive);
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

  async _reactivateZombie (id, after) {
    Model .newUndoGroup();
    let cat = this._categories .get (id);
    let bid = this._budget .getId();
    let budgets = cat .budgets;
    if (! budgets .includes (bid))
      budgets = budgets .concat (bid);
    if ((cat .parent .children || []) .find (c => {return c .sort == cat .sort}))
      await this._model .updateCategorySort (cat, after? this._categories .get (after) .sort + 1: 0);
    await this .updateField (cat._id, 'budgets', budgets);
    await this._model .ensureCategoryHasSchedule (cat);
  }
}
