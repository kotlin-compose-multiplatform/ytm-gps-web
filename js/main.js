// Wialon session
var sess = null
// Translate function
var translate = null
// units data
var unitsData = {}
// map
var map = null
// Current user
var user = {
  nm: "",
  mu: 0,
  prp: {
    us_addr_fmt: "0_0_0",
  },
  locale: {
    wd: 1,
  },
}
var period = 1
var adds
var requestTimestamp
// Delay function used for dynamic filter
var delay = (function () {
  var timer
  return function (callback, ms) {
    clearTimeout(timer)
    timer = setTimeout(callback, ms)
  }
})()

// {flags: addr_fmt[0], city_radius: addr_fmt[1], dist_from_unit: addr_fmt[2]}
// Init wialon event system and create map
function initEnv() {
  // load all unit in session
  var params = {
    spec: [
      {
        type: "type",
        data: "avl_unit",
        flags: 0x411,
        mode: 0,
      },
    ],
  }
  sess.execute("core/update_data_flags", params, function (data) {
    showUnits()
  })
  // register event listener
  sess.on("positionChanged", handleChange)
  sess.on("lastMessageChanged", handleChange)
  sess.on("itemChanged", handleChange)
}
// Show units in the table and on the map
function showUnits() {
  // get loaded 'avl_units's items
  var units = sess.getItems("avl_unit")
  // check if units found
  if (!units || !units.length) {
    W.logger("Units not found")
    return
  }
  // sort by name in ascending order
  units.sort(function (unit1, unit2) {
    var name1 = unit1.nm.toLowerCase()
    var name2 = unit2.nm.toLowerCase()
    if (name1 > name2) {
      return 1
    } else {
      return -1
    }
  })

  // Create container for cards if it doesn't exist
  if (!$("#units_grid").length) {
    $("#units_container").append(
      '<div id="units_grid" class="units-grid"></div>'
    )
  }

  var bounds = []
  for (
    var i = 0, data = null, unit = null, html = "", len = units.length;
    i < len;
    i++
  ) {
    unit = units[i]
    data = getUnitData(unit.id)
    // check if map created and we can detect position of unit
    if (map && data.pos) {
      // add point to bounds
      bounds.push(data.pos)
      // construct data to store it and reuse
      unitsData[unit.id] = {
        marker: L.marker(
          {
            lat: data.pos[0],
            lng: data.pos[1],
          },
          {
            icon: L.icon({
              iconUrl: data.icon,
              iconAnchor: [16, 16],
            }),
            // store unit ID in options
            unitId: unit.id,
          }
        )
          .bindPopup(null, {
            offset: L.point(0, -16),
            closeButton: false,
            className: "olMarkerLabel",
          })
          .addTo(map)
          .on("popupopen", function (e) {
            var pos = e.target.getLatLng()
            // get address format
            var addr_fmt = user.prp.us_addr_fmt.split("_")
            // use geocode
            sess.getLocations(
              {
                coords: [
                  {
                    lat: pos.lat,
                    lon: pos.lng,
                  },
                ],
                flags: addr_fmt[0],
                city_radius: addr_fmt[1],
                dist_from_unit: addr_fmt[2],
              },
              false,
              function (id, data) {
                $("#marker_tooltip_" + id).html($.isArray(data) ? data[0] : "-")
              }.bind(this, e.target.options.unitId)
            )
          })
          .on("mouseover", function (e) {
            // update popup content
            setPopupContent(
              e.target.options.unitId,
              function (marker) {
                // open popup
                marker.openPopup()
              }.bind(this, e.target)
            )
          })
          .on("mouseout", function (e) {
            // hide popup
            e.target.closePopup()
          }),
        tail: L.polyline(
          [
            {
              lat: data.pos[0],
              lng: data.pos[1],
            },
          ],
          {
            color: getRandomColor(),
            opacity: 0.8,
          }
        ).addTo(map),
        props: {
          trip: {
            avg_speed: 0,
            distance: 0,
            max_speed: 0,
          },
        },
        newer: true,
      }
    }

    // Generate card html
    html =
      '<div class="unit-card" id="unit_card_' +
      unit.id +
      '" data-id="' +
      unit.id +
      '">' +
      '<div class="unit-card-header">' +
      '<img src="' +
      data.icon +
      '" class="unit-card-icon" alt="Unit icon">' +
      '<div class="unit-card-name">' +
      data.name +
      "</div>" +
      "</div>" +
      '<div class="unit-card-details">' +
      '<span id="unit_time_' +
      unit.id +
      '">' +
      data.tm +
      "</span>" +
      '<span id="unit_speed_' +
      unit.id +
      '">' +
      data.speed +
      "</span>" +
      "</div>" +
      "</div>"

    // Also generate table row for compatibility (hidden)
    var tableHtml =
      "<tr id='unit_row_" +
      unit.id +
      "' class='row-name' data-id='" +
      unit.id +
      "'>" +
      "<td class='centered' id='unit_img_" +
      unit.id +
      "'><img src='" +
      data.icon +
      "' width='24' height='24'/></td>" +
      "<td id='unit_name_" +
      unit.id +
      "' class='shorten-container'><div class='shorten'>" +
      data.name +
      "</div></td>" +
      "<td id='unit_time_" +
      unit.id +
      "'>" +
      data.tm +
      "</td>" +
      "<td id='unit_speed_" +
      unit.id +
      "'>" +
      data.speed +
      "</td>" +
      "</tr>"

    $("#units_grid").append(html)
    $("#units_tbl").append(tableHtml)
  }

  // Add click handler for cards
  $(".unit-card")
    .off("click")
    .on("click", function (e) {
      $(".unit-card").removeClass("active")
      $(this).addClass("active")

      // Trigger the same behavior as table row click
      var unitId = $(this).data("id")
      var tableRow = $("#unit_row_" + unitId)
      getDetailedInfo({ currentTarget: tableRow[0] })

      // On mobile, expand the bottom sheet
      if ($(window).width() <= 768) {
        $(".bottom-sheet").addClass("expanded")
        $(".bottom-sheet").css("transform", "translateY(0)")
      }
    })
}

