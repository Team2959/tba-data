var TBA = new tba("Krm8Gg4CDQHpCk8Dg7pJLXkqP77YQNkauQoawhSE5wZyBfGEb6iltLn7W12c6hWV");
/*************************************************************************************/
//  defining arrays of headers to be used in queries



  var seasons_teams = ["key", "team_number", "nickname", "rookie_year", "city", "state_prov","country"];


/*************************************************************************************/

  function seasonsTeams () {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var testSheet = ss.getSheetByName("SeasonsTeams");
  var year = tba.year(2020);
  var ourData = TBA.team(year);//,tba.pageNumber(0));
  var sheetData = createTable(seasons_teams, ourData, true);
  
  testSheet.getRange(1,1,sheetData.length,seasons_teams.length).setValues(sheetData);
  
}  

//**********************************************************************************************
//
//  Assigned functions to spreadsheet buttons
//
//*********************************************************************************************

function btn_Status()
{
  makeFunctionBuilderCall(0);  
}

function btn_Award()
{
  makeFunctionBuilderCall(1);
}

function btn_District_List()
{
  makeFunctionBuilderCall(2);
}

function btn_District_Ranking()
{
  makeFunctionBuilderCall(3);
}

function btn_Elimination_Alliance()
{
  makeFunctionBuilderCall(4);
}

function btn_Event()
{
  makeFunctionBuilderCall(5);
}

function btn_Event_District_Points()
{
  makeFunctionBuilderCall(6);
}

function btn_Event_Insights()
{
  makeFunctionBuilderCall(7);
}

function btn_Event_Keys_Array()
{
  makeFunctionBuilderCall(8);
}

function btn_Event_OPRs()
{
  makeFunctionBuilderCall(9);
}

function btn_Event_Predictions()
{
  makeFunctionBuilderCall(10);
}

function btn_Event_Ranking()
{
  makeFunctionBuilderCall(11);
}

function btn_Event_Simple()
{
  makeFunctionBuilderCall(12);
}

function btn_Match()
{
  makeFunctionBuilderCall(13);
}

function btn_Match_Keys_Array()
{
  makeFunctionBuilderCall(14);
}

function btn_Match_Simple()
{
  makeFunctionBuilderCall(15);
}

function btn_Media()
{
  makeFunctionBuilderCall(16);
}

function btn_Team()
{
  makeFunctionBuilderCall(17);
}

function btn_Team_Event_Status()
{
  makeFunctionBuilderCall(18);
}

function btn_Team_Keys_Array()
{
  makeFunctionBuilderCall(19);
}

function btn_Team_Robot()
{
  makeFunctionBuilderCall(20);
}

function btn_Team_Simple()
{
  makeFunctionBuilderCall(21);
}

function btn_Time_Series()
{
  makeFunctionBuilderCall(22);
}

function btn_Years_Participated_Array()
{
  makeFunctionBuilderCall(23);
}

