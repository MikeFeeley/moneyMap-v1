class BudgetProgressHUDView extends View {
  constructor (isModal, onDelete) {
    super();
    this._html          = $('<div>', {class: '_BudgetProgressHUD'});
    this._content       = $('<div>', {class: '_hudContent'}) .appendTo (this._html);
    this._monthsDatasets = [
      ['Last Year', 'priorYear', '#f4f4f4', '#d8d8d8'],
      ['Budget',    'budget',    '#eef6ee', '#acd2ac'],
      ['Actual',    'actual',    '#e9f2fb', '#93bfec'],
    ];
    this._progressGraphs = new Map();
    this._isModal        = isModal;
    this._onDelete       = onDelete;
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
    this. resetHtml();
    this._html .appendTo (toHtml);
    this._position = position;
    if (position)
      this._html .css ({top: position .top, right: position .right, left: position .left});
    if (this._isModal)
      this._modalStackEntry = ui .ModalStack .add (
        (e) => {return ! $.contains (this._html .get (0), e .target) && this._html .get (0) != e .target},
        ()  => {this .delete()}, true
      );
    this._html .on ('click webkitmouseforcedown', e => {
      this._notifyObservers (BudgetProgressHUDViewEvent .BODY_CLICK, {
        html:     this._html,
        position: ui .calcPosition ($(e .target), this._html, {top: 20, left: 0}),
        altClick: e .originalEvent .webkitForce > 1 || e .originalEvent .altKey
      });
      e .stopPropagation();
      return false;
    })
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
  
  addMonthsGraph (group, data) {
    if (!this._monthsGraph)
      this._monthsGraph = $('<div>') .appendTo (this._content .find ('._group.' + group));
    if (data) {
      var canvas = $('<canvas>', {prop: {width: 400, height: 100}, class: '_monthsGraph'}) .appendTo (this._monthsGraph);
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
                var month = data .date [element[0]._index];
                if (element[0]._datasetIndex == 0) {
                  month .start = Types .date .addYear (month .start, -1);
                  month .end   = Types .date .addYear (month .end,   -1);
                }
                this._notifyObservers (BudgetProgressHUDViewEvent .GRAPH_CLICK, {
                  name:     'months',
                  month:    month,
                  html:     canvas .parent(),
                  position: {top: canvas .position() .top + 100, left: 0},
                  altClick:   e .webkitForce > 1 || e .altKey,
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

  updateMonthsGraph (data) {
    if (!this._monthsGraphAdded)
      this .addMonthsGraph (null, data);
    var canvas = this._content .find ('._monthsGraph');
    var chart = canvas .data ('chart');
    var max = Object .keys (data) .filter (f => {return ['priorYear', 'budget', 'actual'] .includes (f)}) .reduce ((m,f) => {
      return Math .max (m, data [f] .reduce ((s,v) => {return Math .max (s, Math .abs(v))}, 0));
    }, 0);
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

  setVisible (isVisible) {
    if (isVisible) {
      this._html .removeClass ('hidden');
      ui .scrollIntoView (this._html);
    } else
      this._html .addClass ('hidden'); 
  }

  resetHtml() {
    this._content .empty();
    this._graphs           = undefined;
    this._progressGraphs   = new Map();
    this._monthsGraph      = null;
    this._monthsGraphAdded = false;
  }

  removeHtml() {
    this .resetHtml();
    this._html .remove();
  }

  addTitle (titlePresenter) {
    titlePresenter .addHtml (this._content);
  }

  addPresenter (group, presenter) {
    var toHtml = group!=''? this._content .find ('._group.' + group): this._content;
    presenter .addHtml ($('<div>', {class: '_presenter'}) .appendTo (toHtml));
  }

  addProgressGraph (group, name) {
    var pg = new BudgetProgressGraph (name, $('<div>') .appendTo (this._content .find ('._group.'+name)), true, true, {barThickness: 32});
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
    this._html .on ('click', e => {ce.stopPropagation(); return false})
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
  constructor (name, fields) {
    super (name, fields);
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
    this .getHtml() .on ('click', e => {
      if ($(e .target) .hasClass ('_content')) {
        e .stopPropagation();
        return false;
      }
    })
  }
}

var BudgetProgressHUDViewEvent = Object.create (ViewEvent, {
  GRAPH_CLICK: {value: 200},
  BODY_CLICK:  {value: 201}
});

