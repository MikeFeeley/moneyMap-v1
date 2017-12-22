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
  }

  async perform (operation, data) {
    this._updatePendingOperations (operation, 1);
    await super .perform (operation, data);
    let response, firstTry = true;
    while (response === undefined) {
      try {
        response = await $.ajax ({
          url:  this._urls [operation], type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
        this._updatePendingOperations (operation, -1);
      } catch (rejection) {
        if (rejection .status !== undefined && rejection .status == 0) {
          this._setState (DBAdaptorState .DOWN);
          if (!firstTry)
            await (new Promise (resolve => setTimeout (resolve, CLIENT_RETRY_INTERVAL)));
          firstTry = false;
        } else {
          this._setState (DBAdaptorState .PERMANENTLY_DOWN);
          response = null;
        }
      }
    }
    return response;
  }

  connect() {
    let timeoutId = setTimeout (() => {
      if (! this._getState() == DBAdaptorState .PERMANENTLY_DOWN)
        this._setState (DBAdaptorState .DOWN);
    }, CLIENT_KEEP_ALIVE_INTERVAL);
    if (! RemoteDBAdaptor_serverDisconnectTimeoutId)
      RemoteDBAdaptor_serverDisconnectTimeoutId = setTimeout (() => {
      this._setState (DBAdaptorState .PERMANENTLY_DOWN);
    }, SERVER_DISCONNECT_THRESHOLD)
    $.ajax ({url: '/upcall', type: 'POST', contentType: 'application/json', processData: false,
      data: JSON .stringify (this._processPayload({
        database:           _default_database_id,
        respondImmediately: this._getState() == DBAdaptorState .DOWN
      })),
      success: data => {
        this._setState (DBAdaptorState .UP);
        clearTimeout (timeoutId);
        if (RemoteDBAdaptor_serverDisconnectTimeoutId) {
          clearTimeout (RemoteDBAdaptor_serverDisconnectTimeoutId);
          RemoteDBAdaptor_serverDisconnectTimeoutId = null;
        }
        setTimeout (() => {this .connect()}, 0);
        if (data .upcalls)
          this._processUpcall (data);
      },
      error: data => {
        if (this._getState() != DBAdaptorState .PERMANENTLY_DOWN)
          this._setState (DBAdaptorState .DOWN);
        clearTimeout (timeoutId);
        setTimeout (() => {this .connect()}, CLIENT_RETRY_INTERVAL);
      }
    })
  }

  disconnect() {
    if (_default_database_id) {
      $.ajax ({url:'/upcall', type: 'POST', contentType: 'application/json', processData: false,
        data: JSON .stringify (this._processPayload ({
          database:   _default_database_id,
          disconnect: true
        }))
      })
    }
  }
}

var RemoteDBAdaptor_serverDisconnectTimeoutId;