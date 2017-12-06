class DBAdaptor extends Observable {

  constructor() {
    super();
    this._state             = DBAdaptorState .UP;
    this._pendingOperations = 0;
    this._sessionId         = Math.floor (Math.random() * 10000000000000000);
  }

  async perform (operation, data) {
    data .sessionId = this._sessionId;
  }

  _setState (state) {
    if (this._stated != DBAdaptorState .PERMANENTLY_DOWN) {
      this._state = state;
      this._notifyObservers (DBAdaptorEvent .STATE_CHANGE, this._state);
    }
  }

  _getState() {
    return this._state;
  }

  _updatePendingOperations (operation, count) {
    if (this._isUpdateOperation (operation)) {
      this._pendingOperations += count;
      this._notifyObservers (DBAdaptorEvent .PENDING_UPDATES_CHANGE, this._pendingOperations);
    }
  }

  _isUpdateOperation (operation) {
    return ! [DatabaseOperation .FIND, DatabaseOperation .HAS] .includes (operation);
  }

  _processPayload (data) {
    data .sessionId = this._sessionId;
    return data;
  }

  connect() {}
}

var DatabaseOperation = {
  FIND:              0,
  HAS:               1,
  UPDATE_ONE:        2,
  UPDATE_LIST:       3,
  INSERT_ONE:        4,
  INSERT_LIST:       5,
  REMOVE_ONE:        6,
  REMOVE_LIST:       7,
  LOGIN:             8,
  SIGNUP:            9,
  UPDATE_USER:       10,
  COPY_DATABASE:     11,
}

DBAdaptorState = {
  UP:               1,
  DOWN:             2,
  PERMANENTLY_DOWN: 3
}

DBAdaptorEvent = {
  STATE_CHANGE: 1,
  PENDING_UPDATES_CHANGE: 2
}