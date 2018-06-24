window.addEventListener ("error",              e => {console .log (e .error)});
window.addEventListener ("unhandledrejection", e => {console .log (e .reason)});

$(document) .ready (() => {
  // LocalDBTest .run();
  let app = new App();
  (async () => {await app .start()}) ();
  // console.log(new Crypto('defuca') .getPasswordHash() .then (v => console.log(v)));
  // const c = new Crypto('asdfasdf');
  // c .getPasswordHash() .then (v => console.log(v));
  // c .getServerPassword() .then (v => console.log(v));
});

class App {

  async start() {
    ui .ModalStack .init();
    Model .addRemoteDatabaseObserver (this, this._onDatabaseChange);
    this._status = $('<div>', {class: '_systemStatus'}) .appendTo ('body');
    this._pending = 0;
    this._isDown = false;
    this._user = new User();
    this._user .addObserver (this, this._configurationChange);
    this._user .land();
  }

  _setPending (transition, delay) {
    if (transition) {
      if (this._pendingTimer)
        clearTimeout (this._pendingTimer);
      this._pendingTimer = setTimeout (() => {
        if (this._waitingOnNetwork)
          this._waitingOnNetwork .css ({display: 'block'})
      }, PENDING_INITIAL_PAUSE);
    }
  }

  _setDelayed (transition) {
    let addText = () => {this._status .text (this._pending + ' update' + (this._pending > 1? 's': '') + ' in progress')}
    if (transition) {
      this._status .addClass ('_delayed');
      if (this._status .text() == '')
        addText();
      this._status
        .queue ('_systemStatus', next => {
          this._status .animate ({
            opacity:         1,
            width:           '200px',
            height:          '40px',
            'line-height':   '40px',
            'font-size':     '18px',
            color:           'rgb(102, 95, 61)',
            backgroundColor: 'rgba(255, 236, 128, 0.7)'
          }, {
            complete: () => {addText()},
            duration: 100
          });
          next();
        })
        .dequeue ('_systemStatus')
    } else
      addText();
  }

  _setClear (transition) {
    if (transition) {
      this._status .clearQueue    ('_systemStatus') .fadeOut (100, () => {
        this._status .text        ('');
        this._status .removeClass ('_pending _delayed');
        this._status .css         ({display: 'block', opacity: 0, height: '0px', width: '0px'})
      });
      if (this._pendingTimer) {
        clearTimeout (this._pendingTimer);
        this._pendingTimer = null;
      }
      if (this._waitingOnNetwork)
        this._waitingOnNetwork .css ({display: 'none'});
    }
  }

  _setSharing (isSharing) {
    this._sharing .css ({display: isSharing? 'block': 'none'});
  }

  _setDown (transition) {
    let block = $('body') .children ('._blockEverything');
    if (transition && block .length == 0) {
      block = $('<div>', {class: '_blockEverything'}) .appendTo ($('body'));
      setTimeout (() => {$(document.activeElement) .blur()}, 0);
      let nop = e => {e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault(); return false}
      ui .ModalStack .setBlocked (true);
      block [0] .addEventListener ('click', nop, true);
      this._status .detach();
      this._status .appendTo (block);
      this._status .addClass ('_down');
      this._status
        .queue ('_systemStatus', next => {
          this._status .animate ({
            opacity: 1,
            'font-size': '32px',
            height:  '80px',
            'line-height': '80px',
            width:  '400px',
            color: 'rgb(255,245,245)',
            'background-color': 'rgba(255, 50, 50 , 0.7)'
          }, {
            complete: () => {
              this._status .text ('Cloud Connection Offline');
            },
            duration: 100
          })
        })
        .dequeue ('_systemStatus')
    }
  }

  _setUp (transition, immediately) {
    let block = $('body') .children ('._blockEverything');
    let makeUp = () => {
      this._status .removeClass ('_down');
      this._status .detach();
      this._status .appendTo ($('body'));
      block .remove();
      ui .ModalStack .setBlocked (false);
    }
    if (transition && block .length) {
      if (immediately)
        makeUp();
      else
        this._status .fadeOut (100, () => {makeUp()})
    }
  }

