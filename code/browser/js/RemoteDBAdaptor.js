class RemoteDBAdaptor extends DBAdaptor {
  constructor() {
    super();
    this._urls = [];
    this._urls [DatabaseOperation .FIND]              = '/find/get';
    this._urls [DatabaseOperation .HAS]               = '/find/has';
    this._urls [DatabaseOperation .UPDATE_ONE]        = '/update/one';
    this._urls [DatabaseOperation .UPDATE_LIST]       = '/update/list';
    this._urls [DatabaseOperation .INSERT_ONE]        = '/insert/one';
    this._urls [DatabaseOperation .INSERT_LIST]       = '/insert/list';
    this._urls [DatabaseOperation .REMOVE_ONE]        = '/remove/one';
    this._urls [DatabaseOperation .REMOVE_LIST]       = '/remove/list';
    this._urls [DatabaseOperation .LOGIN]             = '/admin/login';
    this._urls [DatabaseOperation .SIGNUP]            = '/admin/signup';
    this._urls [DatabaseOperation .UPDATE_USER]       = '/admin/updateUser';
    this._urls [DatabaseOperation .COPY_DATABASE]     = '/admin/copyDatabase';
  }
  async perform (operation, data) {
    return await $.ajax ({
      url:  this._urls [operation], type: 'POST', contentType: 'application/json', processData: false,
      data: JSON .stringify (data)
    });
 }
}
