class RemoteDBAdaptor extends DBAdaptor {
  constructor (database) {
    super();
    this .setDatabase (database);
  }
  setDatabase (database) {
    this._database = database;
  }
  getDatabase() {
    return this._database;
  }
  *perform (operation, data) {
    data .database = this._database;
    switch (operation) {
      case DatabaseOperation .FIND:
        return yield $.ajax({
            url:  '/find', type: 'POST', contentType: 'application/json', processData: false,
            data: JSON .stringify (data)
          });
      case DatabaseOperation .UPDATE_ONE:
        return yield $.ajax({
          url:  '/update/one', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
      case DatabaseOperation .UPDATE_LIST:
        return yield $.ajax ({
          url:  '/update/list', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
      case DatabaseOperation .CHECK_UPDATE_LIST:
        return yield $.ajax ({
          url:  '/update/checkList', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
      case DatabaseOperation .INSERT_ONE:
        return yield $.ajax({
          url:  '/insert/one', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
      case DatabaseOperation .INSERT_LIST:
        return yield $.ajax({
          url:  '/insert/list', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
      case DatabaseOperation .REMOVE_ONE:
        return yield $.ajax ({
          url:  '/remove/one', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
      case DatabaseOperation .REMOVE_LIST:
        return yield $.ajax ({
          url:  '/remove/list', type: 'POST', contentType: 'application/json', processData: false,
          data: JSON .stringify (data)
        });
    }
 }
}
