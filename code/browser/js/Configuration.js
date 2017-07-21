class Configuration extends Observable {
  login() {
    this._notifyObservers (LoginSignupEvent .STATE_CHANGE)
  }
  getUserId() {
    return 'production';
  }
  getConfigId() {
    return 'production';
  }
  logout() {

  }
}

LoginSignupEvent = {
  STATE_CHANGE = 0
}
