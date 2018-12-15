class ImportRulesModel extends Observable {
  constructor (categories, accounts) {
    super();
    this._categories = categories;
    this._accounts   = accounts;
    this._model      = new Model ('importRules');
    this._tranModel  = new TransactionModel();
    this._model .addObserver (this, this._onModelChange);
  }

  delete() {
    this._model     .delete();
    this._tranModel .delete();
  }

  getTransactionModel() {
    return this._tranModel;
  }

  _compare (a,b) {
    return a.type < b.type? -1: a.type > b.type? 1: a.sort < b.sort? -1: 1;
  }

  _onModelChange (eventType, doc, arg, source) {
    switch (eventType) {
      case ModelEvent .UPDATE:
        var e = this._entries .get (doc._id);
        for (let f of Object .keys (arg))
          e [f] = arg [f];
        if (arg .sort && e .predicate)
          e .parent .children = (e .parent .children || []) .sort ((a,b) => {return this._compare (a,b)});
        break;
      case ModelEvent .INSERT:
        this._entries .set (doc._id, doc);
        if (doc .type == ImportRulesModelType .PREDICATE)
          this._rules .set (doc._id, doc);
        else {
          doc .parent           = this._rules .get (doc .predicate);
          doc .parent .children = ((doc .parent .children || []) .concat (doc))
            .sort ((a,b) => {return this._compare (a,b)});
        }
        break;
      case ModelEvent .REMOVE:
        if (doc .type == ImportRulesModelType .PREDICATE) {
          for (let c of this._rules .get (doc._id) .children || [])
            this._entries .delete (c ._id);
          this._rules .delete (doc._id);
        } else {
          var e = this._entries .get (doc._id);
          e .parent .children .splice (e .parent .children .indexOf (e), 1);
        }
        this._entries .delete (doc._id);
        break;
    }
    this._notifyObservers (eventType, doc, arg, source);
  }

  async find() {
    if (!this._entries) {
      this._entries   = new Map();
      this._rules     = new Map();
    } else {
      this._entries .clear();
      this._rules   .clear();
    }
    for (let r of await this._model .find()) {
      if (r .category) {
        const cat = this._categories .get (r .category);
        if (! cat || this._categories .isZombie (r .category))
          r .category = null;
      }
      this._entries .set (r._id, r);
      if (r .type == ImportRulesModelType .PREDICATE)
        this._rules .set (r._id, r);
    }
    for (let r of this._entries .values())
      if (r .predicate) {
        r .parent            = this._rules .get (r .predicate);
        r .parent .children  = ((r .parent && r .parent .children) || []) .concat (r);
      }
    for (let r of this._rules .values())
      if (r .children)
        r .children .sort ((a,b) => {return this._compare (a,b)})
  }

  entriesHaveBeenFound() {
    return this._entries != null;
  }

  async update (id, update, source) {
    return await this._model .update (id, update, source);
  }

  async updateList (list, source) {
    return await this._model .updateList (list, source);
  }

  async insert (insert, source) {
    return await this._model .insert (insert, source);
  }

  async insertList (list, source) {
    return await this._model .insertList (list, source);
  }

  async remove (id, source) {
    var rule = this._rules .get (id);
    if (rule)
      await this._model .removeList ((rule .children || []) .map (c => {return c._id}))
    return await this._model .remove (id, source);
  }

  async removeList (list, source) {
    return await this._model .removeList (list, source);
  }

  refine (isMatch) {
    return this._model .refine (isMatch);
  }

  get (id) {
    return this._entries .get (id);
  }

  isMatch (rule, tran) {
    let allMatch;
    for (let f of ['date', 'payee', 'credit', 'debit', 'description']) {
      let match = true;
      let r = [rule [f + '_op0'] || '', rule [f + '_op1'] || ''];
      let t = [tran [f] || '', tran [f] || ''];
      if (f == 'date')
        for (let i = 0; i < 2; i++)
          if (r[i] < 100)
            t[i] = Types .date._day (t[i]);
          else
            r[i] = Types .date._date (Types .date._year (t[i]), Types .date._month (r[i]), Types .date._day (r[i]))
      switch (rule [f + '_fn']) {
        case 'eq':
          match = (typeof t[0] == 'string'? t[0].trim(): t[0]) == (typeof r[0] == 'string'? r[0].trim(): r[0]);
          break;
        case 'sw':
          match = typeof t[0] == 'string' && t[0] .startsWith (r[0]);
          break;
        case 'ew':
          match = typeof t[0] == 'string' && t[0] .endsWith (r[0]);
          break;
        case 'co':
          match = typeof t[0] == 'string' && t[0] .includes (r[0]);
          break;
        case 'lt':
          match = t[0] < r[0];
          break;
        case 'le':
          match = t[0] <= r[0];
          break;
        case 'ge':
          match = t[0] >= r[0];
          break;
        case 'gt':
          match = t[0] > r[0];
          break;
        case 'be':
          match = t[0] > r[0] && t[1] < r[1];
          break;
        case 'bi':
          match = t[0] >= r[0] && t[1] <= r[1];
          break;
      }
      allMatch = (typeof allMatch == 'undefined'? true: allMatch) & match;
    }
    return allMatch;
  }

  getMatchingRules (tran) {
    let matches = [];
    if (tran)
      for (let rule of this._rules .values())
        if (tran .rulesApplied && tran .rulesApplied .includes (rule._id) || this .isMatch (rule, tran))
          matches .push (rule);
    return matches;
  }

  getMatchingTransactions (rule, trans) {
    return trans .filter (t => {return this .isMatch (rule, t)})
  }

  async applyRule (rule, tran) {
    let amount = (action, f, max) => {
      let field = action [f];
      if (typeof field == 'string') {
        if (field .endsWith ('%')) {
          return Math .round (Math .abs (tran .debit + tran .credit) * Number (field .slice (0, -1)) / 100.0);
        } else if (field == 'due') {
          let cat = this._categories .get (action .category);
          if (cat .account) {
            let acc = this._accounts .getAccount (cat .account);
            if (cat._id == acc .intCategory && acc .category) {
              let due = acc .getInterestDue (tran .date);
              return max !== undefined? Math .min (due, max): due;
            }
          }
          return 0;
        }
      } else
        return field;
    }
    let sort = this._tranModel
      .refine (t     => {return (t .leader || t._seq) == tran._seq})
      .reduce ((m,t) => {return Math .max (m, t .sort || 0)}, 0);

    // handle splits first; they are complicated
    let splitRules = (rule .children || []) .filter (action => {return action .type == ImportRulesModelType .SPLIT});
    if (splitRules .length) {

      // first undo any existing split on this transaction
      if (tran .group) {
        let total = tran .debit - tran .credit;
        for (let t of await this._tranModel .find ({group: tran .group})) {
          if (t._id != tran._id) {
            total += t .debit - t .credit;
            await this._tranModel .remove (t._id);
          }
        }
        tran .debit  = total > 0? total: 0;
        tran .credit = total < 0? -total: 0;
        await this._tranModel .update (tran._id, {
          debit:  tran .debit,
          credit: tran .creditl
        });
      }

      // add new splits, except for remaining
      let remaining   = tran .debit - tran .credit;
      let reallySplit = false;
      for (let [i, action] of splitRules .filter (r => {return r .debit != 'Remaining'}) .entries()) {
        let split = {
          group:       tran._id,
          sort:        ++sort,
          debit:       amount (action, 'debit', tran .debit),
          credit:      amount (action, 'credit', tran .credit),
          category:    action .category || null,
          description: action .description || ''
        }
        if (split .debit || split .credit) {
          if (split .debit < 0)
            [split .debit, split .credit] = [0, -split .debit];
          else if (split .credit < 0)
            [split .debit, split .credit] = [-split .credit, 0];
          if (i == 0)
            await this._tranModel .update (tran._id, split);
          else {
            split._seq    = null;
            split .leader = tran._seq;
            for (let f of ['importTime', 'date', 'payee', 'account'])
              split [f] = tran [f];
            await this._tranModel .insert (split);
            reallySplit = true;
          }
          remaining -= (split .debit - split .credit);
        }
      }

      // handle remaining
      if (remaining != 0) {
        let action = splitRules .find (a => {return a .debit == 'Remaining'});
        await this._tranModel .insert ({
          group:       tran._id,
          sort:        ++sort,
          debit:       remaining > 0?  remaining: 0,
          credit:      remaining < 0? -remaining: 0,
          category:    action .category || null,
          description: action .description || '',
          _seq:        null,
          leader:      tran._seq,
          importTime:  tran .importTime,
          date:        tran .date,
          payee:       tran .payee,
          account:     tran .account
        });
        reallySplit = true;
      }
      if (! reallySplit)
        await this._tranModel .update (tran._id, {group: null, sort: null});
    }

    // do the rest of the rules
    let groupLeader, groupSort=0;
    for (let action of rule .children || [])
      switch (action .type) {
        case ImportRulesModelType .UPDATE:
          let update = {};
          for (let f of ['payee', 'credit', 'debit', 'account', 'category', 'description'])
            if (action [f + 'Update'])
              update [f] = ['credit', 'debit'] .includes (f)? amount (action, f, tran [f]): action [f] || null;
          if (update .debit < 0)
            [update .debit, update .credit] = [0, - update .debit];
          else if (update .credit < 0)
            [update .debit, update .credit] = [- update .credit, 0];
          if (Object .keys (update) .length)
            await this._tranModel .update (tran._id, update);
          break;
        case ImportRulesModelType .ADD:
          let insert = {
            sort:        ++sort,
            importTime:  tran   .importTime,
            date:        tran   .date,
            payee:       action .payee || '',
            debit:       amount (action, 'debit'),
            credit:      amount (action, 'credit'),
            account:     action .account || null,
            description: action .description || ''
          };
          if (insert .debit < 0)
            [insert .debit, insert .credit] = [0, - insert .debit];
          else if (insert .credit < 0)
            [insert .debit, insert .credit] = [- insert .credit, 0];
          insert = await this._tranModel .insert (insert);
          if (action .group) {
            if (action .group == action._id) {
              insert .group = insert._id;
              insert .sort  = 0;
              groupLeader   = insert;
            } else {
              insert .group  = groupLeader .group;
              insert .leader = groupLeader._seq;
              insert .sort   = ++groupSort;
            }
          }
          if (action .category)
            await this._tranModel .update (insert._id, {category: action .category});
          break;
      }
    if (! (tran .rulesApplied && tran .rulesApplied .includes (rule._id)))
      await this._tranModel .update (tran._id, {rulesApplied: (tran .rulesApplied || []) .concat (rule._id)});
 }
}

var ImportRulesModelType = {
  PREDICATE: 0,
  UPDATE:    1,
  SPLIT:     2,
  ADD:       3
}

