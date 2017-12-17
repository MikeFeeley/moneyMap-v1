Chart.pluginService.register({
  beforeDraw: function (chart, easing) {
    if (chart.config.options.chartArea && chart.config.options.chartArea.backgroundColor) {
      var helpers = Chart.helpers;
      var ctx = chart.chart.ctx;
      var chartArea = chart.chartArea;

      ctx.save();
      ctx.fillStyle = chart.config.options.chartArea.backgroundColor;
      ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
      ctx.restore();
    }
  }
});

var BudgetProgressGraph_CANVAS_HEIGHT = 40;

class BudgetProgressGraph extends Observable {
  constructor (name, content, showPercentComplete, graphAsPercentage, options = {}) {
    super();
    this._name                = name;
    this._content             = content;
    this._showPercentComplete = showPercentComplete;
    this._graphAsPercentage   = graphAsPercentage;
    this._barThickness        = options .barThickness;
    this._barPercentage       = options .barPercentage || 1;
    this._labelWidth          = options .labelWidth;
    var lightGreyRed    = '#fffafa';
    var greyRed         = '#e0d1d1';
    var lightRed        = '#ffeeee';
    var red             = '#ff9999';
    var darkRed         = '#ff7777';
    var lightGreen      = '#eeffee';
    var medLitGreen     = '#ccffcc';
    var medGreen        = '#bbffbb';
    var green           = '#88ff88';
    var darkGreen       = '#66dd66';
    var grey            = '#dddddd';
    var clear           = '#fcfcfc';
    var greyGreen       = '#b9d0b9';
    var darkGreyGreen   = '#a3c2a3';
    var lightGreyGreen  = '#d1e0d1';
    var blue            = '#4db8ff';
    var lightBlue       = '#e6f5ff';
    this._constraintDatasets  = [
      ['From Last Month',           'preBudgetedActual',   darkGreen,  darkGreen],
      ['This Month in Budget',      'curBudgetedActual',   green,      green],
      ['This Transaction (Credit)', 'thisCreditBudgeted',  lightGreen, green],
      ['Over in Prior Months',      'preOverActual',       darkRed,    darkRed],
      ['Over Budget',               'curOverActual',       red,        red],
      ['This Transaction (Credit)', 'thisCreditOver',      lightRed,   red],
      ['This Transaction',          'thisBudgeted',        lightGreen, green],
      ['This Transaction',          'thisOver',            lightRed,   red],
      ['This Transaction (Credit)', 'thisCreditAvailable', clear,      grey],
      ['Available',                 'available',           clear,      grey],
      ['Actual this Month',         'budgetlessActual',    blue,       blue]
    ];
    this._budgetlessDatasets  = [
      ['From Last Month',           'preBudgetedActual',   darkGreen,  darkGreen],
      ['This Month in Budget',      'curBudgetedActual',   green,      green],
      ['This Transaction (Credit)', 'thisCreditBudgeted',  lightBlue,  blue],
      ['Over in Prior Months',      'preOverActual',       darkRed,    darkRed],
      ['Over Budget',               'curOverActual',       red,        red],
      ['This Transaction (Credit)', 'thisCreditOver',      lightBlue,  blue],
      ['This Transaction',          'thisBudgeted',        lightBlue,  blue],
      ['This Transaction',          'thisOver',            lightBlue,  blue],
      ['This Transaction (Credit)', 'thisCreditAvailable', clear,      grey],
      ['Available',                 'available',           clear,      grey],
      ['Actual this Month',         'budgetlessActual',    blue,       blue]
    ];
    this._constraintYearDatasets  = [
      ['Prior Months',              'preBudgetedActual',   darkGreen,  darkGreen],
      ['This Month in Budget',      'curBudgetedActual',   green,      green],
      ['This Transaction (Credit)', 'thisCreditBudgeted',  lightGreen, green],
      ['Over in Prior Months',      'preOverActual',       darkRed,    darkRed],
      ['Over Budget',               'curOverActual',       red,        red],
      ['This Transaction (Credit)', 'thisCreditOver',      lightRed,   red],
      ['This Transaction',          'thisBudgeted',        lightGreen, green],
      ['This Transaction',          'thisOver',            lightRed,   red],
      ['This Transaction (Credit)', 'thisCreditAvailable', clear,      grey],
      ['Available',                 'available',           clear,      grey],
      ['Actual this Month',         'budgetlessActual',    blue,       blue]
    ];
    this._goalDatasets  = [
      ['Prior Months',              'preBudgetedActual',   darkGreen,       darkGreen],
      ['This Month within Budget',  'curBudgetedActual',   green,           green],
      ['This Transaction (Credit)', 'thisCreditBudgeted',  lightGreyRed,    greyRed],
      ['Over in Prior Months',      'preOverActual',       medGreen,        medGreen],
      ['Over Budget',               'curOverActual',       medLitGreen,     medLitGreen],
      ['This Transaction (Credit)', 'thisCreditOver',      lightGreyRed,    greyRed],
      ['This Transaction',          'thisBudgeted',        lightGreen,      green],
      ['This Transaction',          'thisOver',            lightGreen,      green],
      ['This Transaction (Credit)', 'thisCreditAvailable', lightGreyRed,    greyRed],
      ['Under Budget Prior Months', 'prevAvailable',       red,             red],
      ['Under Budget this Month',   'curAvailable',        lightGreyRed,    greyRed],
      ['Actual this Month',         'budgetlessActual',    blue,            blue]
    ];
  }