// Position changed event handler
function handleChange(e) {
  var unit = sess.getItem(e.i)
  if (!unit) return false

  var type = e.type
  var changed = e.d
  var data = getUnitData(unit.id)
  var marker = null

  if (type === "itemChanged") {
    if (changed.nm) {
      $("#unit_card_" + unit.id + " .unit-card-name").html(data.name)
      $("#unit_name_" + unit.id + " div").html(data.name)
    }
    if (changed.uri) {
      $("#unit_card_" + unit.id + " .unit-card-icon").attr("src", data.icon)
      $("#unit_img_" + unit.id + " img").attr("src", data.icon)
      if (unit.id in unitsData) {
        marker = unitsData[unit.id].marker
        marker.setIcon(
          L.icon({
            iconUrl: data.icon,
            iconAnchor: [16, 16],
          })
        )
      }
    }
  } else if (changed.pos && type === "positionChanged") {
    $("#unit_speed_" + unit.id).html(data.speed)
    if (unit.id in unitsData) {
      marker = unitsData[unit.id].marker
      marker.setLatLng({ lat: data.pos[0], lng: data.pos[1] })
      unitsData[unit.id].tail.addLatLng({ lat: data.pos[0], lng: data.pos[1] })
      if (unitsData[unit.id].tail.getLatLngs().length > 10) {
        unitsData[unit.id].tail.spliceLatLngs(0, 1)
      }
      unitsData[unit.id].newer = true
    }
  } else if (type === "lastMessageChanged") {
    $("#unit_time_" + unit.id).html(data.tm)
  }
}

// Search necessary unit
function onSearch() {
  delay(function () {
    var string = $("#units_filter").val().trim().toLowerCase()

    $(".unit-card").each(function () {
      var unitName = $(this).find(".unit-card-name").text().toLowerCase()
      if (!string.length || unitName.indexOf(string) !== -1) {
        $(this).show()
      } else {
        $(this).hide()
      }
    })
  }, 500)
}

// On search input change event
function onSearchChange(e) {
  // we'll call onSearch function when user click
  // "Esc" or "Backspace" button
  if (e.which === 8 || e.which === 27 || e.keyCode === 8 || e.keyCode === 27) {
    onSearch()
  }
}

// Random color generator
function getRandomColor() {
  var letters = "0123456789ABCDEF".split("")
  var color = "#"
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}

// Set popup content for necessary unit
function setPopupContent(id, callback) {
  if (!id) {
    return false
  }
  var data = getUnitData(id)
  if (!(id in unitsData)) {
    return false
  }
  var marker = unitsData[id].marker
  if (!marker) {
    return false
  }
  var updateCallback = function (data, newer) {
    // check if we'll need to update current data
    if (newer) {
      var data = getUnitData(id)
    }
    var html = ""
    if (data.name) {
      html += "<div class='label-title'>" + data.name + "</div>"
    }
    html += "<table>"
    if (data.tm) {
      html +=
        "<tr><td>" +
        translate("Last message") +
        ":&nbsp;</td><td>" +
        data.tm +
        "</td></tr>"
    }
    html +=
      "<tr><td>" +
      translate("Location") +
      ": </td><td id='marker_tooltip_" +
      id +
      "'></td></tr>"
    if (data.speed) {
      html +=
        "<tr><td>" +
        translate("Speed") +
        ": </td><td>" +
        data.speed +
        "</td></tr>"
    }
    html +=
      "<tr><td>" +
      translate("Event") +
      ": </td><td>" +
      data.stateNamed +
      "</td></tr>"
    html +=
      "<tr><td>" +
      translate("Start") +
      ": </td><td>" +
      data.start +
      "</td></tr>"
    html +=
      "<tr><td>" +
      translate("Duration") +
      ": </td><td>" +
      data.duration +
      "</td></tr>"
    html +=
      "<tr><td>" +
      translate("Distance") +
      ": </td><td>" +
      data.distance +
      "</td></tr>"
    html +=
      "<tr><td>" +
      translate("Avg.speed") +
      ": </td><td>" +
      data.avg_speed +
      "</td></tr>"
    html +=
      "<tr><td>" +
      translate("Max.speed") +
      ": </td><td>" +
      data.max_speed +
      "</td></tr>"
    html += "</table>"
    marker.getPopup().setContent(html).update()
    callback && callback()
  }.bind(this, data)
  if (unitsData[id].newer) {
    // Update data
    updateUnitData(id, updateCallback)
  } else {
    updateCallback()
  }
}