function makeFunctionBuilderCall(thisBtnRow)
{
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabNameValid = ss.getRangeByName("TabNameValidations").getValues();
  var parametersValid = ss.getRangeByName("FunctionValidations").getValues();
  var tabNames = ss.getRangeByName("TabNames").getValues();
  var parameters = ss.getRangeByName("FunctionParameters").getValues();

  if (tabNameValid[thisBtnRow][0] == false)
  {
    showInvalidTabName();    
    return;
  }


  if (!(parametersValid[thisBtnRow][0] || parametersValid[thisBtnRow][1] || parametersValid[thisBtnRow][2] || parametersValid[thisBtnRow][3]))
  {
    showInvalidParameters(); 
    return;
  }
  var event_key = (parameters[thisBtnRow][0] != "" ? tba.eventKey(parameters[thisBtnRow][0]):null);
  var team_key = (parameters[thisBtnRow][1] != "" ? tba.teamKey(parameters[thisBtnRow][1]):null);
  var year = (parameters[thisBtnRow][2] != "" ? tba.year(parameters[thisBtnRow][2]):null);
  var district_key = (parameters[thisBtnRow][3] != "" ? tba.districtKey(parameters[thisBtnRow][3]):null);
  var page_num = (parameters[thisBtnRow][4] != "" ? tba.pageNumber(parameters[thisBtnRow][4]):null);
  var match_key = (parameters[thisBtnRow][5] != "" ? tba.matchKey(parameters[thisBtnRow][5]):null);
//  var media_tag = (parameters[thisBtnRow][6] != "" ? tba.mediaTag(parameters[thisBtnRow][6]):null);

  var data_is_kvps = true;

  switch(thisBtnRow) {
    case 0:
      var ourData = TBA.api_status();
      break;
    case 1:
      var ourData = TBA.award(event_key, team_key, year);
      break;
    case 2:
      var ourData = TBA.district_list(team_key, year);
      break;
    case 3:
      var ourData = TBA.district_ranking(district_key);
      break;
    case 4:
      var ourData = TBA.elimination_alliance(event_key);
      break;
    case 5:
      var ourData = TBA.event(event_key, team_key, year, district_key);
      break;
    case 6:
      var ourData = TBA.event_district_points(event_key);
      break;
    case 7:
      var ourData = TBA.event_insights(event_key);
      break;
    case 8:
      var ourData = TBA.event_keys_array(team_key, year, district_key);
      data_is_kvps = false;
      break;
    case 9:
      var ourData = TBA.event_oprs(event_key);
      break;
    case 10:
      var ourData = TBA.event_predictions(event_key);
      break;
    case 11:
      var ourData = TBA.event_ranking(event_key);
      break;
    case 12:
      var ourData = TBA.event_simple(event_key);
      break;
    case 13:
      var ourData = TBA.match(event_key, team_key, year, match_key);
      break;
    case 14:
      var ourData = TBA.match_keys_array(event_key, team_key, year);
      data_is_kvps = false;
      break;
    case 15:
      var ourData = TBA.match_simple(event_key, team_key, year, match_key);
      break;
    case 17:
      var ourData = TBA.team(event_key, team_key, year, district_key, page_num);
      break;
    case 18:
      var ourData = TBA.team_event_status(event_key, team_key, year);
      break;
    case 19:
      var ourData = TBA.team_keys_array(event_key, year, district_key, page_num);
      data_is_kvps = false;
      break;
    case 20:
      var ourData = TBA.team_robot(team_key);
      break;
    case 21:
      var ourData = TBA.team_simple(event_key, team_key, year, district_key, page_num);
      break;
    case 23:
      var ourData = TBA.years_participated_array(team_key);
      data_is_kvps = false;
      break;
    default:
      var ui = SpreadsheetApp.getUi(); // Same variations.
      ui.alert(
       'Error',
       'TBA Call not implemented for this value.',
        ui.ButtonSet.OK);
      return;
      break;
  }

  Logger.log(ourData);
  // call function to see if tab exists.  If it doesn't then create it
  var outputSheet = createTab(ss, tabNames[thisBtnRow][0]);
  
  // if it exists, grab the header row of the tab
  try
  {
    var headerRowValues = outputSheet.getSheetValues(1,1,1, -1);
    var headerRow = headerRowValues[0];
  }
  catch(err)
  {
    // if the outputSheet is currently blank, then have the header row
    // include every key possible.  
    var headerRow = [];
    for (var key in ourData[0]) {
      headerRow.push(key);
    }
  }
  Logger.log (headerRow);
  if(data_is_kvps)
  {
    // create a table that contains only the data that matches keys in the headerRow array
    var sheetData = createTable(headerRow, ourData, true);
    Logger.log (sheetData);
    outputSheet.clear();  // This deletes everything 
    outputSheet.getRange(1,1,sheetData.length,headerRow.length).setValues(sheetData);  
  }
  else
  {
    var sheetData = ourData.map(function(num) {
      return [num];
    })
    outputSheet.clear();  // This deletes everything 
    outputSheet.getRange(1,1,sheetData.length, 1).setValues(sheetData);
  }
}


function createTab (ss, name)
// if a tab already exists in the workbook, nothing happens.  If it does
// not exist, then a new tab is created.
{
  if (ss.getSheetByName(name) == null)
  {
    ss.insertSheet(name);
  }
  return ss.getSheetByName(name);
}

function showInvalidTabName() {
  var ui = SpreadsheetApp.getUi(); // Same variations.

  ui.alert(
     'Error',
     'The Output Tab Name entered is not valid.',
      ui.ButtonSet.OK);

}

function showInvalidParameters() {
  var ui = SpreadsheetApp.getUi(); // Same variations.

  ui.alert(
     'Error',
     'The parameters entered are not valid.',
      ui.ButtonSet.OK);

}



function createTable (headers, data, includeHeaders){
  var result = data.map(function (v) {
    return headers.map(function (w) {
      return v[w];
    });
  });
  if (includeHeaders) {
    result.unshift(headers);
  }
  
  return result;
}


  function testMiranda () {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var testSheet = ss.getSheetByName("Test Output");
    // tba.teamKey("frc2959")
    // tba.eventKey("2019misjo")
    // tba.pageNumber(0)
    // tba.districtKey("2019fim")
    // tba.year(2019)	
    // tba.matchKey("2019misjo_qm1")
  var ourData = TBA.team(tba.pageNumber(0));
 Logger.log(ourData);
  var i = 0;
  var sheetData = [];
  for (i=0; i<ourData.length; i++)
  {
    sheetData.push([JSON.stringify(ourData[i])]);
  }
  
  testSheet.clear();  // This deletes everything 
  Logger.log([sheetData]);
  
  testSheet.getRange(1,1,ourData.length).setValues(sheetData);
  
}  
  
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

function testArgSort() {
  var x = function (args_) {
    Logger.log(arguments);
    arguments.sort(function (a, b) { 
      if (a.type.name < b.type.name) return -1;
      if (b.type.name < a.type.name) return 1;
      return 0;
    });
    Logger.log(arguments);
  };
  x(tba.year(1996), tba.eventKey("2959frc"));
}