  _setData() {
    var dt    = this._data [0];
    this._chart .data .labels   = this._data .map (d => {return d .name || ''});
    this._chart .data .datasets = this._schema
      .map (schema => {
        return this._data .find (d => {return schema [1] in d .amounts}) && {
          label:           schema [0],
          values:          this._data .map (d => {return Types .moneyDC .toString ([d .amounts [schema [1]] || 0])}),
          backgroundColor: schema [2], hoverBackgroundColor: schema [2],
          borderColor:     schema [3], hoverBorderColor: schema [3],
          data:            this._data .map (d => {
            return this._graphAsPercentage? (d .amounts [schema [1]] || 0) * 98.0 / d .total : d .amounts [schema [1]] || 0;
          })
        }})
      .filter (ds => {return ds});
    if (this._graphAsPercentage)
      this._chart .data .linePosition = this._data [0] .percentComplete;
    else {
      var max = this._data .reduce ((m,d) => {return Math .max (m, d .total)}, 0) + 5000;
      this._chart .data .linePosition = this._data .map (d => {return d .total * d .percentComplete * d .percentInBudget / max});
      this._chart .options .scales .xAxes [0] .ticks .max = max;
    }
    this._chart .data .ids = this._data .map (d => {return d._id});
    this._chart .update();
  }

  /**
   * Add graph for data
   *   data = [{
   *      _id:             category id
   *      name:            category name
   *      amounts:         {...}
   *      isCredit:        true iff credit category
   *      isYear:          true iff yearly schedule
   *      percentComplete: fraction for showPercentComplete
   *   }*]
   */
  add (data) {
    this._data   = [] .concat (data);
    var dt       = this._data [0];
    this._schema = dt .isBudgetLess? this._budgetlessDatasets :
                   dt .isGoal?       this._goalDatasets :
                   dt .isYear?       this._constraintYearDatasets :
                                     this._constraintDatasets;
    var prop = this._barThickness? {
      height: this._barThickness / this._barPercentage * this._data .length + (this._barPercentage < 1? 16: 8)
    }: {}
    this._canvas = $('<canvas>', {prop: prop, class: '_progressGraph _progressGraph_' + this._name}) .appendTo ($('<div>') .appendTo (this._content));
    for (let d of this._data) {
      d .total = this._schema .reduce ((t,s) => {return t + (d .amounts [s [1]] || 0)}, 0);
    }
    var max = this._graphAsPercentage? 100: (data .reduce ((m,i) => {return Math .max (m, i .total)}, 0) + 5000);
    var options = {
      animation: false,
      maintainAspectRatio: false,
      elements: {rectangle: {borderWidth: 2, borderSkipped: 'left'}},
      legend: {display: false},
      events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
      onClick: (e, elements) => {
        if (e .offsetX < this._chart .chartArea .left) {
          var index   = Math .floor (e .offsetY / (this._chart .chart .height / this._chart .chart .config .data .labels .length));
          var isLabel = true;
        } else {
          var element      = this._chart .getElementAtEvent (e);
          if (element .length == 0)
            return;
          var index        = elements .length && elements [0]._index;
          var isLabel      = false;
          var datasetIndex = element .length && element [0] ._datasetIndex;
        }
        let target      = $(e .target);
        let html        = target .offsetParent();
        let position    = target .position();
        position .top  += e .offsetY;
        position .left += e .offsetX;
        this._notifyObservers (BudgetProgressGraphEvent .GRAPH_CLICK, {
          name:            this._name,
          target:          target,
          id:              (index != null) && this._chart .chart .config .data .ids [index],
          isLabel:         isLabel,
          datasetIndex:    datasetIndex,
          html:            html,
          position:        position,
          altPosition:     ui .calcPosition (target, html, {top: 50, left: 50}),
          altClick:        e .webkitForce > 1 || e .altKey
        })
        e .stopPropagation();
        return false;
      },
      tooltips: {
        titleSpacing: 0, xPadding: 8, yPadding: 4, backgroundColor: 'rgba(0,0,0,0.6)',
        callbacks: {
          label: (t, d) => {
            var val = d .datasets [t .datasetIndex] .values [t .index];
            return val? d .datasets [t .datasetIndex] .label + ': ' + val: '';
          },
          title:  () => {return ''},
          footer: () => {return ''}
        }
      },
      scales: {
        xAxes: [{
          display: false, stacked: true, ticks: {max: max}, gridLines: {display: false}
        }],
        yAxes: [{
          fixedTickLabelWidth: this._labelWidth,
          display:             this._data [0] .name != null,
          stacked:             true,
          ticks:               {fontSize: 16, fontColor: '#888', fontFamily: 'Helvetica', fontStyle: '100'},
          gridLines:           {display: false},
          categoryPercentage:  0.80,
          barThickness:        this._barThickness
        }]
      }
    };
    this._chart = new Chart (this._canvas [0] .getContext ('2d'), {
      type:    'horizontalBar',
      data:    {labels: []},
      options: options
    });
    this._chart._budgetProgressGraph = this;
    this._canvas .data ('chart', this._chart);
    this ._setData();
  }

