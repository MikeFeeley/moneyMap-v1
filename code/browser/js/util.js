'use strict';

class Observable {
  addObserver (thisArg, observer) {
    var o = {thisArg: thisArg, observer: observer};
    (this._observers = this._observers || new Set()) .add (o);
    return o;
  }
  deleteObserver (o) {
    if (this._observers)
      this._observers .delete (o);
  }
  deleteObservers() {
    this._observers = undefined;
  }
  _notifyObservers() {
    for (let o of this._observers || []) {
      o .observer .apply (o .thisArg, arguments);
    }
  }
  *_notifyObserversGenerator() {
    for (let o of this._observers || []) {
      yield* o .observer .apply (o .thisArg, arguments);
    }
  }
}

class FieldType {
  constructor (format) {
    this._format = format;
  }
  toString      (v) {}
  fromString    (s) {}
}

class IntervalEndDateType extends FieldType {
  constructor (format) {
    super (format);
    this._dateType = new DateType (format);
  }
  toString (v) {
    return ['...', ''] .includes (v)? v: this._dateType .toString (v);
  }
  fromString (s, c) {
    return ['...', ''] .includes (s)? s: this._dateType .fromString (s, c);
  }
  isInfinity (d) {
    return d == '...';
  }
}

class FiscalYearDateType extends FieldType {
  constructor (format) {
    super (format);
    this._dateType = new DateType (format);
  }
  _fiscalYear (d, bs, be) {
    var y  = this._dateType._year  (d);
    var m  = this._dateType._month (d);
    var ms = this._dateType._month (bs);
    return y - (m < ms? 1: 0);
  }

  toString (v, bs, be) {
    var y = this._fiscalYear (v, bs, be);
    var s = String (this._dateType._year (this._dateType ._yearStart (y, bs)));
    var e = String (this._dateType._year (this._dateType ._yearEnd   (y, bs, be)));
    if (s == e)
      return s;
    else {
      var i=0;
      while (i < Math .min (s .length, e .length) && s [i] == e [i])
        i++;
      return s + '/' + e .slice (i);
    }
  }
  getFYStart (d, bs, be) {
    return this._dateType ._yearStart (this._fiscalYear (d, bs, be), bs, be)
  }
  getFYEnd (d, bs, be) {
    return this._dateType ._yearEnd (this._fiscalYear (d, bs, be), bs, be)
  }
}

