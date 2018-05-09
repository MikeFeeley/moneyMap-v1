class RemoteDBAdaptor extends DBAdaptor {

  constructor() {
    super();
    this._urls = [];
    this._urls [DatabaseOperation .FIND]          = '/find/get';
    this._urls [DatabaseOperation .HAS]           = '/find/has';
    this._urls [DatabaseOperation .UPDATE_ONE]    = '/update/one';
    this._urls [DatabaseOperation .UPDATE_LIST]   = '/update/list';
    this._urls [DatabaseOperation .INSERT_ONE]    = '/insert/one';
    this._urls [DatabaseOperation .INSERT_LIST]   = '/insert/list';
    this._urls [DatabaseOperation .REMOVE_ONE]    = '/remove/one';
    this._urls [DatabaseOperation .REMOVE_LIST]   = '/remove/list';
    this._urls [DatabaseOperation .LOGIN]         = '/admin/login';
    this._urls [DatabaseOperation .SIGNUP]        = '/admin/signup';
    this._urls [DatabaseOperation .UPDATE_USER]   = '/admin/updateUser';
    this._urls [DatabaseOperation .COPY_DATABASE] = '/admin/copyDatabase';
    this._urls [DatabaseOperation .COPY_BUDGET]   = '/admin/copyBudget';
    this._urls [DatabaseOperation .REMOVE_BUDGET] = '/admin/removeBudget';
  }

  async perform (operation, data) {
    this._updatePendingOperations (operation, 1);
    await super .perform (operation, data);
    let response, firstTry = true;
    data = await _Crypto .encryptRequestData (data);
    while (response === undefined) {
      try {
        response = await $.ajax ({
          url:  this._urls [operation], type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
        this._updatePendingOperations (operation, -1);
        await _Crypto .decryptResponseData (response);
      } catch (rejection) {
        if (rejection .status !== undefined && rejection .status == 0) {
          if (firstTry)
            firstTry = false;
          else {
            this._setState (DBAdaptorState .DOWN);
            await (new Promise (resolve => setTimeout (resolve, CLIENT_RETRY_INTERVAL)));
          }
        } else {
          this._setState (DBAdaptorState .PERMANENTLY_DOWN);
          response = null;
        }
      }
    }
    return response;
  }

  _connect (database) {
    let active = () => {return ! this._disconnected && database == _default_database_id};
    if (active()) {
      let timeoutId = setTimeout (() => {
        if (! this._getState() == DBAdaptorState .PERMANENTLY_DOWN && active())
          this._setState (DBAdaptorState .DOWN);
      }, CLIENT_KEEP_ALIVE_INTERVAL);
      if (! RemoteDBAdaptor_serverDisconnectTimeoutId)
        RemoteDBAdaptor_serverDisconnectTimeoutId = setTimeout (() => {
          if (active())
            this._setState (DBAdaptorState .PERMANENTLY_DOWN);
        }, SERVER_DISCONNECT_THRESHOLD)
      $.ajax ({url: '/upcall', type: 'POST', contentType: 'application/json', processData: false,
        data: JSON .stringify (this._processPayload({
          database:           _default_database_id,
          respondImmediately: this._getState() == DBAdaptorState .DOWN
        })),
        success: data => {
          if (active()) {
            this._setState (DBAdaptorState .UP);
            clearTimeout (timeoutId);
            if (RemoteDBAdaptor_serverDisconnectTimeoutId) {
              clearTimeout (RemoteDBAdaptor_serverDisconnectTimeoutId);
              RemoteDBAdaptor_serverDisconnectTimeoutId = null;
            }
            setTimeout (() => {this._connect (database)}, 0);
            if (data .upcalls) {
              (async () => {
                await _Crypto .decryptUpcalls (data);
                this._processUpcall (data);
              })();
            }
          }
        },
        error: data => {
          if (active()) {
            if (this._getState() != DBAdaptorState .PERMANENTLY_DOWN)
              this._setState (DBAdaptorState .DOWN);
            clearTimeout (timeoutId);
            setTimeout (() => {this._connect (database)}, CLIENT_RETRY_INTERVAL);
          }
        }
      })
    }
  }

  connect() {
    this._disconnected = false;
    this._setState (DBAdaptorState .UP);
    this._connect (_default_database_id);
  }

  async disconnect() {
    if (_default_database_id) {
      try {
        this._disconnected = true;
        await $.ajax ({url:'/upcall', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (this._processPayload ({
            database:   _default_database_id,
            disconnect: true
          }))
        });
      } catch (e) {
        console.log('disconnect error: ', e)
      }
    }
  }
}

var RemoteDBAdaptor_serverDisconnectTimeoutId;