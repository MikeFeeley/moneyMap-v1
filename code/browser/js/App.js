window.addEventListener ("error",              e => {console .log (e .error)});
window.addEventListener ("unhandledrejection", e => {console .log (e .reason)});

$(document) .ready (() => {
  let app = new App();
  (async () => {await app .start()}) ();
});

class App {

  async start() {
    ui .ModalStack .init();
    Model_addDatabaseObserver (this, this._onDatabaseChange);
    Model_databaseConnect();
    this._status = $('<div>', {class: '_systemStatus'}) .appendTo ('body');
    this._pending = 0;
    this._isDown = false;
    this._user = new User();
    this._user .addObserver (this, this._configurationChange);
    this._user .login();
  }

  _setPending (transition, delay) {
    let addText = () => {this._status .text (this._pending + ' update' + (this._pending > 1? 's': '') + ' in progress')}
    if (transition) {
      this._status .addClass ('_pending');
      if (this._status .text() == '')
        addText();
      this._status
        .delay (delay? PENDING_INITIAL_PAUSE: 0, '_systemStatus')
        .queue ('_systemStatus', next => {
          this._status .animate ({
            opacity:         1,
            'font-size': '12px',
            height:  '30px',
            'line-height': '30px',
            width:   '150px',
            color: 'rgb(102, 128, 102)',
            'background-color': 'rgba(100, 255, 100, 0.3)'
          }, {
            complete: () => {addText()},
            duration: 400
          });
          next();
        })
        .dequeue ('_systemStatus');
    } else
      addText();
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
            backgroundColor: 'rgba(255, 225, 0, 0.4)'
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
    }
  }

  _setDown (transition) {
    let block = $('body') .children ('._blockEverything');
    if (transition && block .length == 0) {
      block = $('<div>', {class: '_blockEverything'}) .appendTo ($('body'));
      let nop = e => {e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault(); return false}
      ui .ModalStack .setBlocked (true);
      block [0] .addEventListener ('click', nop, true);
      $(document .activeElement) .blur();
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
            width:  '350px',
            color: 'rgb(255,245,245)',
            'background-color': 'rgba(255, 50, 50 , 0.7)'
          }, {
            complete: () => {
              this._status .text ('Server Connection Lost');
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
      }
  }

  _deleteModels() {
    for (let model of this._models || [])
      model .delete();
    this._models = [];
  }

  async _configurationChange (eventType) {

    let handleNameClick = e => {
      this._prefs .showMenu ($(e .target));
    }
  
    if (eventType == UserEvent .NEW_USER) {

      this._tabs = new ui.Tabs ($('body'), handleNameClick);
      this._proT = this._tabs .addTab  ('Progress');
      this._traT = this._tabs .addTab  ('Transactions');
      this._actT = this._tabs .addTab  ('Activity');
      this._budT = this._tabs .addTab  ('Budget');
      this._plaT = this._tabs. addTab  ('Plan');
      this._perT = this._tabs .addTab  ('Perspective');
      this._weaT = this._tabs .addTab  ('Wealth');
      this._accT = this._tabs .addTab  ('Accounts');
      let tl = this._tabs .addTool (this._user .getLabel (l => {
        this._tabs .changeToolName (tl, l);
      }), e => {this._user .showMenu ($(e .target))})
    }

    if (eventType == UserEvent .NEW_USER || eventType == UserEvent .NEW_CONFIGURATION) {

      /* models */
      Model .setDatabase (this._user .getDatabaseName());
      this._deleteModels();
      this._budModel = new BudgetModel   ();
      this._accModel = new AccountsModel ();
      this._actModel = new ActualsModel  (this._budModel, this._accModel);
      this._varModel = new VarianceModel (this._budModel, this._actModel);
      this._prefs    = new Preferences();
      this._models   = [this._budModel, this._actModel, this._varModel, this._accModel, this._prefs];

      /* queries */
      this._accounts = this._accModel .find();
      await this._budModel .find (this._user .getBudgetId(), this._actModel);
      await this._actModel .findCurrent();
      await this._accModel .find();
      await this._prefs    .init();

      /* presenters */
      if (this._it) {
        this._it .delete();
        this._na .delete();
        this._se .delete();
        this._ac .delete();
      }
      this._it = new ImportTransactions   (this._accModel, this._varModel);
      this._na = new Navigate             (this._accModel, this._varModel);
      this._na .prime();
      this._se = new IndexedScheduleEntry ('_CategoryMenu', '_ScheduleEntry', this._accModel, this._varModel);
      this._ac = new Accounts             (this._accModel, this._budModel);

      /* tabs */
      this._tabs .setTab  (this._proT, html => {this._na .addProgressHtml     (html)});
      this._tabs .setTab  (this._traT, html => {this._it .addHtml             (html)}, true);
      this._tabs .setTab  (this._actT, html => {this._na .addRealityHtml      (html)});
      this._tabs .setTab  (this._budT, html => {this._na .addPlanHtml         (html)});
      this._tabs. setTab  (this._plaT, html => {this._se .addHtml             (html)});
      this._tabs .setTab  (this._perT, html => {this._na .addPerspectiveHtml  (html)});
      this._tabs .setTab  (this._weaT, html => {this._na .addNetWorthHtml     (html)});
      this._tabs .setTab  (this._accT, html => {this._ac .addHtml             (html)});

      this._user .newConfigurationAccepted();

   } else if (eventType == UserEvent .LOGOUT) {
     $('body') .empty();
     (async () => {await this._user .login()}) ();
   }
  }
}