// Get necessary data from unit
function getUnitData(id) {
  // get unit from session
  var unit = sess.getItem(id)
  if (!unit) {
    return false
  }
  var result = {
    id: id,
    name: unit.nm || "",
    icon: sess.getBaseUrl() + unit.uri + "?b=32",
    pos: null,
    speed: "-",
    mu: unit.mu || 0,
    tm: parceDate(unit.lmsg && unit.lmsg.t),
    cnm: unit.cnm || 0,
  }
  if (unit.pos) {
    result.pos = [unit.pos.y, unit.pos.x]
    var converts = convertMeasure(
      [
        {
          k: ["km/h", "mph"],
          v: unit.pos.s,
        },
      ],
      unit
    )
    result.speed = converts ? converts[0] : "-"
  }
  if (id in unitsData) {
    // merge properties
    $.extend(unitsData[id].props, unit)
    if ("trip" in unitsData[id].props) {
      $.extend(result, getTripInfo(unitsData[id].props.trip, unit))
    }
  }
  return result
}

// Update unit data
function updateUnitData(id, callback) {
  if (!(id in unitsData)) {
    return false
  }
  var params = {
    itemId: id,
    eventType: "trips",
    ivalType: 0,
    ivalFrom: 0,
    ivalTo: 0,
    filter2: "*",
  }
  // load all events
  sess.execute(
    "unit/get_events",
    { params: params },
    function (id, data) {
      if (!data || data.error || !("trips" in data)) {
        callback && callback()
        return false
      }
      $.extend(unitsData[id].props.trip, data.trips)
      // Remove it from unit data
      delete unitsData[id].newer
      callback && callback(unitsData[id])
    }.bind(this, id)
  )
}

// Pan to marker on map
// Get events data from unit
function getDetailedInfo(id) {
  removeAdds()
  if (id === Object(id) && "id" in id.currentTarget) {
    $("#units_tbl tr.active").removeClass("active")
    $(id.currentTarget).closest("tr").addClass("active")
    id = $(id.currentTarget).data("id")

    // Close the drawer when a unit is clicked
    $("#drawer").removeClass("open")
    $(".drawer-overlay").removeClass("open")
  }
  if (!id) {
    return false
  }
  // get unit from session
  var unit = sess.getItem(id)
  if (!unit) {
    return false
  }
  if (map && unit.pos) {
    // Pan map to current unit
    map.panTo([unit.pos.y, unit.pos.x])
  }
  var today = getToday()
  var interval
  var from
  var day1
  var day2
  switch (period) {
    // yesterday
    case 0:
      interval = [today - 86.4e3, today - 1]
      break
    // week
    case 2:
      day1 = new Date(today * 1000)
      day2 = day1.getDay()
      var monday =
        day1.getDate() -
        day2 +
        (day2 === 0 ? -7 : 0) +
        (user.locale.wd === 1 ? 1 : 0)
      monday = new Date(day1.setDate(monday))
      from = new Date(monday.setDate(monday.getDate()))
      from = Math.floor(from.getTime() / 1000) | 0
      interval = [from, today - 1]
      break
    // month
    case 3:
      day1 = new Date(today * 1000)
      day2 = new Date(day1.setDate(1))
      from = new Date(day2)
      from = Math.floor(from.getTime() / 1000) | 0
      interval = [from, today - 1]
      break
    default:
      interval = [today, sess.getCurrentTime()]
  }
  var params = {
    itemId: id,
    eventType: "trips",
    ivalType: 1,
    ivalFrom: interval[0],
    ivalTo: interval[1],
  }
  requestTimestamp = sess.getCurrentTime()
  // load all events
  sess.execute(
    "unit/get_events",
    { params: params },
    function (ts, data) {
      if (ts !== requestTimestamp) {
        return false
      }
      if (!data || data.error) {
        $("#events_tbl").html(
          "<tr><td colspan='7' class='centered'>" +
            translate("No data") +
            "</td></tr>"
        )
        return false
      }
      // clear events view
      $("#events_tbl").empty()
      // generate trips
      generateTrips(data.trips, unit)
    }.bind(this, requestTimestamp)
  )
  return false
}

