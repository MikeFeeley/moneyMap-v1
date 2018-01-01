class BudgetProgressHUDView extends View {
  constructor (isModal, onDelete, topBuffer=0) {
    super();
    this._monthsDatasets = [
      ['Last Year', 'priorYear', '#f4f4f4', '#d8d8d8'],
      ['Budget',    'budget',    '#eef6ee', '#acd2ac'],
      ['Actual',    'actual',    '#e9f2fb', '#93bfec'],
    ];
    this._progressGraphs = new Map();
    this._isModal        = isModal;
    this._onDelete       = onDelete;
    this._topBuffer      = topBuffer;
  }

  delete() {
    if (this._html) {
      this._html .remove();
      this._html = null;
      if (this._onDelete)
        this._onDelete();
      if (this._isModal)
        ui .ModalStack .delete (this._modalStackEntry);
    }
  }

  _onProgressGraphChange (eventType, arg) {
    if (eventType == BudgetProgressGraphEvent .GRAPH_CLICK) {
      arg .altPosition = {top: 50, left: 50};
      this._notifyObservers (BudgetProgressHUDViewEvent .GRAPH_CLICK, arg);
    }
  }

  contains (target) {
    return $.contains (this._content [0], target) || this._content [0] == target;
  }

  blur() {
    this .getHtml() .find (':input') .blur();
  }

  addHtml (toHtml, position, titlePresenter) {
    this._resetHtml (toHtml);
    this._html .appendTo (toHtml);
    this._position = position;
    if (position)
      this._html .css ({top: position .top, right: position .right, left: position .left});
    if (this._isModal)
      this._modalStackEntry = ui .ModalStack .add (
        (e) => {return ! $.contains (this._html .get (0), e .target) && this._html .get (0) != e .target},
        ()  => {this .delete()}, true
      );
  }

  addGroup (name, toGroup) {
    var toHtml = toGroup? this._content .find ('._group.' + toGroup) : this._content;
    $('<div>', {class: '_group ' + name}) .appendTo (toHtml);
  }

  emptyGroup (group) {
    this._content .find ('._group.' + group) .empty();
  }

  updateGroup (name, isVisible) {
    var group = this._content .find ('._group.' + name);
    if (isVisible)
      group .removeClass ('hidden');
    else
      group .addClass ('hidden');
  }

  addText (group, name, text='') {
    var toHtml = group != ''? this._content .find ('.' + group): this._content;
    $('<div>', {class: '_graph_title ' + name, text: text}) .appendTo (toHtml);
  }

  updateText (name, text) {
    this._content .find ('._graph_title.' + name) .text (text);
  }

  addCompareGraph (group, title) {
    if (!this._compareGraph) {
      this._compareGraph      = this._content .find ('._group.' + group);
      this._compareGraphGroup = group;
      this._compareGraphTitle = title;
    }
  }

  updateCompareGraph (data) {
    if (data && data .lastYear > 0 && data .thisYear > 0) {
      if (! this._hasCompareGraph && this._compareGraph && this._compareGraph .length) {
        this._hasCompareGraph = true;
        this .addText (this._compareGraphGroup, '_monthTitle', this._compareGraphTitle);
        let canvas = $('<canvas>', {prop: {width: 400, height: 24}, class: '_compareGraph'}) .appendTo (this._compareGraph);
        let chart  = new Chart (canvas [0] .getContext ('2d'), {
          type: 'horizontalBar',
          data: {labels: ['']},
          options: {
            animation: false,
            elements: {rectangle: {borderWidth: 1}},
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
            legend: {display: false},
            scales: {
              xAxes: [{
                display: false, ticks: {min: 0, max: 102}, gridLines: {display: false}
              }],
              yAxes: [{
                display:             false,
                gridLines:           {display: false},
                barThickness:        10
              }]
            },
            tooltips: {
              titleSpacing: 0, xPadding: 8, yPadding: 4, backgroundColor: 'rgba(0,0,0,0.6)',
              yAlign: 'middle',
              callbacks: {
                label: (t, d) => {
                  var val = d .datasets [t .datasetIndex] .values [t .index];
                  return val? d .datasets [t .datasetIndex] .label + ': ' + val: '';
                },
                title:  () => {return ''},
                footer: () => {return ''}
              }
            },
            onClick: (e) => {
              let element = chart .getElementAtEvent (e);
              if (element .length > 0) {
                if (element [0]._datasetIndex == 0) {
                  this._notifyObservers (BudgetProgressHUDViewEvent .GRAPH_CLICK, {
                    name:     'all',
                    lastYear: true,
                    html:     this._html,
                    position: {top: 50, left: 50},
                    altClick: e .webkitForce > 1 || e .altKey,
                  })
                }
                else if (element [0]._datasetIndex == 1)
                    this._notifyObservers (BudgetProgressHUDViewEvent .BODY_CLICK, {
                    html:     this._html,
                    position: {top: 50, left: 50},
                    altClick: e .webkitForce > 1 || e .altKey
                  });
                e .stopPropagation();
                return false;
              }
            }
         }
        });
        chart .data .datasets = [{
          label:                "Last Year's Activity",
          backgroundColor:      this._monthsDatasets [0][2],
          hoverBackgroundColor: this._monthsDatasets [0][2],
          borderColor:          this._monthsDatasets [0][3],
          hoverBorderColor:     this._monthsDatasets [0][3],
          values: [Types .moneyDZ .toString (data .lastYear)],
          data: [Math .round (data .lastYear * 100.0 / Math .max (data .lastYear, data .thisYear) ,0)]
        }, {
          label: "This Year's Budget",
          backgroundColor:      this._monthsDatasets [1][2],
          hoverBackgroundColor: this._monthsDatasets [1][2],
          borderColor:          this._monthsDatasets [1][3],
          hoverBorderColor:     this._monthsDatasets [1][3],
          values: [Types .moneyDZ .toString (data .thisYear)],
          data: [Math .round (data .thisYear * 100.0 / Math .max (data .lastYear, data .thisYear) ,0)]
        }]
        chart .update();
      }
    } else {
      if (this._compareGraph)
        this._compareGraph .empty();
      this._hasCompareGraph = false;
    }
  }


  addMonthsGraph (group, data) {
    if (!this._monthsGraph)
      this._monthsGraph = $('<div>') .appendTo (this._content .find ('._group.' + group));
    if (data) {
      var canvas = $('<canvas>', {prop: {width: 400, height: 100}, class: '_monthsGraph'}) .appendTo (this._monthsGraph);
      if (canvas .length) {
        this._monthsGraphAdded = true;
        var chart  = new Chart (canvas [0] .getContext ('2d'), {
          type: 'bar',
          data: {labels: data .date .map (d => {return Types .dateM .toString (d .start)})},
          options: {
            animation: false,
            legend: {display: false},
            elements: {rectangle: {borderWidth: 1, borderSkipped: 'bottom'}},
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
            onClick: (e) => {
              var element = chart .getElementAtEvent (e);
              if (element .length > 0) {
                var datasetIndex = element[0]._datasetIndex;
                var datasetSize  = element[0]._chart .config .data .datasets .length;
                if ((datasetSize == 3 && [0,2] .includes (datasetIndex)) || (datasetSize == 2 && datasetIndex == 1)) {
                  var month = Object .assign({}, data .date [element[0]._index]);
                  if (element[0]._datasetIndex == 0) {
                    month .start = Types .date .addYear (month .start, -1);
                    month .end   = Types .date .addYear (month .end,   -1);
                  }
                  this._notifyObservers (BudgetProgressHUDViewEvent .GRAPH_CLICK, {
                    name:     'months',
                    month:    month,
                    lastYear: element[0]._datasetIndex == 0,
                    html:     this._html,
                    position: {top: 50, left: 50},
                    altClick:  e .webkitForce > 1 || e .altKey,
                  })
                  e.stopPropagation();
                  return false;
               }
              }
            },
            tooltips: {
              backgroundColor: 'rgba(0,0,0,0.6)',
              callbacks: {
                label: (tooltipItem, data) => {
                  var val = data .datasets [tooltipItem .datasetIndex] .value [tooltipItem .index];
                  return val? data .datasets [tooltipItem .datasetIndex] .label + ': ' + val: '';
                }
              }
            },
            scales: {
              xAxes: [{
                gridLines: {zeroLineColor: 'rgba(0,0,0,0)'}
              }],
              yAxes: [{
                display: false, ticks: {max: 100}
              }]
            }
          }
        });
        canvas .data ({chart: chart});
      }
    }
  }

  updateMonthsGraph (data) {
    if (!this._monthsGraphAdded)
      this .addMonthsGraph (null, data);
    var canvas = this._content .find ('._monthsGraph');
    var chart = canvas .data ('chart');
    var max = Object .keys (data) .filter (f => {return ['priorYear', 'budget', 'actual'] .includes (f)}) .reduce ((m,f) => {
      return Math .max (m, data [f] .reduce ((s,v) => {return Math .max (s, Math .abs(v))}, 0));
    }, 0);
    if (chart && chart .data) {
      chart .data .datasets = this._monthsDatasets .map (d => {return {
        label:           d [0],
        value:           data [d [1]] .map (v => {return Types .moneyDC .toString (v)}),
        data:            data [d [1]] .map (v => {return Math .round (v * 98 / max)}),
        backgroundColor: d [2], hoverBackgroundColor: d [2],
        borderColor:     d [3], hoverBorderColor: d [3]
      }});
      if (chart .data .datasets [0] .data .reduce ((t,d) => {return t + d}) == 0)
        chart .data .datasets .splice (0, 1);
      chart .update();
    }
  }

  setVisible (isVisible) {
    setTimeout (() => {
      if (isVisible) {
        this._html .addClass ('fader_visible');
        ui .scrollIntoView (this._html, false, {topBuffer: this._topBuffer});
      } else
        this._html .removeClass ('fader_visible');
    }, 0);
  }

  _resetHtml (toHtml) {
    if (this._html)
      this._html .remove();
    this._html          = $('<div>', {class: '_BudgetProgressHUD fader'}) .appendTo (toHtml);
    this._content       = $('<div>', {class: '_hudContent'})              .appendTo (this._html);
    this._graphs           = undefined;
    this._progressGraphs   = new Map();
    this._monthsGraph      = null;
    this._monthsGraphAdded = false;
    this._compareGraph     = null;
    this._hasCompareGraph  = false;
  }

  removeHtml() {
    if (this._html .hasClass ('fader_visible'))
      this._html
        .removeClass ('fader_visible')
        .one ('transitionend', () => {this._html .remove(); this._html = null})
    else {
      this._html .remove();
      this._html = null;
    }
  }

  addTitle (titlePresenter) {
    let top = $('<div>', {class: '_topRow'}) .appendTo (this._content);
    titlePresenter .addHtml (top);
    let icons = $('<div>', {class: '_icons'}) .appendTo (top)
    $('<div>', {class: 'lnr-chart-bars'}) .appendTo (icons) .click (() => {
      this._notifyObservers (BudgetProgressHUDViewEvent .BODY_CLICK, {
        html:     this .getHtml(),
        position: {top: 50, left: 50},
        altClick: false
      });
    });
    $('<div>', {class: 'lnr-exit-up'}) .appendTo (icons) .click (() => {
      this._notifyObservers (BudgetProgressHUDViewEvent .BODY_CLICK, {
        html:     this .getHtml(),
        position: {top: 50, left: 50},
        altClick: true
      });
    });
  }

  addPresenter (group, presenter) {
    var toHtml = group!=''? this._content .find ('._group.' + group): this._content;
    if (toHtml .length)
      presenter .addHtml ($('<div>', {class: '_presenter'}) .appendTo (toHtml));
  }

  addProgressGraph (group, name) {
    var pg = new BudgetProgressGraph (name, $('<div>') .appendTo (this._content .find ('._group.'+name)), true, true, {barThickness: 26});
    pg .addObserver (this, this._onProgressGraphChange);
    this._progressGraphs .set (name, pg);
  }

  updateProgressGraph (name, data, isVisible=true) {
    var graph = this._progressGraphs .get (name);
    if (graph) {
      if (isVisible)
        graph .update (data);
      graph .setVisible (isVisible);
    }
  }

  updateMonthlyGraph (data) {
    var canvas = this._content .find ('._monthlyGraph');
    if (canvas .length)
      this._setMonthlyGraphData (canvas, data);
  }
}

