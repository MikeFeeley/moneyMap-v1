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
    this._status = $('<div>', {class: '_systemStatus'}) .appendTo ('body');
    this._user = new User();
    this._user .addObserver (this, this._configurationChange);
    this._user .login();
  }

  _onDatabaseChange (eventType, arg) {
    let block;
    switch (eventType) {
      case DBAdaptorEvent .PENDING_UPDATES_CHANGE:
        if (arg > 0) {
          this._status .text (arg + ' update' + (arg > 1? 's': '') + ' in progress');
          if (arg == 1) {
            this._status .addClass ('_pending');
            this._status
              .delay (2000, '_systemStatus')
              .queue ('_systemStatus', next => {
                this._status .fadeIn ({duration: 1000, queue: false})
                next();
              })
              .dequeue ('_systemStatus');
          }
          if (arg == 5) {
            this._status
              .animate ({
                width:           '200px',
                height:          '40px',
                'line-height':   '40px',
                'font-size':     '18px',
                color:           'rgb(128, 128, 25)',
                backgroundColor: 'rgba(255, 255, 0, 0.4)'
              }, {duration: 100});
           }
        } else {
          this._status .clearQueue    ('_systemStatus') .fadeOut (100, () => {
            this._status .text        ('');
            this._status .removeClass ('_pending _delayed');
            this._status .css ({
              'font-size': '12px',
              height:  '30px',
              'line-height': '30px',
              width:   '150px',
              color: 'rgb(102, 128, 102)',
              'background-color': 'rgba(100, 255, 100, 0.3)'
            });
          });
        }
        break;
      case DBAdaptorEvent .STATE_CHANGE:
        if (arg == DBAdaptorState .DOWN) {
          this._status .text     ('Server Connection Lost');
          this._status .addClass ('_down');
          this._status .fadeIn   (400);
          block = $('<div>', {class: '_blockEverything'}) .appendTo ($('body'));
        } else {
          if (block) {
            block .remove();
            block = null;
            this._status .fadeOut (100, () => {
              this._status .text        ('');
              this._status .removeClass ('_down');
            })
          }
        }
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

