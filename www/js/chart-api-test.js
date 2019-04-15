
const NEXT_BLOCK_LABELS = ["next block", "2nd block", "3rd block"]

var chart
var timeSinceLastUpdate = 0
var lastMempoolDataUpdate = 0
var focused = false



function generateColorPattern(patternAreas) {

  const patternColors = [
    ['LightGreen', 'YellowGreen'],
    ['YellowGreen', 'Bisque'],
    ['Bisque', 'Salmon'],
    ['Salmon', 'HotPink'],
  ]

  var colorPattern = []
  var c_counter = 0
  for (area in patternAreas) {
    logLimits = chroma.limits(patternAreas[area], 'l', patternAreas[area].length);
    pattern = chroma.scale(patternColors[c_counter])
      .mode('lch').classes(logLimits)
      .colors(patternAreas[area].length);

    colorPattern = colorPattern.concat(pattern)
    c_counter++
  }

  return colorPattern
}

function processApiMempoolDataForChart(response) {

  console.log('Mempool data written to db @', response.timestamp)
  lastMempoolDataUpdate = response.timestamp  

  const mempoolSize = +(response.mempoolSize / 1000000).toFixed(2)

  const patternAreas = {
    '0to10': [],
    '11to100': [],
    '101to1k': [],
    'from1001': []
  }

  const ticks = []
  const lines = []
  const blocks = []
  const rowData = [
    [],[]
  ]

  for (var feerate in response.mempoolData) {
    rowData[0].push(feerate.toString())
    rowData[1].push(response.mempoolData[feerate])

    // TODO: (0xb10c) Why do we do this and what does it?
    log1pOfCount = response.mempoolData[feerate]
    if (feerate <= 10) {
      patternAreas['0to10'].push(log1pOfCount)
    } else if (feerate <= 100) {
      patternAreas['11to100'].push(log1pOfCount)
    } else if (feerate <= 1000) {
      patternAreas['101to1k'].push(log1pOfCount)
    } else {
      patternAreas['from1001'].push(log1pOfCount)
    }
  }

  
  for (var position in response.positionsInGreedyBlocks) {
    if (position < 3) {
      blocks.push(response.positionsInGreedyBlocks[position])
      // add lines to show estimated next blocks on the mempool graph
      lines.push({
        value: response.positionsInGreedyBlocks[position]
      })
    }
  }

  let colorPattern = generateColorPattern(patternAreas)

  // Sum all txs to get the total number of tx in the mempool
  const sum = Object.values(rowData[1]).reduce((a, b) => a + b, 0)

  return {
    "mempoolSize": mempoolSize,
    "blocks": blocks,
    "colorPattern": colorPattern,
    "lines": lines,
    "rowData": rowData,
    "sum": sum
  }
}

window.onload = function () {
  // Add event listener for the search bar
  document.getElementById('button-lookup-txid').addEventListener('click', handleTxSearch)
  // Add one more so that we can reset focus of the chart
  document.body.addEventListener('click', function(e) {
    var targetElement = event.target || event.srcElement;
    if (focused && targetElement.tagName !== 'BUTTON' && targetElement.tagName !== 'I') {
      chart.tooltip.hide()
      chart.focus()
      focused = false
    }
  })

  // Get the mempool data 
  axios.get('https://mempool.observer/api/mempool')
    .then(function (response) {
      console.log(response.data)
      processed = processApiMempoolDataForChart(response.data)
      draw(processed)
      updateCurrentMempoolCard(processed)
      redraw() // init redraw loop
    })
}

function draw(processed) {
  chart = c3.generate({
    data: {
      rows: processed.rowData,
      type: 'bar',
      groups: [processed.rowData[0]],
      order: null,
    },
    point: {
      show: false
    },
    legend: {
      show: false
    },
    tooltip: {
      grouped: false,
      format: {
        name: function (name) {return name + ' sat/vbyte'},
        value: function (value) {return value + ' transactions'},
      }
    },
    size: {
      height: 750
    },
    padding: {
      top: 20
    },
    color: {
      pattern: processed.colorPattern
    },
    grid: {
      y: {
        lines: processed.lines
      }
    },
    axis: {
      y: {
        padding: {top: 0},
        show: true,
        label: {
          text: 'unconfirmed transactions'
        },
      },
      y2: {
        outer: false,
        padding: {top: 0, bottom:0},
        default: [0, processed.sum],
        label: {
          text: 'estimated blocks'
        },
        show: true,
        tick: {
          format: function (d) {return NEXT_BLOCK_LABELS[processed.blocks.indexOf(d)]},
          values: processed.blocks
        }
      }
    }
  })
  
  // Refocus the chart if was focused before a 'redraw'
  if (focused) {
    // TODO: focus on actual data
    chart.focus("1");
    chart.tooltip.show({x: 0, index: 0, id: '1' })
  }
}

function redraw() {
  setTimeout(function () {
    axios.get('https://mempool.observer/api/mempool')
      .then(function (response) {
        processed = processApiMempoolDataForChart(response.data)
        draw(processed)
        updateCurrentMempoolCard(processed)
        redraw()
      });
  }, 60000);
}

function updateCurrentMempoolCard(processed) { //TODO: Change name of function

  const spanTxCount = document.getElementById('current-mempool-count')
  const spanMempoolSize = document.getElementById('current-mempool-size')

  const txCountInMempool = processed.sum
  const txSizeInMempool = processed.mempoolSize

  spanTxCount.innerHTML = txCountInMempool
  spanMempoolSize.innerHTML = txSizeInMempool

  timeSinceLastUpdate = 0
  updateCurrentMempoolCardLastUpdated()
}


function updateCurrentMempoolCardLastUpdated() {
  // format as milliseconds since 1.1.1970 UTC
  // * 1000 to convert from seconds to milliseconds
  const millislastMempoolDataUpdate = lastMempoolDataUpdate * 1000

  const minutes = Math.floor((Date.now() -  millislastMempoolDataUpdate) / 1000 / 60)

  document.getElementById('current-mempool-last-update').innerHTML = (minutes)
}

// Update the 'Time since last update' text
setInterval(function() {
  updateCurrentMempoolCardLastUpdated()
}, 10000);

function handleTxSearch() {
  clearAlerts()
  txId = document.getElementById('input-lookup-txid').value
  // TODO: Improve handling of invalid tx ids
  // ==> check input with regex to be conform to ^[a-fA-F0-9]{64}$
  if (txId === '') {
    return showAlert()
  }

  // TODO: Create a real search
  focused = true
  chart.focus("1");
  chart.tooltip.show({x: 0, index: 0, id: '1' })
}

function showAlert() {
  const alert = `<div class="alert alert-tx alert-warning alert-dismissible fade show shadow-sm border-warning" role="alert">
                  We could not find your transaction, type something into the input field (CHANGE LATER)
                  <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>`
  
  $('#main').prepend(alert)
}

function clearAlerts() {
  $('.alert-tx').hide()
}

$(window).scroll(function() {
  if ($(".navbar").offset().top > 60) {
      $(".navbar").addClass("scrolled");
  } else {
      $(".navbar").removeClass("scrolled");
  }   
});