// Update period
function updatePeriod(e) {
  var btnPeriod = $(e.currentTarget).data("period")
  if (btnPeriod == null || ~~btnPeriod === period) {
    return false
  }

  // Update both desktop and mobile timepickers
  $("#btn-yesterday, #btn-today, #btn-week, #btn-month").removeClass("active")
  $(
    "#mobile-btn-yesterday, #mobile-btn-today, #mobile-btn-week, #mobile-btn-month"
  ).removeClass("active")

  if (btnPeriod === 0) {
    $("#btn-yesterday, #mobile-btn-yesterday").addClass("active")
  } else if (btnPeriod === 1) {
    $("#btn-today, #mobile-btn-today").addClass("active")
  } else if (btnPeriod === 2) {
    $("#btn-week, #mobile-btn-week").addClass("active")
  } else if (btnPeriod === 3) {
    $("#btn-month, #mobile-btn-month").addClass("active")
  }

  // update current period
  period = ~~btnPeriod
  // Try to find corrent unit
  var id = $(".row-name.active")
  if (!id.length) {
    return false
  }
  id = $(id[0]).data("id")
  // Call detailed info
  getDetailedInfo(id)
  return false
}

// Get detailed information about trip or smth else & draw it on map
function getDetailedEvent(e) {
  removeAdds()
  $("#events_tbl tr.active").removeClass("active")
  $(e.currentTarget).closest("tr").addClass("active")
  var id = $(e.currentTarget).data("id")
  var state = ~~$(e.currentTarget).data("state")
  // Skip if there are no necessary data attributes
  if (!map || !id) {
    return false
  }
  if (state === 1) {
    var from = $(e.currentTarget).data("from")
    var to = $(e.currentTarget).data("to")
    if (!from || !to) {
      return false
    }
    var params = {
      itemId: id,
      eventType: "trips",
      ivalType: 4,
      ivalFrom: from,
      ivalTo: to,
      detalization: 0x10,
    }
    requestTimestamp = sess.getCurrentTime()
    // load all events
    sess.execute(
      "unit/get_events",
      { params: params },
      function (ts, data) {
        if (
          !data ||
          data.error ||
          !data.trips.length ||
          !("msgs" in data.trips[0]) ||
          ts !== requestTimestamp
        ) {
          return false
        }
        var latlngs = data.trips[0].msgs.map(function (p) {
          return {
            lat: p.y,
            lng: p.x,
          }
        })
        var color =
          id in unitsData ? unitsData[id].tail.options.color : getRandomColor()
        // add track to map
        adds = L.polyline(latlngs, { color: color, opacity: 0.8 }).addTo(map)
        // zoom the map to the polyline
        map.fitBounds(adds.getBounds())
      }.bind(this, requestTimestamp)
    )
  } else {
    var lat = $(e.currentTarget).data("lat")
    var lng = $(e.currentTarget).data("lng")
    if (!lat || !lng) {
      return false
    }
    // add track to map
    adds = L.marker({ lat: lat, lng: lng }, { clickable: false }).addTo(map)
    // zoom the map to the polyline
    map.panTo(adds.getLatLng())
  }
  return false
}

// Generate trips table
function generateTrips(trips, unit) {
  if (!trips || !trips.length || !unit) {
    var noDataMsg =
      "<tr><td colspan='7' class='centered'>" +
      translate("No data") +
      "</td></tr>"
    $("#events_tbl").html(noDataMsg)
    $("#mobile-events-tbl").html(noDataMsg)
    return false
  }
  var html = ""
  var resultTrips = []
  var len = trips.length
  trips.forEach(function (trip, i) {
    // Insert parking here
    if (i) {
      var parking = {
        state: 0,
        distance: 0,
        avg_speed: 0,
        max_speed: 0,
      }
      var prev = resultTrips[resultTrips.length - 1]
      parking.from = prev.to
      parking.to = trip.from
      // Insert to resulted array
      resultTrips.push(parking)
    }
    resultTrips.push(trip)
  })
  resultTrips.forEach(function (trip) {
    var result = getTripInfo(trip, unit)
    // Generate output table html
    html +=
      "<tr id='unit_trip_row_" +
      unit.id +
      "' class='row-name-trip' data-state='" +
      result.state +
      "' data-id='" +
      unit.id +
      "'"
    if (result.state === 1) {
      html += " data-from='" + trip.from.t + "' data-to='" + trip.to.t + "'"
    } else {
      html += " data-lat='" + trip.to.y + "' data-lng='" + trip.to.x + "'"
    }
    html +=
      "><td id='unit_trip_type_" +
      unit.id +
      "' class='shorten-container'><div class='shorten'>" +
      result.stateNamed +
      "</div></td>" +
      "<td id='unit_trip_start_" +
      unit.id +
      "' class='shorten-container'><div class='shorten'>" +
      result.start +
      "</div></td>" +
      "<td id='unit_trip_time_" +
      unit.id +
      "'>" +
      result.duration +
      "</td>" +
      "<td id='unit_trip_distance_" +
      unit.id +
      "'>" +
      result.distance +
      "</td>" +
      "<td id='unit_trip_avg_speed_" +
      unit.id +
      "'>" +
      result.avg_speed +
      "</td>" +
      "<td id='unit_trip_max_speed_" +
      unit.id +
      "'>" +
      result.max_speed +
      "</td>" +
      "</tr>"
  })
  $("#events_tbl").append(html)

  // Sync with mobile events table
  $("#mobile-events-tbl").html($("#events_tbl").html())

  // Expand bottom sheet when data is loaded on mobile
  if ($(window).width() <= 768) {
    $(".bottom-sheet").addClass("expanded")
    $(".bottom-sheet").css("transform", "translateY(0)")
  }
}