  update (data, labelWidth) {
    if (this._data) {
      this._data = [] .concat (data);
      for (let d of this._data)
        d .total = this._schema .reduce ((t,s) => {return t + (d .amounts [s [1]] || 0)}, 0);
      this._labelWidth = labelWidth || this._labelWidth;
      if (this._canvas && this._canvas .length) {
        this._setData();
      }
    } else
      this .add (data);
  }

  setVisible (isVisible) {
    if (isVisible) {
      this._canvas .height (BudgetProgressGraph_CANVAS_HEIGHT);
      this._content .removeClass ('hidden');
    } else
      this._content .addClass ('hidden');
  }
}

var BudgetProgressGraphEvent = Object.create (ViewEvent, {
  GRAPH_CLICK: {value: 200}
});

var baseHorizontalBarController = Chart .controllers .horizontalBar;

Chart .controllers .horizontalBar = Chart .controllers .horizontalBar .extend ({

  draw: function() {
    baseHorizontalBarController .prototype .draw .apply (this, arguments);
    if (this .chart .data .linePosition != null && this .chart._budgetProgressGraph._showPercentComplete)
      this ._drawLine();
  },

  _drawLine: function (percentY) {
    var chart         = this .chart .chart;
    var ctx           = chart .ctx;
    var start         = this .chart .chartArea .left;
    var width         = chart .width - start;
    var linePerBar    = Array .isArray (this .chart .data .linePosition);
    var linePositions = [] .concat (this .chart .data .linePosition);
    if (linePerBar) {
      var yAxis  = this .chart .options .scales .yAxes [0];
      var height = yAxis .barThickness + 6;
      var x      = 7;
      var xInc   = (chart .height - 16) / linePositions .length;
    } else {
      var height = Math .floor (chart .height);
      var x      = 0;
    }
    for (var linePos of linePositions) {
      var y = start + Math .round (width * .98 * linePos);

      if (linePerBar) {
        ctx .beginPath();
        ctx .lineWidth = 7;
        ctx .strokeStyle = 'rgba(255,255,255,0.2)';
        ctx .moveTo   (y, x);
        ctx .lineTo   (y, x + height);
        ctx .stroke   ();
      }

      ctx .beginPath();
      ctx .lineWidth = linePerBar? .6: 1;
      ctx .strokeStyle = '#dd0000';
      ctx .moveTo   (y, x);
      ctx .lineTo   (y, x + height);
      ctx .stroke   ();

      if (!linePerBar) {
        ctx .beginPath();
        ctx .arc      (y, height - 4 + x, 4, 0, 2 * Math.PI);
        ctx .fillStyle   = '#dd0000';
        ctx .fill     ();
      } else
        x += xInc;
    }
  }
});