  _setStatus (newStatus) {
    if (newStatus .isDown !== undefined && newStatus .isDown != this._isDown) {
      if (newStatus .isDown) {
        this._setDown (true);
        this._isDown = true;
      } else {
        newStatus .pending = this._pending;
        this._pending = -1;
      }
    }
    if (newStatus .pending !== undefined) {
      if (this._pending <= 0 || (newStatus .pending < DOWN_LOWER_BOUND && this._pending >= DOWN_LOWER_BOUND)) {
        this._setUp (true, true);
        this._isDown = false;
      }
      let oldPending = this._pending;
      this._pending  = newStatus .pending;
      if (this._pending < PENDING_LOWER_BOUND)
        this._setClear (oldPending < 0 || oldPending >= PENDING_LOWER_BOUND);
      else if (this._pending < DELAYED_LOWER_BOUND)
        this._setPending (oldPending < PENDING_LOWER_BOUND || oldPending >= DELAYED_LOWER_BOUND, oldPending >= 0 && oldPending < PENDING_LOWER_BOUND);
      else if (this._pending < DOWN_LOWER_BOUND)
        this._setDelayed (oldPending < DELAYED_LOWER_BOUND || oldPending >= DOWN_LOWER_BOUND);
      else
        this._setDown (oldPending < DOWN_LOWER_BOUND);
    }
  }

  _onDatabaseChange (eventType, arg) {
    if (!this._isPermanentlyDown)
      switch (eventType) {

        case DBAdaptorEvent .PENDING_UPDATES_CHANGE:
            this._setStatus ({pending: arg});
          break;

        case DBAdaptorEvent .STATE_CHANGE:
          this._setStatus ({isDown: arg == DBAdaptorState .DOWN || arg == DBAdaptorState .PERMANENTLY_DOWN})
          this._isPermanentlyDown = arg == DBAdaptorState .PERMANENTLY_DOWN;
          break;

        case DBAdaptorEvent .SHARING_CHANGE:
          this._setSharing (arg);
          break;
      }
  }

  _deleteModels() {
    for (let model of this._models || [])
      model .delete();
    this._models = [];
  }

  _search() {
    let close = skipDeleteModal => {
      this._lastSearch = this._searchInput .val();
      this._searchPopup .remove();
      this._searchPopup = null;
      if (! skipDeleteModal)
        ui .ModalStack .delete (this._searchModal);
    }
    if (! this._isDown) {
      if (! this._searchPopup) {
        ui .ModalStack .clear();
        this._searchPopup = $('<div>', {class: '_search _input'}) .appendTo ($('body'));
        $('<label>') .appendTo ($('<div>') .appendTo (this._searchPopup))
          .append ($('<span>',  {class: 'lnr-magnifier'}))
          .append ($('<input>', {type: 'text', placeholder: 'Search'}))
        this._searchInput = this._searchPopup .find ('input');
        this._searchInput [0] .addEventListener ('keydown', e => {
          if (e .keyCode == 13) {
            console.log($('body') .scrollTop(), $('html') .scrollTop());
            TransactionHUD .search (this._searchInput .val(), this._accModel, this._varModel, $('body'), {top: ($('html') .scrollTop() || $('body') .scrollTop()) + 56, left: 30});
            close();
          }
          if (e .keyCode == 90 && e .metaKey) {
            e .stopImmediatePropagation();
          }
        }, true);
        if (this._lastSearch)
          this._searchInput .val (this._lastSearch);
        this._searchInput .select();
        this._searchModal = ui .ModalStack .add (
          e => {return e && ! $.contains (this._searchPopup .get (0), e .target)},
          e => {close (true)},
          true
        )
      } else
        close();
    }
  }

  async _disconnect() {
    await Model .databaseDisconnect();
    this._deleteModels();
    if (this._it) {
      this._it .delete();
      this._na .delete();
      this._se .delete();
      this._ac .delete();
      this._it = null;
    }
  }

  _setTabVisibility (status) {
    let hidden = [];
    if (! status .hasActivity && ! status .hasBudget)
      hidden = [this._proT, this._actT, this._budT, this._perT];
    else if (! status .hasActivity)
      hidden = [this._actT];
    else if (! status .hasBudget)
      hidden = [this._budT, this._perT];
    if (! status .hasAssets)
      hidden .push (this._weaT);
    this._tabs .setHidden (hidden);
  }