// Convert measuments
function convertMeasure(values, unit) {
  if (!unit || !$.isArray(values)) {
    return false
  }
  var result = []
  if (unit.mu) {
    values.forEach(function (value) {
      result.push(
        !value || !("k" in value) || !("v" in value)
          ? "-"
          : Math.ceil(~~value.v * 0.621 - 0.49) +
              "&nbsp;" +
              translate(value.k[1])
      )
    })
  } else {
    values.forEach(function (value) {
      result.push(
        !value || !("k" in value) || !("v" in value)
          ? "-"
          : ~~value.v + "&nbsp;" + translate(value.k[0])
      )
    })
  }
  return result
}

// Get trip information
function getTripInfo(trip, unit) {
  if (!trip || !unit) {
    return false
  }
  var measures = []
  measures.push(
    "distance" in trip
      ? {
          k: ["m", "mi"],
          v: trip.distance,
        }
      : null
  )
  measures.push(
    "avg_speed" in trip
      ? {
          k: ["km/h", "mph"],
          v: trip.avg_speed,
        }
      : null
  )
  measures.push(
    "max_speed" in trip
      ? {
          k: ["km/h", "mph"],
          v: trip.max_speed,
        }
      : null
  )
  var converts = convertMeasure(measures, unit)
  var result = {}
  result.state = ~~trip.state
  result.start = parceDate("from" in trip ? trip.from.t : 0)
  result.duration = parceUnixTime(
    "to" in trip && "from" in trip ? trip.to.t - trip.from.t : 0
  )
  result.distance = converts ? converts[0] : "-"
  result.avg_speed = converts ? converts[1] : "-"
  result.max_speed = converts ? converts[2] : "-"
  switch (result.state) {
    case 2:
      result.stateNamed = translate("Stop")
      break
    case 1:
      result.stateNamed = translate("Trip")
      break
    default:
      result.stateNamed = translate("Parking")
  }
  return result
}

// Fetch variable from 'GET' request
function getHtmlVar(name) {
  if (!name) {
    return null
  }
  var pairs = decodeURIComponent(document.location.search.substr(1)).split("&")
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i].split("=")
    if (pair[0] == name) {
      pair.splice(0, 1)
      return pair.join("=")
    }
  }
  return null
}

// Apply theme based on URL parameter
function applyTheme() {
  var theme = getHtmlVar("theme")
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark")
  } else {
    document.documentElement.removeAttribute("data-theme")
  }
}

// Get today
function getToday() {
  var time =
    new Date().getTime() +
    (sess.getTimeZoneOffset() - W.Util.time.getTimeZoneOffset()) * 1000
  time = new Date(time)
  time.setHours(0)
  time.setMinutes(0)
  time.setSeconds(0)
  time.setMilliseconds(0)
  time = Math.floor(time.getTime() / 1000) | 0
  return time
}

// Order events
function orderEvents() {
  $("#events_tbl tr").each(function () {
    $("#events_tbl").prepend(this)
  })
  return false
}

// Parce unix-time
function parceUnixTime(time) {
  time = ~~time
  if (!time) {
    return "-"
  }
  var result = ""
  if (Math.floor(time / 86.4e3)) {
    result += "&nbsp;" + Math.floor(time / 86.4e3) + translate("d")
  }
  if (Math.floor((time / 36e2) % 24)) {
    result += "&nbsp;" + Math.floor((time / 36e2) % 24) + translate("h")
  }
  if (Math.floor((time / 60) % 60)) {
    result += "&nbsp;" + Math.floor((time / 60) % 60) + translate("m")
  }
  if (Math.floor(time % 60)) {
    result += "&nbsp;" + Math.floor(time % 60) + translate("s")
  }
  return (result = result.replace("&nbsp;", ""))
}

// Parce date
function parceDate(time) {
  time = ~~time
  if (!time) {
    return "-"
  }
  var date = new Date(sess.getUserTime(time, 0) * 1000)
  var result = date.getFullYear()
  result += "-" + ("0" + (date.getMonth() + 1)).slice(-2)
  result += "-" + ("0" + date.getDate()).slice(-2)
  result += "&nbsp;" + ("0" + date.getHours()).slice(-2)
  result += ":" + ("0" + date.getMinutes()).slice(-2)
  result += ":" + ("0" + date.getSeconds()).slice(-2)
  return result
}

