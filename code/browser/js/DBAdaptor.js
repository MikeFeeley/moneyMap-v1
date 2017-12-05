class DBAdaptor extends Observable {

  constructor() {
    super();
    this._state             = DBAdaptorState .UP;
    this._pendingOperations = 0;
  }

  async perform (operation, data) {}

  _setState (state) {
    this._state = state;
    this._notifyObservers (DBAdaptorEvent .STATE_CHANGE, this._state);
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
  UP:   1,
  DOWN: 2
}

DBAdaptorEvent = {
  STATE_CHANGE: 1,
  PENDING_UPDATES_CHANGE: 2
}