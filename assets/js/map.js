/* HTML and js from City Feedback Hub
github.com/hep7agon/city-feedback-hub */
var apiBase = "http://localhost:8000/v1"

"use strict";

var legend = L.control({position: "bottomright"});
var markersLayer = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 12
});
// Coordinates for Heatmap
var markerCoordinates = [];
var heatLayer = null;
var userLocation = null;

// Feedback type definitions
var feedbackTypes = {
    "option-0-0": "bench",
    "option-0-1": "bench",
    "option-1-0": "flowers",
    "option-2-0": "trash",
    "option-2-1": "trash",
    "option-2-2": "trash",
    "comment": "comment"};
var feedbackCaptions = {
    bench: "Istuimet",
    flowers: "Kukat ja istutukset",
    trash: "Jäteastiat",
    comment: "Kommentit"};
var feedbackIcons = {
    bench: L.MakiMarkers.icon({icon: "circle", color: "#D4251C", size: "m"}),
    flowers: L.MakiMarkers.icon({icon: "circle", color: "#16A427", size: "m"}),
    trash: L.MakiMarkers.icon({icon: "circle", color: "#FA33E6", size: "m"}),
    comment: L.MakiMarkers.icon({icon: "circle", color: "#FFC61E", size: "m"})};
var unknownFeedbackIcon = L.MakiMarkers.icon({icon: "circle", color: "#FFC61E", size: "l"});
var centerIcon = L.MakiMarkers.icon({icon: "circle", color: "#0072C6", size: "l"});

var HelsinkiCoord = {lat: 60.240, lng: 25.090};

var map = initMap();
// Localisation initiation for datepickers
moment.locale('fi');

function defaultQuery() {
    // Initial query is the same than the attributes in the sidebar
    // I.e. all open feedback from one year ago until the current date 
    var params = {};

    /*var start_date = moment().subtract(12, 'months').toISOString();
    params["start_date"] = start_date;

    var end_date = moment().toISOString();
    params["end_date"] = end_date;*/

    params["hearing"] = "budjetointipeli";
    getData(params, true);
}

function initMap() {
    // Bounds from Helsinki's Servicemap code (https://github.com/City-of-Helsinki/servicemap/)
    var bounds = L.bounds(L.point(-548576, 6291456), L.point(1548576, 8388608));

    var crs = function () {
        var bounds, crsName, crsOpts, originNw, projDef;
        crsName = 'EPSG:3067';
        projDef = '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
        bounds = L.bounds(L.point(-548576, 6291456), L.point(1548576, 8388608));
        originNw = [bounds.min.x, bounds.max.y];
        crsOpts = {
            resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125],
            bounds: bounds,
            transformation: new L.Transformation(1, -originNw[0], -1, originNw[1])
        };
        return new L.Proj.CRS(crsName, projDef, crsOpts);
    }

    var map = L.map('map', {
        crs: crs(),
        zoomControl: false,
        maxZoom: 15
    }).setView([HelsinkiCoord.lat, HelsinkiCoord.lng], 11);

    map.addControl(L.control.zoom({position: 'topright'}));

    L.tileLayer("http://geoserver.hel.fi/mapproxy/wmts/osm-sm/etrs_tm35fin/{z}/{x}/{y}.png", {
        attribution: 'Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
        maxZoom: 18,
        continuousWorld: true,
        tms: false
    }).addTo(map);

    return map;
}

function addLegend(params) {
    try {
        legend.removeFrom(map);
    }
    catch (fail) {}
    legend.onAdd = function (map) {
        var div = L.DomUtil.create("div", "map-legend");
        div.innerHTML += "<h5 class='text-center' style='margin: 3px 0px'>Selite</h5>";
        if (params.feedback_type) {
            div.innerHTML += "<i style='background: #" +
                feedbackIcons[params.feedback_type].options.color
                + "'></i>" + feedbackCaptions[params.feedback_type] + "<br>";
        }
        else {
            $.each(feedbackIcons, function(key, icon) {
                div.innerHTML += "<i style='background: #" + icon.options.color + "'></i>" + feedbackCaptions[key] + "<br>";
            });
        }
        div.innerHTML += "<i style='background: #0072C6'></i>" + "Sijaintisi<br>";
        // div.innerHTML += "<i style='background: #FFC61E'></i>" + "Uusi palaute<br>";
        return div;
    }.bind(this);
    legend.addTo(map);
}

function clearMarkers() {
    // Coordinates for Heatmap
    if (markerCoordinates.length > 0) {
        markerCoordinates.length = 0;
    }

    if (heatLayer) {
        map.removeLayer(heatLayer);
    }

    markersLayer.clearLayers();
}

