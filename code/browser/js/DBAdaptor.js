class DBAdaptor extends Observable {

  constructor() {
    super();
    this._state             = DBAdaptorState .UP;
    this._pendingOperations = 0;
    this._sessionId         = Math.floor (Math.random() * 10000000000000000);
    // Eager disconnect for more rapid change from sharing to non-sharing state at remote browser
    // The state would change with the disconnect, but only after the timeout
    // XXX This event does not fire consistently on Safari, particularly on page reload; no idea why
    window .addEventListener ('beforeunload', e => {this .disconnect()});
  }

  async perform (operation, data) {
    data .sessionId = this._sessionId;
  }

  _setState (state) {
    if (this._state != DBAdaptorState .PERMANENTLY_DOWN) {
      this._state = state;
      this._notifyObservers (DBAdaptorEvent .STATE_CHANGE, this._state);
    }
  }

  _getState() {
    return this._state;
  }

  _updatePendingOperations (operation, count) {
    this._pendingOperations += count;
    this._notifyObservers (DBAdaptorEvent .PENDING_UPDATES_CHANGE, this._pendingOperations);
  }

  _processPayload (data) {
    data .sessionId = this._sessionId;
    return data;
  }

  _processUpcall (data) {
    let sharing, upcalls = [];
    for (let u of data .upcalls)
      if (u .sharing !== undefined)
        sharing = u .sharing;
      else
        upcalls .push (u);
    data .upcalls = upcalls;
    if (sharing !== undefined)
      this._notifyObservers (DBAdaptorEvent .SHARING_CHANGE, sharing);
    if (data .upcalls .length)
      this._notifyObservers (DBAdaptorEvent .UPCALL, data);
  }

  connect() {}

  async disconnect() {}
}

var DatabaseOperation = {
  FIND:                 0,
  HAS:                  1,
  UPDATE_ONE:           2,
  UPDATE_LIST:          3,
  INSERT_ONE:           4,
  INSERT_LIST:          5,
  REMOVE_ONE:           6,
  REMOVE_LIST:          7,
  LOGIN:                8,
  SIGNUP:               9,
  UPDATE_USER:          10,
  COPY_DATABASE:        11,
  COPY_BUDGET:          12,
  REMOVE_BUDGET:        13,
  REMOVE_CONFIGURATION: 14
}

DBAdaptorState = {
  UP:               1,
  DOWN:             2,
  PERMANENTLY_DOWN: 3
}

DBAdaptorEvent = {
  STATE_CHANGE: 1,
  PENDING_UPDATES_CHANGE: 2,
  SHARING_CHANGE: 3,
  UPCALL: 4
}