class DateType extends FieldType {
  constructor (format) {
    super (format);
    this._months    = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
    this._monthsLC  = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december']
    this._mths      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    this._mthsLC    = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    this._monthDays = [31,28,31,30,31,30,31,31,31,31,30,31];
    this._today     = (d => {return this._date (d .getFullYear(), d .getMonth() + 1, d .getDate())}) (new Date());
  }
  _isLeapYear (y) {
    return (y % 4 == 0) && (y % 100 != 0 || y % 400 == 0);
  }
  _daysInMonth (y, m) {
    return this._monthDays [m-1] + ((m==2 && this._isLeapYear(y))? 1: 0);
  }
  _year (d) {
    return this .isYear(d)? d: Math.floor ((d / 10000));
  }
  _month (d) {
    return Math.floor ((d / 100 % 100));
  }
  _yearMonth (d) {
    return Math.floor (d / 100);
  }
  _fromYearMonth (ym) {
    return ym * 100 + 1;
  }
  _day (d) {
    return d % 100;
  }
  _date (y,m,d) {
    return y * 10000 + m * 100 + Number (d);
  }
  _yearStart (y, stY) {
    var m = this._month (stY);
    var d = this._day   (stY);
    return this._date (y, m, d);
  }
  _yearEnd (y, stY, enY) {
    return this._date (y + (this._year (enY) - this._year (stY)), this._month (enY), this._day (enY));
  }
  _yearForDate (d, stY) {
    var dm = this._month (d);
    var dy = this._year  (d);
    var sm = this._month (stY);
    return dm >= sm? dy: dy - 1;
  }
  daysInMonth (d) {
    return this._daysInMonth (this._year (d), this._month (d));
  }
  toString (v) {
    switch (this._format) {
      case 'DM':
        return v? this._day (v) + '-' + this._mths [this._month (v) - 1] : '';
      case 'DMY':
        return v? this._day (v) + '-' + this._mths [this._month (v) - 1] + '-' + this._year (v) : '';
      case 'M':
        return v? this._mths [this._month (v) - 1]: '';
      case 'MY':
        return v? this._mths [this._month (v) - 1] + '-' + (this._year (v) - 2000): '';
      case 'MYorYear':
        return v? (v < 9999? v: this._mths [this._month (v) - 1] + '-' + (this._year (v) - 2000)): ''
      case 'MonthY':
        return v? this._months [this._month (v) - 1] + ' ' + this._year (v): '';
      case 'Long':
        return v? this._months [this._month (v) - 1] + ' ' + this._day (v) + ', ' + this._year (v): '';
    }
  }
  fromString (s, context) {
    s = s .trim() .toLowerCase();
    if (s == '')
      return this._format == 'MYorYear'? '': undefined;
    switch (this._format) {
      case 'DMY':
      case 'DM':
        var dt = s .split (/[- ]/) .map (s => {return s.trim()});
        if (dt.length < 2 || dt.length > 3)
          return undefined;
        var ms = dt.find (t => {return isNaN (t)});
        var ds = dt.find (t => {return !isNaN (t) && t.length <= 2});
        var ys = dt.find (t => {return !isNaN (t) && t.length == 4});
        var m = this._mthsLC .indexOf (ms .slice (0, 3)) + 1;
        if (m == 0)
          return undefined;
        if (ys)
          var y = Number (ys)
        else {
          var y = context && context (m)
          if (!y)
            return undefined;
        }
        var d = Number (ds);
        if (!ds || isNaN (d) || d < 1 || d > this._daysInMonth (y, m))
          return undefined;
        return this._date (y, m, d);
      case 'MY':
      case 'MYorYear':
        var sy = this._year  (context);
        if (s .indexOf ('-') == -1 && s.length >= 4 && this._mthsLC .indexOf (s .slice (0, 3)) != -1 && this._monthsLC .indexOf (s) == -1)
          s = s .slice (0,3) + '-' + s.slice (3);
        var dt = s .split (/[- ]/);
        if (dt.length==1) {
          if (this._format == 'MYorYear') {
            if (isNaN (s) && (s == 'y' || s == 'yr' || s == 'year' || s == 'a') && sy) {
              return this._year (context);
            } else if (! isNaN (s)) {
              var y = Number (s);
              if (y > 0 && y < 100)
                y += 2000;
              return ! sy || y >= sy? y: undefined;
            }
          }
          var m = this._mthsLC .indexOf (s .slice (0,3)) + 1;
          if (m != 0 && sy) {
            var sm = this._month (context);
            return this._date (m >= sm? sy: sy + 1, m , 1)
          } else
            return undefined;
        }
        var ms = dt [0];
        var ys = dt [1];
        var m  = this._mthsLC .indexOf (ms .slice (0, 3)) + 1;
        if (m == 0)
          return undefined;
        var y = Number (ys);
        if (isNaN (y) || y<0 || y>2099 || (y>=100 && y <2000))
          return undefined;
        if (y < 100)
          y += 2000;
        if (sy && y < sy)
          return undefined;
        return this._date (y, m, 1);
      case 'MDY':
        var dt = s .split (/[- \/]/) .map (s => {return s.trim()});
        return this._date (dt [2], dt [0], dt [1]);
    }
  }
  isYear (d) {
    return !this .isBlank(d) && d <= 9999;
  }
  isBlank (d) {
    return !d || d == '' || d == 0;
  }
  isMonth (d) {
    return d != '' && d > 9999;
  }

