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
    await super .perform (operation, data);
    let response;
    try {
      this._updatePendingOperations (operation, 1);
      response = await $.ajax ({
        url:  this._urls [operation], type: 'POST', contentType: 'application/json', processData: false,
        data: JSON .stringify (data)
      });
      this._updatePendingOperations (operation, -1);
    } catch (rejection) {
      response = null;
      this._updatePendingOperations (operation, -1);
      if (this._isUpdateOperation (operation))
        this._setState (DBAdaptorState .PERMANENTLY_DOWN);
    }
    return response;
  }

  connect() {
    if (this._getState() != DBAdaptorState .PERMANENTLY_DOWN) {
      let timeoutId = setTimeout (() => {
        this._setState (DBAdaptorState .DOWN);
      }, CLIENT_KEEP_ALIVE_INTERVAL)
      $.ajax ({url: '/upcall', type: 'POST', contentType: 'application/json', processData: false,
        data: JSON .stringify (this._processPayload({respondImmediately: this._getState() == DBAdaptorState .DOWN})),
        success: data => {
          this._setState (DBAdaptorState .UP);
          clearTimeout (timeoutId);
          setTimeout (() => {this .connect()}, 0);
        },
        error: () => {
          this._setState (DBAdaptorState .DOWN);
          clearTimeout (timeoutId);
          setTimeout (() => {this .connect()}, CLIENT_RETRY_INTERVAL);
        }
      })
    }
  }
}
