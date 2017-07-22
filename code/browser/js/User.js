class User extends Observable {

  login() {
    this._notifyObservers (LoginSignupEvent .STATE_CHANGE)
  }

  logout() {

  }

  getUserId() {
    return 'production';
  }

  getId() {
    return 'production';
  }
}

LoginSignupEvent = {
  STATE_CHANGE = 0
}