  /**
   * Determine whether date is in range of a budget schedule
   *  st0, en0, rp, lm: budget schedule range description
   *  st1, en1:         date range to test against schedule
   *  stY, enY:         current fiscal year start and end
   */
  inRange (st0, en0, rp, lm, st1, en1, stY, enY) {
    if (this .isBlank (st0))
      return 0;
    switch (this._format) {
      case 'MYorYear':
        if (this .isYear (st0)) {
          var isYear = true;
          var yr0    = st0;
          st0        = this._yearStart   (yr0, stY);
          en0        = this._yearEnd     (yr0, stY, enY);
          var yr1    = this._yearForDate (st1, stY);
          st1        = this._yearStart   (yr1, stY);
          en1        = this._yearEnd     (yr1, stY, enY);
        }
      case 'MY':
        st0 = this ._yearMonth (st0);
        st1 = this ._yearMonth (st1);
        rp  = rp && ! this .isInfinity (en0);
        en0 = (!en0 || en0 == '')? st0: (this .isInfinity (en0)? 999999: this ._yearMonth (en0));
        en1 = (!en1 || en1 == '')? st1: (this .isInfinity (en1)? 999999: this ._yearMonth (en1));
        var cnt = 0;
        for (let yr = 0; yr <= (rp? lm || 9999: 0); yr++) {
          var st = st0 + yr * 100;
          var en = en0 + yr * 100;
          if (st <= en1) {
            var str = Math .max (st, st1);
            var enr = Math .min (en, en1);
            var mor = Math .max (0, this._difMonths (this._fromYearMonth (enr), this._fromYearMonth (str)));
            cnt += isYear? (mor? 1: 0): mor;
          } else
            break;
        }
        return cnt;
      default:
        return undefined;
    }
  }
  _difMonths (ym0, ym1) {
    return this._month (ym0) - this._month (ym1) + (this._year  (ym0) - this._year  (ym1)) * 12 + 1;
  }
  monthStart (d) {
    return this._date (this._year (d), this._month (d), 1);
  }
  monthEnd (d) {
    var y = this._year  (d);
    var m = this._month (d);
    return this._date   (y, m, this._daysInMonth (y,m));
  }
  addMonthStart (d, m) {
    var mt = this._month (d) + m - 1;
    return this._date (this._year  (d) + Math .floor (mt / 12), ((mt % 12) + 12) % 12 + 1, 1)
  }
  addYear (d,y) {
    return this._date (this._year (d) + Number (y), this._month (d), this._day (d));
  }
  today() {
    return this._today;
  }
  isInfinity (d) {
    return d == '...';
  }
  subDays (a, b) {
    var ad = new Date (this._year (a), this._month (a), this._day (a));
    var bd = new Date (this._year (b), this._month (b), this._day (b));
    return Math .floor ((ad - bd) / (1000 * 60 * 60 * 24));
  }
}

class TimeType extends DateType {
  constructor (format) {
    var f = format .split ('_');
    super (f [0]);
    this._timeFormat = f [1];
  }
  toString (t) {
    if (!t)
      return '';
    var dt = new Date (t);
    var yr = dt .getFullYear();
    var mo = dt .getMonth() + 1;
    var dy = dt .getDate();
    var hr = dt .getHours();
    var mn = dt .getMinutes();
    var sc = dt .getSeconds();
    switch (this._timeFormat) {
      case 'HM':
        var ts = (hr > 12? hr-12: hr) + ':' + (mn < 10? '0': '') + mn + ' ' + (hr < 12? 'AM': 'PM');
        break;
    }
    return super .toString (this._date (yr, mo, dy)) + (ts? ' at ' + ts: '');
  }
}