function getData(params, markersVisible, heatmapVisible, onSuccess) {
    var hearingUrl = apiBase + "/hearing/" + params.hearing;
    $.getJSON(hearingUrl, params, function (hearing_data) {
        // fetch the hearing section id that has plugin data
        $.each(hearing_data.sections, function (key, section) {
            // fetch data for all plugin sections
            if (section.plugin_identifier == "mapdon-hkr") {
                // console.log(section.plugin_data);
                var dataUrl = hearingUrl + "/sections/" + section.id + "/comments/?include=plugin_data";
                if (params.auth_code) {
                    dataUrl += "&auth_code=" + params.auth_code;
                }
                $.getJSON(dataUrl, params, function (data) {
                    clearMarkers();

                    $.each(data, function (key, comment) {
                        var plugin_data = $.parseJSON(comment.plugin_data);

                        $.each(plugin_data, function (key, feedback) {
                            if (params.feedback_type) {
                                if (feedbackTypes[feedback.key] != params.feedback_type) {
                                    return
                                }
                            }
                            var popupOptions =
                            {
                                'maxWidth': '250',
                                'maxHeight': '250',
                                'className': 'custom',
                                'autoPanPadding': L.point(10, 25)
                            }

                            // Generate popup-window content
                            var popupContent = "";

                            popupContent += "<h4 id=\"feedback_title\"></h4>" +
                                "<div id=\"feedback_requested_datetime\"></div>" +
                                "<p id=\"feedback_description\"></p>" +
                                "<a id=\"feedback_details\" href=\"\"></a>";

                            // Initiate marker of feedback
                            var marker = L.marker([feedback.lat, feedback.lng]).bindPopup(popupContent, popupOptions).addTo(markersLayer);
                            marker.feedback = feedback;
                            markerCoordinates.push([feedback.lat, feedback.lng]);

                            // Assign icon to marker based on feedback type
                            try {
                                marker.setIcon(feedbackIcons[feedbackTypes[feedback.key]]);
                            }
                            catch (fail) {
                                marker.setIcon(unknownFeedbackIcon);
                            }

                            // On click, fill the popup with feedback details
                            marker.on('click', function (e) {
                                // Truncate feedback details so that they fit the popup window
                                var title = e.target.feedback.value;
                                title = truncate_string(title, 50);

                                $('#feedback_title').text(title);
                                $('.feedback_list_vote_badge').text(e.target.feedback.vote_counter);
                                $('.feedback_list_vote_icon').attr("id", e.target.feedback.service_request_id);
                                var datetime = moment(e.target.feedback.requested_datetime).fromNow();
                                $('#feedback_requested_datetime').text("Lisätty: " + datetime);

                                var desc = e.target.feedback.value;
                                // desc = truncate_string(desc, 170);

                                $('#feedback_description').text(desc);
                                var feedback_url = "/feedbacks/" + e.target.feedback.id;
                                // $('#feedback_details').text("Lisää");
                                $('#feedback_details').attr("href", feedback_url);
                                $('#feedback_info').css("visibility", "visible");
                            });
                        });
                    });
                }).always(function () {
                    if (onSuccess) {
                        onSuccess();
                    }
                }).done(function () {
                    if (markersVisible) {
                        showMarkers(markersVisible);
                    }

                    if (heatmapVisible) {
                        showHeatmap(heatmapVisible);
                    }
                    addLegend(params);
                });
            }
        });
    });

}

function truncate_string(string, max_length) {
    if(string.length > max_length) {
        return string.substring(0,max_length) + "...";
    }

    return string;
}

function getUserLocation(e) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var newLocation = L.latLng(position.coords.latitude, position.coords.longitude);
            if (userLocation) {
                userLocation.setLatLng(newLocation);
            }
            else {
                userLocation = new L.marker(newLocation, {icon: centerIcon}).addTo(map);
            }
            map.panTo(newLocation);
        }.bind(this));
    }
    else {
        console.error("Geolocation is not supported by this browser.");
    }
}

function showMarkers(show) {
    if (show) {
        map.addLayer(markersLayer);
    }
    else {
        if (map.hasLayer(markersLayer)) {
            map.removeLayer(markersLayer);
        }
    }
}

function showHeatmap(show) {
    if (heatLayer) {
        map.removeLayer(heatLayer);
    }

    if (show) {
        heatLayer = L.heatLayer(markerCoordinates, {
            minOpacity: 0.4,
            maxZoom: 18,
            radius: 30,
            blur: 20,
        }).addTo(map);
    }
}

function onToggleMenu() {
    $("#sidebar-wrapper").toggleClass("toggled");
    $("#toggleButtonContainer").toggleClass("toggled");
    $("#toggleButtonIcon").toggleClass("glyphicon-chevron-left glyphicon-chevron-right");
}