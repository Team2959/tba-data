var TBA = new tba("Krm8Gg4CDQHpCk8Dg7pJLXkqP77YQNkauQoawhSE5wZyBfGEb6iltLn7W12c6hWV");

// Example functions showing how to get lists of teams
function teamLists () {
    // Returns all teams on "page" 3
    var fromPage3 = TBA.teams(tba.pageNumber(3));
    // Returns all teams from 1993
    var from1993 = TBA.teams(tba.year(1993));
    // Returns all teams at the event with key "2019misjo"
    var fromEvent = TBA.teams(tba.eventKey("2019misjo"));
    // Returns all teams in a district
    var fromDistrict = TBA.teams(tba.districtKey("2019fim"));
    // Returns a lists of teams with a matching team key (should be just 1)
    var team2959 = TBA.teams(tba.teamKey("frc2959"));
    // Get a list of all teams
    var allTeams = TBA.teams();
    var cachePage3 = TBA.teams(tba.pageNumber(3));
  
    Logger.log("Total Requests Made: " + TBA.analytics.totalReqs());
    Logger.log("Overall Average Time: " + TBA.analytics.avgReqTime().toFixed(2) + "ms / request");
    Logger.log("Total Non-Cached Requests Made: " + TBA.analytics.nonCachedReqs());
    Logger.log("Non-Cached Average Time: " + TBA.analytics.avgNonCachedReqTime().toFixed(2) + "ms / request");
    Logger.log("Total Cached Requests Made: " + TBA.analytics.cachedReqs());
    Logger.log("Cached Average Time: " + TBA.analytics.avgCachedReqTime().toFixed(2) + "ms / request");
}

function testPagesSpeed () {
    var start = Date.now();
    var teams = TBA.teams();
    Logger.log(teams.length);
    Logger.log("Took " + (Date.now() - start).toFixed(2) + "ms");
    start = Date.now();
    var teams = TBA.teams();
    Logger.log(teams.length);
    Logger.log("Took " + (Date.now() - start).toFixed(2) + "ms");
}

function teamAgesAtEvent () {
    var ages = []
    TBA.teams(tba.eventKey("2019misjo")).forEach(function (v, i, a) {
        var yrs = TBA.team(tba.teamKey(v.key)).yearsParticipated();
        ages.push(yrs.length);
    });
  
    var sheet = SpreadsheetApp.getActiveSheet();
    ages.forEach(function (v, i, a) {
        sheet.getRange(i+1,1).getCell(1,1).setValue(v);
    });
    Logger.log(ages.length);
    var chartBuilder = sheet.newChart();
    chartBuilder.addRange(sheet.getRange(1,1,ages.length));
    chartBuilder.setPosition(2,2,0,0);
    chartBuilder.setChartType(Charts.ChartType.HISTOGRAM);
    chartBuilder.setOption("historgram.bucketSize", 2);
    sheet.insertChart(chartBuilder.build());
}