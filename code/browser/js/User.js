class User extends Observable {

  constructor() {
    super();
    this._view = new UserView();
    this._view .addObserver (this, this._onViewChange);
  }

  async _onConfigModelChange (eventType, doc, arg, source) {
    if (this._configTabs) {
      if (eventType == ModelEvent .INSERT) {
        let ids = this._configTabs .find ('> ._tabGroupTabs > ._tab > ._field') .toArray() .map (f => {return $(f) .data ('field')._id});
        if (ids .includes (doc._id))
          eventType = ModelEvent .UPDATE;
      }
      switch (eventType) {
        case ModelEvent .INSERT:
          await this._insertConfig (doc);
          break;
        case ModelEvent .REMOVE:
          break;
        case ModelEvent .UPDATE:
          let c = this._configs .find (c => {return c._id == doc._id});
          if (c && arg .name) {
            c .name = arg .name;
            if (this._onLabelChange)
              this._onLabelChange (this .getLabel());
          }
          break;
      }
    }
  }

  async _onBudgetModelChange (eventType, doc, arg, source) {
    if (this._configTabs) {
      if (eventType == ModelEvent .INSERT) {
        let ids = this._configTabs
          .find ('> ._tabGroupContents > ._content > ._contentGroup > ._tabGroup > ._tabGroupTabs > ._tab > ._field')
          .toArray()
          .map (f => {return $(f) .data ('field')._id});
        if (ids .includes (doc._id))
          eventType = ModelEvent .UPDATE;
      }
      switch (eventType) {
        case ModelEvent .INSERT:
          await this._insertBudget (doc);
          break;
        case ModelEvent .REMOVE:
          let i = this._budgets .findIndex (b => {return b._id == doc._id});
          if (i > -1) {
            let did = this._budgets [i]._id;
            this._budgets .splice (i, 1);
            let budgetTabs = this._configTabs .find ('> ._tabGroupContents > ._content > ._contentGroup > ._tabGroup > ._tabGroupTabs > ._tab');
            let bi         = budgetTabs .find ('> ._field') .toArray() .findIndex (f => {return $(f) .data ('field')._id == did});
            this._view .removeTab ($(budgetTabs [bi]));
            if (this._bid == did) {
              this._selectBudget (this._budgets [0]._id);
              let tabs     = this._configTabs .find ('> ._tabGroupContents > ._content > ._contentGroup > ._tabGroup > ._tabGroupTabs > ._tab') .toArray();
              let contents = this._configTabs .find ('> ._tabGroupContents > ._content > ._contentGroup > ._tabGroup > ._tabGroupContents > ._content') .toArray();
              this._view .selectTab ({tab: $(tabs [0]), content: $(contents [0])});
            }
          }
          break;
        case ModelEvent .UPDATE:
          let b = this._budgets .find (b => {return b._id == doc._id});
          if (b) {
            for (let f in arg)
              if (! f .startsWith ('_'))
                b [f] = doc [f];
          }
          this._updateCookie();
          if (arg .name) {
            if (this._onLabelChange)
              this._onLabelChange (this .getLabel())
          } else if (arg .start || arg .end)
            // Change to start or end date require re-evaluation of actuals; this is the easiest way to force that (perhaps overkill)
            this._notifyObservers (UserEvent .NEW_CONFIGURATION);
          break;
      }
    }
  }

  async _insertConfig (doc) {
    this._configs .push (doc);
    this._configs = this._configs .sort ((a,b) => {return a .name < b .name? -1: a .name == b .name? 0: 1})
    this._selectConfig    (doc._id);
    await this._addConfig (doc, true);
  }

  async _insertBudget (doc) {
    this._budgets .push (doc);
    this._budgets = this._budgets .sort ((a,b) => {return a .name > b .name? -1: a .name == b .name? 0: 1});
    let ci = this._configTabs
      .find ('> ._tabGroupTabs > ._tab > ._field') .toArray()
      .findIndex (f => {return $(f) .data ('field')._id == doc .configuration});
    let budgetTabs = $(this._configTabs .find ('> ._tabGroupContents > ._content') .toArray() [ci])
      .find ('> ._contentGroup > ._tabGroup')
    if (budgetTabs)
      this._addBudget (doc, budgetTabs, true);
  }

  async _onViewChange (eventType, arg) {
  
    switch (eventType) {
      case UserViewEvent .LOGIN:
        let login = await Model .login (arg .username, arg .password);
        if (login .noUser)
          this._view .loginError ('No user exists with that email');
        else if (login .badPassword)
          this._view .loginError ('Incorrect password');
        else {
          let user         = login .user;
          this._uid        = user._id;
          this._accessCap  = user .accessCap;
          this._username   = user .username;
          this._name       = user .name;
          this._cid        = user .curConfiguration;
          if (arg .remember)
            this._addCookie();
          this._setModelsForConfig();
          await this._init();
          this._view .removeLogin();
          this._notifyObservers (UserEvent .NEW_USER);
        }
        break;

      case UserViewEvent .SIGNUP_ASK:
        this._view .addSignup();
        break;

      case UserViewEvent .SIGNUP:
        if (arg .username .length == 0)
          this._view .loginError ('Email can not be blank');
        else if (arg .name .length == 0)
          this._view .loginError ('Name can not be blank');
        else if (arg .password .length == 0)
          this._view .loginError ('Password can not be blank');
        else if (arg .password != arg .confirm)
          this._view .loginError ('Passwords do not match');
        else {
          arg .username = arg .username .toLowerCase();
          let signup = await Model .signup ({username: arg .username, password: arg .password, name: arg .name});
          if (signup .alreadyExists)
            this._view .loginError ('User already exists with that email');
          else {
            this._uid       = signup._id;
            this._accessCap = signup .accessCap;
            this._username  = arg .username;
            this._name      = arg .name;
            this._setModelsForConfig();
            this._cid  = (await this._configModel .insert ({user: this._uid, name: 'Default'}))._id;
            await Model .updateUser (this._uid, this._accessCap, {curConfiguration: this._cid});
            this._setModelsForConfig();
            await this._initConfig();
            if (arg .remember)
              this._addCookie();
            this._view .removeLogin();
            this._notifyObservers (UserEvent .NEW_USER);
          }
        }
        break;

      case UserViewEvent .TAB_CLICK:
        if (arg .content) {
          this._view .selectTab (arg);
          let field = arg .tab .find ('._field') .data('field');
          if (field._name .startsWith ('c_'))
            await this._selectConfig (field._id);
          else
            this._selectBudget (field._id);
        } else
          /* ADD */
          switch (arg .name) {
            case 'configurations':
              this._cid = (await this._configModel .insert ({user: this._uid, name: 'Untitled'}))._id;
              this._setModelsForConfig();
              await this._initConfig();
              await this._selectConfig (this._cid);
              break;
            case 'budgets':
              this._view .addBudgetAddPopup (arg .target, this._budgets);
              break;
          }
        break;

      case UserViewEvent .BUDGET_ROLLOVER:
        await this._rollover (arg .from);
        break

      case ViewEvent .UPDATE:
        if (arg .id && arg .value) {
          let model  = arg .fieldName .startsWith ('c_')? this._configModel: this._budgetModel;
          let update = {}
          update [arg .fieldName .slice (2)] = arg .value;
          await model .update (arg.id, update);
          this._notifyObservers (UserEvent .NEW_CONFIGURATION);
        }
        break;
    }
  }

  newConfigurationAccepted() {
    if (this._hasCookie) {
      this._addCookie();
      this._hasCookie = false;
    }
  }

  _addCookie() {
    const pickle = ['_uid', '_accessCap', '_username', '_name', '_cid'];
    let   expiry = new Date();
    expiry .setTime (expiry .getTime() + (1000 * 24 * 60 * 60 * 1000));
    document .cookie =
      'user='    + JSON .stringify (pickle .reduce ((o,p) => {o [p] = this [p]; return o}, {})) + '; ' +
      'expires=' + expiry .toUTCString()
  }

  _updateCookie() {
    if (document .cookie .split (';') .find (c => {return c .startsWith ('user={')}))
      this._addCookie();
  }

  async _tryCookie() {
    let cookie = document .cookie .split (';') .find (c => {return c .startsWith ('user={')});
    if (cookie) {
      let cv = JSON .parse (cookie .slice (5));
      for (let p in cv)
        this [p] = cv [p];
      this._setModelsForConfig();
      await this._init();
      this._hasCookie = true;
      this._deleteCookie()
      this._notifyObservers (UserEvent .NEW_USER);
      return true;
    } else
      return false;
  }

  async _init() {
    this._configs = (await this._configModel .find()) .sort ((a,b) => {return a .name < b .name? -1: a .name == b.name? 0: 1});
    this._budgets = (await this._budgetModel .find()) .sort ((a,b) => {return a .name > b .name? -1: a .name == b.name? 0: 1});
    this._bid     = this._configs .find (c => {return c._id == this._cid}) .curBudget;
    if (! this._budgets .find (b => {return b._id == this._bid}))
      this._bid = this._budgets [0]._id;
  }

  _deleteCookie() {
    document .cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:00 UTC'
  }

  async _initConfig () {
    await this._initBudget();
    await this._configModel .update (this._cid, {curBudget: this._bid});
    this._configs = (await this._configModel .find()) .sort ((a,b) => {return a .name < b .name? -1: a .name == b .name? 0: 1})
  }

  async _initBudget() {
    let y  = Types .date._year (Types .date .today());
    let b  = await this._budgetModel .insert({
      name:             this._budgets && this._budgets .length? 'Untitled': 'Default',
      start:            Types .date._date (y,  1,  1),
      end:              Types .date._date (y, 12, 31),
      startCashBalance: 0,
      configuration:    this._cid
    });
    let cm = new Model ('categories', this .getDatabaseName());
    let exp = await cm .insert ({
      name: 'Spending',
      parent: null,
      sort: 1,
      budgets: [b._id]
    })
    let sav = await cm .insert ({
      name: 'Savings',
      parent: null,
      sort: 2,
      budgets: [b._id],
      goal: true
    })
    let inc = await cm .insert({
      name: 'Income',
      parent: null,
      sort: 3,
      budgets: [b._id],
      credit: true,
      goal: true
    })
    let sus = await cm .insert ({
      name: 'Suspense',
      parent: null,
      sort: 4,
      budgets: [b._id]
    })
    await this._budgetModel .update (b._id, {
      incomeCategory:   inc._id,
      savingsCategory:  sav._id,
      expenseCategory:  exp._id,
      suspenseCategory: sus._id
    })
    this._bid     = b._id;
    this._budgets = (await this._budgetModel .find()) .sort ((a,b) => {return a .name > b .name? -1: a .name == b .name? 0: 1});
    cm .delete();
  }

  async login () {
    if (! (await this._tryCookie ()))
      this._view .addLogin ($('body'));
  }

  logout() {
    this._deleteCookie();
    this._uid     = null;
    this._configs = null;
    this._budgets = null;
    this._notifyObservers (UserEvent .LOGOUT);
  }

  getDatabaseName (cid = this._cid) {
    return 'config_' + cid + '_' + this._accessCap;
  }

  getLabel (onChange) {
    if (onChange)
      this._onLabelChange = onChange;
    if (this._configs) {
      let label = this._configs .length == 1? this._name: this._configs .find (c => {return c._id == this._cid}) .name;
      if (this._budgets .length > 1)
        label = this._budgets .find (b => {return b._id == this._bid}) .name + '&nbsp;&nbsp;&nbsp;&nbsp;' + label;
      return label;
    } else
      return '';
  }

  getBudgetId() {
    return this._bid;
  }

  _addMenuItem (name, action) {
    this._view .addMenuItem (name, () => {this._view .removeMenu(); action()});
  }

  async _selectConfig (cid) {
    this._cid = cid;
    this._updateCookie();
    this._setModelsForConfig();
    await this._init();
    this._notifyObservers (UserEvent .NEW_CONFIGURATION);
    if (this._onLabelChange)
      this._onLabelChange (this .getLabel());
    async (null, Model .updateUser) (this._uid, this._accessCap, {curConfiguration: this._cid});
  }

  _selectBudget (bid) {
    this._bid = bid;
    this._updateCookie();
    this._notifyObservers (UserEvent .NEW_CONFIGURATION);
    if (this._onLabelChange)
      this._onLabelChange (this .getLabel());
    async (this._configModel, this._configModel .update) (this._cid, {curBudget: this._bid});
  }

  showMenu (toHtml) {
    let html = $('body');
    this._view .addMenu (html, {top: 48, right: 10}, toHtml, {top: 0, right: 10});
    this._addMenuItem ('Edit Profile', () => {async (this, this._showAccountEdit) ()});
    if (this._configs .length > 1) {
      let items = this._configs
        .filter (c => {return c._id != this._cid})
        .map (c => {return {
          name:   c .name,
          action: e => {
            this._view .removeMenu();
            async (this, this._selectConfig) (c._id);
          }
        }})
      this._view .addSubMenu ('Change Configuration', items);
    }
    if (this._budgets .length > 1) {
      let items = this._budgets
        .filter (b => {return b._id != this._bid})
        .map (b => {return {
          name:   b .name,
          action: e => {
            this._view .removeMenu();
            this._selectBudget (b._id);
          }
        }})
      this._view .addSubMenu ('Change Budget', items);
    }
    this._addMenuItem ('Logout',  () => {this .logout()});
  }

  _setModelsForConfig() {
    if (this._configModel)
      this._configModel .delete();
    if (this._budgetModel)
      this._budgetModel .delete();
    this._configModel = new Model ('configurations', 'user_' + this._uid + '_' + this._accessCap);
    this._budgetModel = new Model ('budgets',        this .getDatabaseName());
    this._configModel .addObserver (null, (e,d,a,s) => {async (this, this._onConfigModelChange) (e,d,a,s)});
    this._budgetModel .addObserver (null, (e,d,a,s) => {async (this, this._onBudgetModelChange) (e,d,a,s)});
    this._configModel .observe();
    this._budgetModel .observe();
  }

  async _addAccountEdit() {
    let ae = this._view .addAccountEdit();
    this._addUserEdit   (ae);
    await this._addConfigEdit (ae);
  }

  _addUserEdit (ae) {
    let ag = this._view .addGroup ('Profile', ae);
    let email    = this._view .addLine (ag);
    let password = this._view .addLine (ag);
    let name     = this._view .addLine (ag);
    let update   = this._view .addLine (ag);
    this._view .addLabel    ('Email',            email);
    this._view .addLabel    ('Password',         password);
    this._view .addLabel    ('Name',             name);
    this._view .addInput    ('Email',            this._username, email);
    this._view .addInput    ('Old Password',     '', password, 'password');
    this._view .addInput    ('New Password',     '', password, 'password');
    this._view .addInput    ('Confirm Password', '', password, 'password');
    this._view .addInput    ('Name',             this._name, name);
    this._view .addButton   ('Update Profile',   async (this, this._updateAccount), update);
    this._accountEditError = this._view .addLabel ('', update, '_errorMessage');
  }

  _addBudget (b, budgetTabs, select) {
    let budgetTab = this._view .addTab (budgetTabs);
    this._view .addField (
      new ViewScalableTextbox ('b_name',  ViewFormats ('string'), '', '',  'Budget Name'),
      b._id, b .name, budgetTab .tab
    );
    let line = this._view .addLine (budgetTab .content);
    this._view .addField (
      new ViewTextbox ('b_start', ViewFormats ('dateDMY'), '', '', 'Start Date'),
      b._id, b .start, line, 'Start'
    );
    this._view .addField (
      new ViewTextbox ('b_end',   ViewFormats ('dateDMY'), '', '', 'End Date'),
      b._id, b .end, line, 'End'
    );
    this._view .addButton ('Delete Budget', () => {
      async (this, this._deleteBudget) (b._id);
    }, this._view .addLine (budgetTab .content));
    if (b._id == this._bid)
      this._view .selectTab (budgetTab);
    if (select)
      this._view .selectTab (budgetTab);
  }

  async _addConfig (c, select) {
    let configTab = this._view .addTab (this._configTabs);
    this._view .addField (new ViewScalableTextbox ('c_name', ViewFormats ('string'), '', '', 'Config Name'), c._id, c .name, configTab .tab);
    if (select)
      this._view .selectTab (configTab);
    let budgetContentGroup = this._view .addTabContentGroup ('Budgets', configTab .content);
    let budgetTabs = this._view .addTabGroup ('budgets', budgetContentGroup);
    this._view .addButton ('Delete Configuration', () => {}, this._view .addLine (configTab .content));
    let bm = new Model ('budgets', this .getDatabaseName (c._id));
    let budgets = (await bm .find ({})) .sort ((a,b) => {return a .name > b .name? -1: a .name == b .name? 0: 1});
    bm .delete();
    let budgetTab = this._view .addTab (budgetTabs, '_add', true, 'Add');
    for (let b of budgets)
      this._addBudget (b, budgetTabs, b._id == c .curBudget);
  }

  async _addConfigEdit (ae) {
    let configGroup = this._view .addGroup ('Configurations', ae, '_dark');
    let configs = await this._configModel .find ({});
    this._configTabs = this._view .addTabGroup ('configurations', configGroup);
    this._view .addTab (this._configTabs, '_add', true, 'Add');
    let cid = this._cid;
    for (let c of configs) {
      this._cid = c._id
      this._setModelsForConfig();
      await this._addConfig (c, c._id == cid);
    }
    this._cid = cid;
    this._setModelsForConfig();

  }

  async _updateAccount (values) {
    let [email, oldPassword, newPassword, confirmPassword, name] = values;
    email = email .toLowerCase();
    let update   = {username: email == this._username? undefined: email, name: name};
    let password = undefined;
    if (newPassword) {
      if (newPassword != confirmPassword) {
        this._view .setLabel (this._accountEditError, 'Profile not updated &mdash; New and confirm passwords do not match');
        return;
      } else {
        password         = oldPassword;
        update .password = newPassword;
      }
    }
    let result = await Model .updateUser (this._uid, this._accessCap, update, password);
    if (result .passwordMismatch)
      this._view .setLabel (this._accountEditError, 'Profile not updated &mdash; Old password does not match');
    else if (result .alreadyExists)
      this._view .setLabel (this._accountEditError, 'Profile not updated &mdash; Another user with that email already exists');
    if (result .ok) {
      this._username = email;
      this._name     = name;
      if (this._onLabelChange)
        this._onLabelChange (this .getLabel())
      this._updateCookie();
      this._view .setLabel (this._accountEditError, 'Profile Updated');
    }
  }

  async _showAccountEdit() {
    await this._addAccountEdit();
  }

  async _deleteBudget (id) {
    let cm         = new Model            ('categories',   this .getDatabaseName());
    let sm         = new Model            ('schedules',    this .getDatabaseName());
    let tm         = new TransactionModel (this .getDatabaseName());
    let updateList = (await cm .find ({budgets: id}))
      .map (c => {
        let i = c .budgets .indexOf (id);
        if (i >= 0) {
          c .budgets .splice (i, 1)
          return {
            id:     c._id,
            update: {
              budgets: c .budgets
            }
          }
        }
      })
      .filter (c => {return c})
    let removeList = updateList
      .filter (u => {return u .update .budgets .length == 0})
      .map    (u => {return u .id});
    let b  = await this._budgetModel .find ({_id: id});
    let rt = (await tm .find ({category: {$in: removeList}}))
      .reduce ((s, t) => {
        return s .add (t .category)
      }, new Set());
    removeList = removeList .filter (r => {return ! rt .has (r)});
    let rs     = new Set (removeList);
    updateList = updateList .filter (u => {return ! rs .has (u .id)});
    let categoriesUpdate = cm .updateList (updateList);
    let categoriesRemove = cm .removeList (removeList);
    let schedulesRemove  = sm .removeList ((await sm .find ({budget: id})) .map (s => {return s._id}))
    let budgetUpdate     = this._budgetModel .remove (id);
    await categoriesUpdate;
    await categoriesRemove;
    await schedulesRemove;
    await budgetUpdate;
    cm .delete();
    sm .delete();
    tm .delete();
  }

  async _rollover (from) {
    let b = Object .assign ({}, this._budgets .find (b => {return b._id == from}));
    b .start            = Types .date .addYear (b .start, 1);
    b .end              = Types .date .addYear (b .end,   1);
    b .name             = BudgetModel .getLabelForDates (b .start, b .end);
    b .startCashBalance = 0;
    b._id               = undefined;
    b = await this._budgetModel .insert (b);
    let cm = new Model ('categories', this .getDatabaseName());
    let sm = new Model ('schedules',  this .getDatabaseName());
    let fc = (await cm .find ({budgets: from})) .reduce ((m,c) => {m .set (c._id, c); return m}, new Map());
    for (let c of fc .values()) {
      let parent = c .parent && fc .get (c .parent);
      if (parent)
        parent .children = (parent .children || []) .concat (c);
    }
    let fs = await sm .find ({budget: from});

    // get new schedule
    let ts = [];
    for (let sch of fs || []) {

      if (! Types .date .isBlank (sch .start) && fc .get (sch .category)) {
        let fy  = Types .date .isYear (sch .start)? sch.start: Types .dateFY._fiscalYear (sch .start, b .start, b .end);
        let c   = Types .date._year (b .start) - fy;
        sch._id = undefined;

        if (c <= 0) {
          ts .push (sch);

        } else if (Types .date .isYear (sch .start)) {
          if (sch .repeat && (! sch .limit || sch .limit >= c)) {
            sch .start += c;
            if (sch .limit) {
              sch .limit -= c;
              sch .repeat = sch .limit > 0;
            }
            ts .push (sch);
          }

        } else if (Types .date .isInfinity (sch .end)) {
          sch .start = b .start;
          ts .push (sch);


        } else {
          if ((sch .repeat && (! sch .limit || sch .limit >= c)) || (sch .end >= b .start)) {
            sch .start = Types .date .addYear (sch .start, c);
            if (Types .date .isMonth (sch .end) && (sch .repeat && (! sch .limit || sch .limit >= c)))
              sch .end = Types .date .addYear (sch .end,   c);
            if (sch .limit) {
              sch .limit -= c;
              sch .repeat = sch .limit > 0;
            }
            ts .push (sch)
          }
        }
       }
    }

    // get new categories
    let tc = new Set();
    let addCat = id => {
      if (id) {
        tc .add (id);
        addCat (fc .get (id) .parent);
      }
    }
    let addCatAndDescendants = id => {
      addCat (id);
      for (let c of fc .get (id) .children || [])
        addCatAndDescendants (c._id);
    }
    for (let sch of ts || [])
      addCat (sch .category);

    // add no-budget categories descendants
    let bc = fs .filter (s => {return ! Types .date .isBlank (s .start)}) .reduce ((s, sch) => {s .add (sch .category); return s}, new Set());
    let hasNoBudget = cats => {
      return ((cats || []) .length == 0) || (! cats .find (cat => {return bc .has (cat._id) || (! hasNoBudget (cat .children))}))

    }
    for (let cid of tc) {
      for (let cat of fc .get (cid) .children || [])
        if (hasNoBudget ([cat]))
          addCatAndDescendants (cat._id);
    }

    // ensure that all categories have a schedule
    let tsc = ts .reduce ((s,sch) => {s .add (sch .category); return s}, new Set());
    for (let cid of tc .keys())
      if (! tsc .has (cid))
        ts .push ({
          amount:   0,
          category: cid,
          limit:    0,
          repeat:   true,
          sort:     0,
          start:    ''
        });

    // set budget for schedules
    for (let sch of ts)
      sch .budget = b._id;

    // update the models
    let updateList = []
    for (let cid of Array .from (tc .keys()))
      updateList .push ({
        id:     cid,
        update: {
          budgets: fc .get (cid) .budgets .concat (b._id)
        }
      })
    let catUpdate = cm .updateList (updateList);
    let schInsert = sm .insertList (ts);
    await catUpdate;
    await schInsert;

    // finish
    cm .delete();
    sm .delete();
    this._selectBudget (b._id);
  }
}

UserEvent = {
  NEW_USER: 0,
  NEW_CONFIGURATION: 1,
  LOGOUT: 2
}