class BudgetProgressHUDNameView extends View {
  constructor (name, setFocus) {
    super (name, [new ViewTextbox ('name', ViewFormats ('string'), '', '', 'Subcategory')]);
    this._setFocus = setFocus;
  }

  addHtml (toHtml) {
    this._html = $('<table>') .appendTo ($('<div>', {class: this._name}).appendTo (toHtml));
    var td = $('<td>') .appendTo ($('<tr>') .appendTo ($('<tbody>') .appendTo (this._html)));
    this .createFields ({name: ''}, () => {return td});
    this._html .on ('keydown', e => {
      if (e .keyCode == 8 && e .metaKey)
        return false;
    });
    this._html .on ('click', e => {e.stopPropagation(); return false})
    if (this._setFocus) {
      this._html .find ('input') .focus();
      this._setFocus = false;
    }
  }

  contains (target) {
    return $.contains (this._html [0], target) || this._html [0] == target;
  }
}

class BudgetProgressCategoryTitleView extends View {
  constructor (name, fields, parentView) {
    super (name, fields);
    this._parentView = parentView;
  }

  addHtml (name, toHtml) {
    super .addHtml (name, toHtml);
    this .getHtml() .on ('keydown', e => {
      if ([9,13,37,38,39,40] .includes (e .keyCode)) {
        if (e .keyCode == 13)
          $(e .currentTarget) .find ('._field') .data ('field') .update();
        return false;
      }
      if (e .keyCode == 8 && e .metaKey)
        return false;
    })
  }
}

var BudgetProgressHUDViewEvent = Object.create (ViewEvent, {
  GRAPH_CLICK: {value: 200},
  BODY_CLICK:  {value: 201}
});