class NumberType extends FieldType {
  constructor (format, digits, showZero, isPercent, inThousands) {
    super (new Intl.NumberFormat ("en-US", format));
    this._digits      = digits;
    this._showZero    = showZero;
    this._isPercent   = isPercent;
    this._inThousands = inThousands;
  }
  _eval (s) {
    if (s .includes ('*'))
      return s .split ('*') .reduce ((a,t) => {return a * this._eval (t)}, 1);
    else if (s .includes ('/')) {
      var ts = s .split ('/');
      return ts .slice (1) .reduce ((a,t) => {return a / this._eval (t)}, this._eval (ts [0]));
    } else if (s .includes ('+'))
      return s .split ('+') .reduce ((a,t) => {return a + this._eval (t)}, 0);
    else if (s .includes ('-')) {
      var ts = s.split ('-');
      return ts .slice (1) .reduce ((a,t) => {return a - this._eval (t)}, this._eval (ts [0]));
    } else if (s .endsWith ('%'))
      return Number (s .slice (0, -1)) / 100.0;
    else
      return Number (s);
  }
  toString (v) {
    if (this._isPercent)
      v = v * 100;
    if (this._inThousands)
      v = v / 1000;
    return v != null? (v || this._showZero? this._format .format (v * Math .pow (10, -this._digits))
      + (this._isPercent? '%': '') + (this._inThousands? 'K': ''): ''): '';
  }
  fromString (s) {
    s = s .trim() .replace (/[$,]*/g, '');
    if (this._isPercent)
      s = s .replace (/%/g, '');
    if (s .includes ('m'))
      var n = Number (s.replace (/[/m*]*/g,'')) * 12; // XXX What is this for?
    else
      var n = this._eval (s);
    return isNaN (n)? undefined: Math .round (n * Math .pow (10, this._digits) * (this._isPercent? 1/100: 1));
  }
}

class BooleanType extends FieldType {
  toString (b) {
    return b;
  }
  fromString (s) {
    return s;
  }
}

class StringType extends FieldType {
  toString (v) {
    return v;
  }
  fromString (s) {
    return s;
  }
}

var AccountType = {
  DEPOSIT:     0,
  CREDIT_CARD: 1,
  CASH:        2,
  PENSION:     3,
  RRSP:        4,
  TFSA:        5,
  RESP:        6,
  INVESTMENT:  7,
  MORTGAGE:    8,
  HOME:        9
}

var Types = {
  date:         new DateType   (''),
  dateDM:       new DateType   ('DM'),
  dateDMY:      new DateType   ('DMY'),
  dateMY:       new DateType   ('MY'),
  dateMYorYear: new DateType   ('MYorYear'),
  dateM:        new DateType   ('M'),
  dateMonthY:   new DateType   ('MonthY'),
  dateLong:     new DateType   ('Long'),
  dateMDY:      new DateType   ('MDY'),
  dateFY:       new FiscalYearDateType  ('FY'),
  dateEndMY:    new IntervalEndDateType ('MY'),
  timeLongHM:   new TimeType   ('Long_HM'),
  timeShort:    new TimeType   ('DM'),
  timeShortHM:  new TimeType   ('DM_HM'),
  moneyDC:      new NumberType ({style:'currency', currency:'USD', minimumFractionDigits:2}, 2),
  moneyDCZ:     new NumberType ({style:'currency', currency:'USD', minimumFractionDigits:2}, 2, true),
  moneyD:       new NumberType ({style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:0}, 2),
  moneyDZ:      new NumberType ({style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:0}, 2, true),
  moneyK:       new NumberType ({style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:0}, 2, false, false, true),
  number:       new NumberType ({style:'decimal', minimumFractionDigits:0}, 0),
  numberNG:     new NumberType ({style:'decimal', minimumFractionDigits:0, useGrouping: false}, 0),
  percent:      new NumberType ({style:'decimal', minNumFractionDigits: 1, maximumFractionDigits:1}, 0, false, true),
  percent2:     new NumberType ({style:'decimal', minNumFractionDigits: 0, maximumFractionDigits:2}, 4, false, true),
  string:       new StringType (),
  boolean:      new BooleanType ()
}

// For node.js include
if (typeof exports !== 'undefined') {
  exports .Types       = Types;
  exports .AccountType = AccountType;
}