// Login result
function login(data) {
  W.logger("stringify", data)
  if (typeof data === "undefined" || typeof data !== "object" || data.error) {
    alert(translate("Login error"))
    return
  }
  // column names
  $("#icon_col").html(translate("Icon"))
  $("#name_col").html(translate("Name"))
  $("#lmsg_col").html(translate("Last message"))
  $("#speed_col").html(translate("Speed"))
  $("#type_col").html(translate("Event"))
  $("#start_col").html(translate("Start"))
  $("#time_col").html(translate("Duration"))
  $("#distance_col").html(translate("Distance"))
  $("#avg_speed_col").html(translate("Avg.speed"))
  $("#max_speed_col").html(translate("Max.speed"))
  $("#btn-yesterday").html(translate("Yesterday"))
  $("#btn-today").html(translate("Today"))
  $("#btn-week").html(translate("Week"))
  $("#btn-month").html(translate("Month"))
  $("#events_descr").html(translate("Choose a unit"))
  $("#mobile-events-descr").html(translate("Choose a unit"))
  $("#units_filter").attr("placeholder", translate("Search by name"))

  // Initialize mobile column headers
  $("#mobile-type-col").html(translate("Event"))
  $("#mobile-start-col").html(translate("Start"))
  $("#mobile-time-col").html(translate("Duration"))
  $("#mobile-distance-col").html(translate("Distance"))
  $("#mobile-avg-speed-col").html(translate("Avg.speed"))
  $("#mobile-max-speed-col").html(translate("Max.speed"))
  $("#mobile-btn-yesterday").html(translate("Yesterday"))
  $("#mobile-btn-today").html(translate("Today"))
  $("#mobile-btn-week").html(translate("Week"))
  $("#mobile-btn-month").html(translate("Month"))
  // Merge default user properties with current
  $.extend(user, sess.getCurrentUser())
  // show user name
  $("#user_name_id").html(user.nm)
  // create a map in the "map" div
  // var google = L.tileLayer(
  //   "http://mt1.google.com/vt/lyrs=y&x={x}&y={y}43&z={z}",
  //   {
  //     attribution: "&copy; Google Maps",
  //   }
  // )
  var gurtam = L.tileLayer.webGis(sess.getBaseGisUrl(), {
    attribution: "&copy; YTM Maps",
    minZoom: 4,
    userId: user.id,
  })
  var osm = L.tileLayer("https://{s}.tile.osm.org/{z}/{x}/{y}.png", {
    attribution:
      "&copy; <a href='https://osm.org/copyright'>OpenStreetMap</a> contributors",
  })
  map = L.map("map_id", { layers: [gurtam] }).setView(
    [37.9600766, 58.3260629],
    14
  )
  map.zoomControl.setPosition("bottomright")

  // Create custom layer control with icon
  var layersControl = L.control.layers(
    {
      "YTM Maps": gurtam,
      OpenStreetMap: osm,
    },
    {},
    { position: "bottomleft" }
  )

  // Add custom class to the control for styling
  layersControl.addTo(map)

  // Add map icon to the layers control
  setTimeout(function () {
    var layersElement = document.querySelector(".leaflet-control-layers")
    if (layersElement) {
      var icon = document.createElement("div")
      icon.className = "map-type-icon"
      icon.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>'
      layersElement.insertBefore(icon, layersElement.firstChild)
    }
  }, 100)
  // try to define user locale
  sess.execute(
    "user/get_locale",
    { params: { userId: user.id } },
    function (data) {
      if (data && "wd" in data) {
        $.extend(user.locale, data)
      }
      initEnv()
    }
  )
  // Call window resize
  onResize()
}

// Init SDK
function initSdk() {
  W.logger(translate("initialize sdk"))
  var url =
    getHtmlVar("baseUrl") || getHtmlVar("hostUrl") || "https://gps.ytm.tm"
  var authHash = getHtmlVar("authHash")
  var sid = getHtmlVar("sid")
  // Init wialon session
  sess = new W.Session(url, { eventsTimeout: 5 })
  if (authHash) {
    sess.execute("core/use_auth_hash", { authHash: authHash }, login)
  } else if (sid) {
    var user = getHtmlVar("user") || ""
    sess.execute(
      "core/duplicate",
      { operateAs: user, continueCurrentSession: true, sid: sid },
      login
    )
  }
}

// Remove track or marker
function removeAdds() {
  // clear track or marker if needed
  if (map && (adds instanceof L.Polyline || adds instanceof L.Marker)) {
    map.removeLayer(adds)
  }
}

// We are ready now
function onLoad() {
  // Apply theme based on URL parameter
  applyTheme()

  // load translations - default to Russian
  var lang = getHtmlVar("lang") || "ru"
  if (["en", "ru"].indexOf(lang) == -1) {
    lang = "ru"
  }

  $.localise("lang/", { language: lang })
  translate = $.localise.tr

  // Enable debug messages
  W.debug = false

  // Try to initialize SDK
  initSdk()
}

// Toggle drawer function
function toggleDrawer() {
  $("#drawer").toggleClass("open")

  // Create overlay if it doesn't exist
  if ($(".drawer-overlay").length === 0) {
    $("body").append('<div class="drawer-overlay"></div>')

    // Add click event to close drawer when overlay is clicked
    $(".drawer-overlay").on("click", function () {
      $("#drawer").removeClass("open")
      $(this).removeClass("open")
    })
  }

  // Create header with search and close button if it doesn't exist
  if ($(".drawer-header").length === 0) {
    // Move the existing search input into a new header
    $("#units_filter").wrap('<div class="drawer-header"></div>')

    // Add close button to header
    $(".drawer-header").append(
      '<button id="drawer-close" class="drawer-close" aria-label="Close drawer"></button>'
    )

    // Add click event to close drawer when close button is clicked
    $("#drawer-close").on("click", function () {
      $("#drawer").removeClass("open")
      $(".drawer-overlay").removeClass("open")
    })
  }

  // Toggle overlay
  $(".drawer-overlay").toggleClass("open")
}