  async _configurationChange (eventType, arg) {

    let handleNameClick = e => {
      this._prefs .showMenu ($(e .target));
    }

    if (eventType == UserEvent .DISCONNECT) {

      await this._disconnect();
      this._tabs .clear();

    } else if (eventType == UserEvent .NEW_USER) {

      this._tabs = new ui.Tabs ($('body'), handleNameClick);
      document .documentElement .addEventListener ('keydown', e => {
        if (e .metaKey && (e .keyCode == 70 || e .keyCode == 102)) {
          this._search();
          e .preventDefault();
        }
        }, true);
      this._proT = this._tabs .addTab  ('Progress', ! arg .hasActivity && ! arg .hasBudget);
      this._traT = this._tabs .addTab  ('Inbox');
      this._actT = this._tabs .addTab  ('Activity', ! arg .hasActivity);
      this._budT = this._tabs .addTab  ('Budget', ! arg .hasBudget);
      this._plaT = this._tabs. addTab  ('Plan');
      this._perT = this._tabs .addTab  ('Perspective', ! arg .hasBudget);
      this._weaT = this._tabs .addTab  ('Wealth', ! arg .hasAssets);
      this._accT = this._tabs .addTab  ('Accounts');
      this._waitingOnNetwork  = this._tabs .addIconTool ('lnr-cloud _status');
      this._waitingOnNetwork  .css ({display: 'none'});
      this._sharing = this._tabs .addIconTool ('lnr-users _sharing');
      this._sharing .css ({display: 'none'});
      let tl = this._tabs .addTool (this._user .getLabel (l => {
        this._tabs .changeToolName (tl, l);
      }), e => {this._user .showMenu ($(e .target))})
    } else if (eventType == UserEvent .STATUS_CHANGE)
      this._setTabVisibility (arg);


    if ((eventType == UserEvent .NEW_USER || eventType == UserEvent .NEW_CONFIGURATION) && this._tabs) {
      let prefsWasShowing = this._prefs && this._prefs .isShowing();

      await this._disconnect();

      /* models */
      Model .setDatabase (this._user .getDatabaseName());
      Model .databaseConnect();
      this._prefs    = new Preferences();
      this._budModel = new BudgetModel   ();
      this._accModel = new AccountsModel (this._budModel);
      this._actModel = new ActualsModel  (this._budModel, this._accModel);
      this._varModel = new VarianceModel (this._budModel, this._actModel);
      this._models   = [this._budModel, this._actModel, this._varModel, this._accModel, this._prefs];

      /* queries */
      await this._accModel .find();
      await this._budModel .find (this._user .getBudgetId(), this._actModel);
      await this._actModel .findCurrent();
      await this._prefs    .init (prefsWasShowing);

      /* presenters */
      this._it = new ImportTransactions   (this._accModel, this._varModel);
      this._na = new Navigate             (this._accModel, this._varModel);
      this._na .prime();
      this._se = new IndexedScheduleEntry ('_CategoryMenu', '_ScheduleEntry', this._accModel, this._varModel);
      this._ac = new Accounts             (this._accModel, this._budModel);

      /* tabs */
      this._tabs .setTab  (this._proT, html => {this._na .addProgressHtml     (html)});
      setTimeout (() => { // ensure progress is rendered so that chartJS stuff gets height before any switch to another tab
        this._tabs .setTab  (this._traT, html => {this._it .addHtml             (html)}, true);
        this._tabs .setTab  (this._actT, html => {this._na .addRealityHtml      (html)});
        this._tabs .setTab  (this._budT, html => {this._na .addPlanHtml         (html)});
        this._tabs. setTab  (this._plaT, html => {this._se .addHtml             (html)});
        this._tabs .setTab  (this._perT, html => {this._na .addPerspectiveHtml  (html)});
        this._tabs .setTab  (this._weaT, html => {this._na .addNetWorthHtml     (html)});
        this._tabs .setTab  (this._accT, html => {this._ac .addHtml             (html)});
        this._setTabVisibility (arg);
        this._user .newConfigurationAccepted();
        this._tabs .setClickable (true);
      }, 0)

   } else if (eventType == UserEvent .LOGOUT) {
     $('body') .empty();
     (async () => {await this._user .land()}) ();
   }
  }
}