// Handle bottom sheet functionality
function initBottomSheet() {
  var bottomSheet = $(".bottom-sheet")
  var handle = $(".bottom-sheet-handle")
  var content = $(".bottom-sheet-content")
  var closeBtn = $(".bottom-sheet-close")
  var startY,
    startHeight,
    startTransform,
    isDragging = false,
    lastTouchTime = 0,
    lastTouchY = 0
  var windowHeight = window.innerHeight
  var minHeight = 120 // Height of collapsed header
  var maxHeight = windowHeight * 0.8 // 80% of window height
  var snapThreshold = windowHeight * 0.3 // Threshold for snapping

  // Initialize mobile column headers
  $("#mobile-type-col").html($("#type_col").html())
  $("#mobile-start-col").html($("#start_col").html())
  $("#mobile-time-col").html($("#time_col").html())
  $("#mobile-distance-col").html($("#distance_col").html())
  $("#mobile-avg-speed-col").html($("#avg_speed_col").html())
  $("#mobile-max-speed-col").html($("#max_speed_col").html())

  // Initialize mobile timepicker
  $("#mobile-btn-yesterday").html($("#btn-yesterday").html())
  $("#mobile-btn-today").html($("#btn-today").html())
  $("#mobile-btn-week").html($("#btn-week").html())
  $("#mobile-btn-month").html($("#btn-month").html())

  // Sync mobile events table with desktop
  $("#mobile-events-descr").html($("#events_descr").html())

  // Function to get current transform value
  function getTransformValue() {
    var transform = bottomSheet.css("transform");
    if (transform === "none") return 0;

    var matrix = transform.match(/matrix\((.+)\)/);
    if (matrix) {
      var values = matrix[1].split(', ');
      return parseInt(values[5]) || 0;
    }
    return 0;
  }

  // Function to set sheet position
  function setSheetPosition(position) {
    bottomSheet.css("transform", "translateY(" + position + "px)");
  }

  // Function to expand the sheet
  function expandSheet() {
    bottomSheet.addClass("expanded");
    setSheetPosition(0);
  }

  // Function to collapse the sheet
  function collapseSheet() {
    bottomSheet.removeClass("expanded");
    setSheetPosition(windowHeight - minHeight);
    bottomSheet.css("height", "70%"); // Reset to default height
  }

  // Handle touch start on the handle or content
  handle.on("touchstart", handleTouchStart);
  content.on("touchstart", function(e) {
    // Only handle touch start if we're touching near the top of the content
    if (e.originalEvent.touches[0].clientY - content.offset().top < 50) {
      handleTouchStart(e);
    }
  });

  function handleTouchStart(e) {
    startY = e.originalEvent.touches[0].clientY;
    startHeight = bottomSheet.height();
    startTransform = getTransformValue();
    isDragging = true;
    bottomSheet.addClass("dragging");

    // Detect double tap
    var now = new Date().getTime();
    var timeSince = now - lastTouchTime;
    var touchY = e.originalEvent.touches[0].clientY;
    var yDiff = Math.abs(touchY - lastTouchY);

    if (timeSince < 300 && yDiff < 20) {
      // Double tap detected
      if (bottomSheet.hasClass("expanded")) {
        collapseSheet();
      } else {
        expandSheet();
      }
      isDragging = false;
      bottomSheet.removeClass("dragging");
    }

    lastTouchTime = now;
    lastTouchY = touchY;

    e.preventDefault();
  }

  // Handle touch move
  $(document).on("touchmove", function (e) {
    if (!isDragging) return;

    var currentY = e.originalEvent.touches[0].clientY;
    var deltaY = currentY - startY;

    // Calculate new position
    var newTransform = Math.max(0, Math.min(windowHeight - minHeight, startTransform + deltaY));

    // Apply the transform
    setSheetPosition(newTransform);

    // Update expanded state based on position
    if (newTransform < (windowHeight - minHeight) / 2) {
      bottomSheet.addClass("expanded");
    } else {
      bottomSheet.removeClass("expanded");
    }
  });

  // Handle touch end
  $(document).on("touchend touchcancel", function (e) {
    if (!isDragging) return;

    isDragging = false;
    bottomSheet.removeClass("dragging");

    var currentTransform = getTransformValue();

    // Snap to expanded or collapsed state
    if (currentTransform > snapThreshold) {
      collapseSheet();
    } else {
      expandSheet();
    }
  })

  // Handle click on the handle to expand the sheet
  handle.on("click", function () {
    if (!isDragging) {
      // Only expand the sheet when clicking the handle, don't collapse
      bottomSheet.addClass("expanded")
      bottomSheet.css("transform", "translateY(0)")
    }
  })

  // Handle close button
  closeBtn.on("click", function () {
    bottomSheet.removeClass("expanded")
    bottomSheet.css("transform", "translateY(calc(100% - " + minHeight + "px))")
  })

  // Sync events between desktop and mobile
  function syncEvents() {
    // Copy events from desktop to mobile
    $("#mobile-events-tbl").html($("#events_tbl").html())

    // Update mobile event handlers
    $("#mobile-events-tbl .row-name-trip").on("click", getDetailedEvent)
  }

  // Sync timepicker selection
  $(".timepicker td").on("click", function () {
    var period = $(this).data("period")

    // Update both desktop and mobile timepickers
    $("#btn-yesterday, #btn-today, #btn-week, #btn-month").removeClass("active")
    $(
      "#mobile-btn-yesterday, #mobile-btn-today, #mobile-btn-week, #mobile-btn-month"
    ).removeClass("active")

    if (period === 0) {
      $("#btn-yesterday, #mobile-btn-yesterday").addClass("active")
    } else if (period === 1) {
      $("#btn-today, #mobile-btn-today").addClass("active")
    } else if (period === 2) {
      $("#btn-week, #mobile-btn-week").addClass("active")
    } else if (period === 3) {
      $("#btn-month, #mobile-btn-month").addClass("active")
    }
  })

  // Add event listener for events table updates
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === "childList") {
        syncEvents()
      }
    })
  })

  // Start observing the events table
  observer.observe(document.getElementById("events_tbl"), { childList: true })

  // Initial sync
  syncEvents()
}

// Resize window event
function onResize() {
  var units_container = $("#units_container")
  var windowWidth = $(window).width()
  var windowHeight = $(window).outerHeight(true)
  var timePickerHeight = $("#timepicker").outerHeight(true)
  var headerHeight = $("#header").outerHeight(true)
  var mapContainer = $("#map_id")
  var bottomSheet = $(".bottom-sheet")

  // Set drawer height
  $("#drawer").css("height", windowHeight)

  // Different calculations for mobile vs desktop
  if (windowWidth <= 768) {
    // Mobile layout - full screen map
    $("#right_column").css({
      height: "100%",
      width: "100%",
      left: "0",
    })

    // Make map full height
    mapContainer.css("height", "100%")

    // Hide desktop timepicker (it's in the bottom sheet now)
    $("#timepicker").css("display", "none")

    // Set units container height in drawer
    units_container.css("height", windowHeight - 50) // 50px for filter

    // Adjust bottom sheet
    var minHeight = 120 // Height of collapsed header
    if (!bottomSheet.hasClass("expanded")) {
      bottomSheet.css(
        "transform",
        "translateY(calc(100% - " + minHeight + "px))"
      )
    }

    // Set mobile events container height
    $("#mobile-events-container").css(
      "height",
      "calc(100% - " + $("#mobile-timepicker").outerHeight(true) + "px)"
    )
  } else {
    // Desktop layout
    $("#left_column").css("height", "100%")
    $("#right_column").css({
      height: "100%",
      left: "40%",
      width: "auto",
    })

    // Adjust map height to leave space for timepicker
    mapContainer.css("height", "calc(100% - " + timePickerHeight + "px)")

    // Show desktop timepicker
    $("#timepicker").css("display", "block")

    // Set events container height
    $("#events_container").css("height", "100%")

    // Set units container height in drawer
    units_container.css("height", windowHeight - headerHeight - 50) // 50px for filter

    // Hide bottom sheet on desktop
    bottomSheet.css("display", "none")
  }
}

// Initialize mobile functionality
function initMobile() {
  // Initialize bottom sheet if on mobile
  if ($(window).width() <= 768) {
    initBottomSheet()
  }
}

$(document)
  .ready(function () {
    onLoad()
    // Initialize mobile functionality after everything else is loaded
    setTimeout(initMobile, 500)
  })
  // center unit on map
  .on("click", ".row-name", getDetailedInfo)
  // draw trip on map
  .on("click", ".row-name-trip", getDetailedEvent)
  .on("click", ".timepicker td", updatePeriod)
  .on("click", ".order", orderEvents)
  // toggle drawer
  .on("click", "#drawer-toggle", toggleDrawer)
  // search unit
  .on("keypress", "#units_filter", onSearch)
  .on("keyup", "#units_filter", onSearchChange)
  // Mobile timepicker
  .on("click", "#mobile-timepicker td", updatePeriod)

// Handle window resize and orientation change
$(window).resize(function () {
  onResize()

  // Re-initialize mobile functionality if switching to mobile view
  if ($(window).width() <= 768) {
    // Show bottom sheet
    $(".bottom-sheet").css("display", "flex")

    // Initialize bottom sheet if not already initialized
    if (!$(".bottom-sheet").hasClass("initialized")) {
      initBottomSheet()
      $(".bottom-sheet").addClass("initialized")
    }
  } else {
    // Hide bottom sheet on desktop
    $(".bottom-sheet").css("display", "none")
  }
})

window.addEventListener("orientationchange", function () {
  // Small delay to ensure the browser has completed the orientation change
  setTimeout(function () {
    onResize()

    // Re-initialize mobile functionality
    if ($(window).width() <= 768) {
      initBottomSheet()
    }
  }, 200)
})
